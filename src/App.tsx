import type { Session } from '@supabase/supabase-js';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Download, ListChecks, Map as MapIcon, Menu as MenuIcon, Pencil, Plus, Printer, Route, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Checklist } from './components/Checklist';
import { Itinerary } from './components/Itinerary';
import { KakaoMapArea } from './components/KakaoMapView';
import { GoogleMapArea } from './components/MapView';
import { GoogleSetupNotice, KakaoSetupNotice } from './components/mapShared';
import { PrintView } from './components/PrintView';
import { Sidebar, type Account } from './components/Sidebar';
import { TripDialog } from './components/TripDialog';
import { ConfirmDialog, Menu, ToastView } from './components/ui';
import { GOOGLE_MAPS_API_KEY, hasGoogleMaps, hasKakaoMaps } from './config';
import { LocalBackend, SupabaseBackend, type Backend } from './lib/backend';
import { LegsProvider } from './lib/legs';
import { StoreProvider, useStore } from './lib/store';
import { supabase } from './lib/supabase';
import { providerFor, type DayKey, type MapProvider, type PlaceInput, type Stop, type TripDay } from './lib/types';
import { byPosition, downloadJson, safeStorage, tripRangeLabel } from './lib/utils';

const storage = safeStorage();
const SELECTED_TRIP_KEY = 'tripline:selected-trip';

export default function App() {
  if (!supabase) return <Root backend={localBackend} account={null} />;
  return <AuthGate />;
}

const localBackend = new LocalBackend();

function AuthGate() {
  const client = supabase!;
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const userId = session?.user.id;
  const backend = useMemo(() => (userId ? new SupabaseBackend(client, userId) : null), [client, userId]);

  if (session === undefined) return <div className="splash">불러오는 중…</div>;
  if (!session || !backend) return <AuthScreen client={client} />;
  return (
    <Root
      backend={backend}
      account={{ email: session.user.email ?? '로그인됨', signOut: () => void client.auth.signOut() }}
    />
  );
}

function Root({ backend, account }: { backend: Backend; account: Account | null }) {
  const content = (
    <StoreProvider backend={backend}>
      <Workspace account={account} />
    </StoreProvider>
  );
  return hasGoogleMaps ? (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="ko" region="KR">
      {content}
    </APIProvider>
  ) : (
    content
  );
}

function Workspace({ account }: { account: Account | null }) {
  const { db, loadError, reload, toast, dismissToast, showToast, actions } = useStore();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(() => storage.get(SELECTED_TRIP_KEY));
  const [dayKeys, setDayKeys] = useState<Record<string, DayKey>>({});
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'plan' | 'pack'>('plan');
  const [mobileView, setMobileView] = useState<'plan' | 'map'>('plan');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState<null | 'new' | 'edit' | 'delete-trip'>(null);
  const [dayToDelete, setDayToDelete] = useState<TripDay | null>(null);

  const trips = useMemo(() => [...(db?.trips ?? [])].sort(byPosition), [db?.trips]);
  const trip = trips.find((t) => t.id === selectedTripId) ?? trips[0] ?? null;
  // 국내 여행은 카카오맵, 해외 여행은 구글 지도
  const provider: MapProvider = trip ? providerFor(trip.region) : hasKakaoMaps || !hasGoogleMaps ? 'kakao' : 'google';

  useEffect(() => {
    if (trip) storage.set(SELECTED_TRIP_KEY, trip.id);
  }, [trip]);

  const days = useMemo(
    () => (trip ? (db?.trip_days ?? []).filter((d) => d.trip_id === trip.id).sort(byPosition) : []),
    [db?.trip_days, trip],
  );
  const tripStops = useMemo(() => (trip ? (db?.stops ?? []).filter((s) => s.trip_id === trip.id) : []), [db?.stops, trip]);
  const checklist = useMemo(
    () => (trip ? (db?.checklist_items ?? []).filter((c) => c.trip_id === trip.id) : []),
    [db?.checklist_items, trip],
  );

  const storedKey = trip ? dayKeys[trip.id] : undefined;
  const dayKey: DayKey =
    storedKey === 'inbox' || (storedKey && days.some((d) => d.id === storedKey)) ? storedKey : days[0]?.id ?? 'inbox';
  const day = days.find((d) => d.id === dayKey) ?? null;
  const dayStops = useMemo(
    () => (day ? tripStops.filter((s) => s.day_id === day.id).sort(byPosition) : []),
    [tripStops, day],
  );

  const setDayKey = useCallback(
    (k: DayKey) => {
      if (!trip) return;
      setDayKeys((m) => ({ ...m, [trip.id]: k }));
      setSelectedStopId(null);
      setShowAll(false);
    },
    [trip],
  );

  const selectTrip = (id: string) => {
    setSelectedTripId(id);
    setSelectedStopId(null);
    setShowAll(false);
    setTab('plan');
  };

  const addPlaceFromMap = (p: PlaceInput) => {
    if (!trip) return;
    const id = actions.addStop(trip.id, day?.id ?? null, p);
    setSelectedStopId(id);
    setTab('plan');
    showToast(`${p.name}을(를) ${day ? `${day.position + 1}일차` : '보관함'}에 추가했어요`);
  };

  const onSelectStopFromMap = (s: Stop) => {
    if (s.day_id !== (day?.id ?? null)) {
      if (trip) setDayKeys((m) => ({ ...m, [trip.id]: s.day_id ?? 'inbox' }));
    }
    setSelectedStopId(s.id);
    setTab('plan');
    setMobileView('plan');
  };

  if (loadError) {
    return (
      <div className="splash">
        <p>여행 데이터를 불러오지 못했어요.</p>
        <p className="splash-detail">{loadError}</p>
        <p className="splash-detail">Supabase에서 supabase/schema.sql을 실행했는지 확인해 주세요.</p>
        <button type="button" className="btn btn-primary" onClick={reload}>
          다시 불러오기
        </button>
      </div>
    );
  }
  if (!db) return <div className="splash">불러오는 중…</div>;

  const mapProps = {
    trip,
    days,
    stops: tripStops,
    dayKey,
    showAll,
    onShowAll: setShowAll,
    selectedStopId,
    onSelectStop: onSelectStopFromMap,
    onAddPlace: addPlaceFromMap,
    addLabel: day ? `${day.position + 1}일차에 추가` : '보관함에 추가',
  };

  const visited = tripStops.filter((s) => s.day_id && s.visited).length;
  const scheduled = tripStops.filter((s) => s.day_id).length;
  const packed = checklist.filter((c) => c.done).length;

  return (
    <LegsProvider provider={provider} stops={dayStops} mode={day?.travel_mode ?? 'TRANSIT'}>
      <div className="app" data-mobile-view={mobileView}>
        <Sidebar
          selectedTripId={trip?.id ?? null}
          onSelect={selectTrip}
          onNewTrip={() => setDialog('new')}
          account={account}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

        <main className="panel">
          <div className="mobile-bar">
            <button type="button" className="mobile-trips-btn" onClick={() => setSidebarOpen(true)}>
              <MenuIcon size={18} /> 여행 목록 <span className="count">{trips.length}</span>
            </button>
          </div>

          {trip ? (
            <>
              <header className="trip-head" style={{ ['--trip' as string]: trip.color }}>
                <div className="trip-head-text">
                  <h1>{trip.title}</h1>
                  <p>
                    {trip.destination && <span>{trip.destination}</span>}
                    <span>{tripRangeLabel(trip, days.length)}</span>
                    <span className="trip-provider">{provider === 'kakao' ? '국내, 카카오맵' : '해외, 구글 지도'}</span>
                  </p>
                </div>
                <button type="button" className="icon-btn" onClick={() => setDialog('edit')} aria-label="여행 정보 수정" title="여행 정보 수정">
                  <Pencil size={17} />
                </button>
                <Menu
                  label="여행 메뉴"
                  items={[
                    { label: '인쇄 또는 PDF로 저장', icon: <Printer size={15} />, onSelect: () => window.print() },
                    {
                      label: 'JSON 파일로 내보내기',
                      icon: <Download size={15} />,
                      onSelect: () => downloadJson(`${trip.title.replace(/[\\/:*?"<>|]/g, '_')}.tripline.json`, actions.exportTrips([trip.id])),
                    },
                    { label: '여행 삭제', icon: <Trash2 size={15} />, danger: true, onSelect: () => setDialog('delete-trip') },
                  ]}
                />
              </header>

              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>
                  <Route size={16} /> 일정
                  <span className="tab-meta">{scheduled ? `${visited}/${scheduled}` : ''}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'pack'} onClick={() => setTab('pack')}>
                  <ListChecks size={16} /> 준비물
                  <span className="tab-meta">{checklist.length ? `${packed}/${checklist.length}` : ''}</span>
                </button>
              </div>

              <div className="panel-scroll">
                {tab === 'plan' ? (
                  <Itinerary
                    trip={trip}
                    provider={provider}
                    days={days}
                    stops={tripStops}
                    dayKey={dayKey}
                    onDayKey={setDayKey}
                    selectedStopId={selectedStopId}
                    onSelectStop={setSelectedStopId}
                    onRequestDeleteDay={setDayToDelete}
                  />
                ) : (
                  <Checklist tripId={trip.id} />
                )}
              </div>
            </>
          ) : (
            <div className="welcome">
              <h1>어디로 떠나세요?</h1>
              <p>
                여행을 만들고 날짜별로 갈 곳을 검색해 넣으면, 지도 위에 그날의 동선이 노선도처럼 그려져요. 다녀온 곳은 하나씩
                체크하세요.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setDialog('new')}>
                <Plus size={16} /> 첫 여행 만들기
              </button>
            </div>
          )}
        </main>

        <section className="map-area" aria-label="지도">
          {provider === 'kakao' ? (
            hasKakaoMaps ? (
              <KakaoMapArea {...mapProps} />
            ) : (
              <KakaoSetupNotice />
            )
          ) : hasGoogleMaps ? (
            <GoogleMapArea {...mapProps} />
          ) : (
            <GoogleSetupNotice />
          )}
        </section>

        <nav className="mobile-switch" aria-label="화면 전환">
          <button type="button" aria-pressed={mobileView === 'plan'} onClick={() => setMobileView('plan')}>
            <Route size={17} /> 일정
          </button>
          <button type="button" aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}>
            <MapIcon size={17} /> 지도
          </button>
        </nav>
      </div>

      {trip && <PrintView trip={trip} days={days} stops={tripStops} checklist={checklist} />}

      <TripDialog
        open={dialog === 'new'}
        onClose={() => setDialog(null)}
        onSubmit={(input) => {
          const id = actions.createTrip(input);
          selectTrip(id);
        }}
      />
      <TripDialog
        open={dialog === 'edit'}
        trip={trip}
        dayCount={days.length}
        onClose={() => setDialog(null)}
        onSubmit={(input) =>
          trip &&
          actions.updateTrip(trip.id, {
            title: input.title.trim() || trip.title,
            destination: input.destination?.trim() || null,
            region: input.region,
            start_date: input.start_date,
            color: input.color,
          })
        }
      />
      <ConfirmDialog
        open={dialog === 'delete-trip'}
        title="여행을 삭제할까요?"
        message={
          trip ? (
            <>
              <b>{trip.title}</b>의 날짜, 장소 {tripStops.length}곳, 준비물이 모두 지워지고 되돌릴 수 없어요. 필요하면 먼저 JSON 파일로
              내보내 두세요.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="여행 삭제"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (!trip) return;
          actions.deleteTrip(trip.id);
          setSelectedTripId(null);
          showToast('여행을 삭제했어요');
        }}
      />
      <ConfirmDialog
        open={Boolean(dayToDelete)}
        title={dayToDelete ? `${dayToDelete.position + 1}일차를 삭제할까요?` : ''}
        message="이날의 장소는 지워지지 않고 보관함으로 옮겨져요. 뒤의 날짜는 하루씩 앞당겨져요."
        confirmLabel="날짜 삭제"
        onClose={() => setDayToDelete(null)}
        onConfirm={() => {
          if (!dayToDelete) return;
          actions.deleteDay(dayToDelete.id);
          setDayKey(days.find((d) => d.id !== dayToDelete.id)?.id ?? 'inbox');
        }}
      />
      <ToastView toast={toast} onDismiss={dismissToast} />
    </LegsProvider>
  );
}
