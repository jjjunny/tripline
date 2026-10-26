import { useMemo, type ReactNode } from 'react';
import type { DayKey, PlaceInput, Stop, Trip, TripDay } from '../lib/types';
import { INBOX_COLOR, byPosition, dayColor, hasCoords, type LatLng } from '../lib/utils';

/** 구글 지도와 카카오 지도가 같은 props 를 받음 */
export interface MapViewProps {
  trip: Trip | null;
  days: TripDay[];
  stops: Stop[];
  dayKey: DayKey;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
  selectedStopId: string | null;
  onSelectStop: (stop: Stop) => void;
  onAddPlace: (p: PlaceInput) => void;
  addLabel: string;
}

export interface Pin {
  stop: Stop & LatLng;
  /** 목록과 같은 번호 */
  n: number;
  color: string;
}

export interface Line {
  key: DayKey;
  color: string;
  pins: Pin[];
}

export const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };

/** 날짜별 노선과 지도에 보여 줄 역(장소) 목록 */
export function useMapLines(trip: Trip | null, days: TripDay[], stops: Stop[], dayKey: DayKey, showAll: boolean) {
  const lines = useMemo(() => {
    const groups: Line[] = [];
    const build = (key: DayKey, color: string) => {
      const list = stops.filter((s) => s.day_id === (key === 'inbox' ? null : key)).sort(byPosition);
      const pins: Pin[] = [];
      list.forEach((s, i) => {
        if (hasCoords(s)) pins.push({ stop: s, n: i + 1, color });
      });
      groups.push({ key, color, pins });
    };
    for (const d of days) build(d.id, dayColor(d.position));
    build('inbox', INBOX_COLOR);
    return groups;
  }, [stops, days]);

  const visible = useMemo(() => (showAll ? lines : lines.filter((l) => l.key === dayKey)), [lines, showAll, dayKey]);
  const pins = useMemo(() => visible.flatMap((l) => l.pins), [visible]);
  const color = visible.length === 1 ? visible[0].color : '#2F6FDB';
  /** 이 값이 바뀔 때만 지도를 장소들에 맞춰 다시 맞춤 */
  const fitKey = `${trip?.id}|${showAll ? 'all' : dayKey}|${pins.length}`;
  return { visible, pins, color, fitKey };
}

export function MapToggle({
  dayKey,
  showAll,
  onShowAll,
}: {
  dayKey: DayKey;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
}) {
  return (
    <div className="map-toggle" role="radiogroup" aria-label="지도에 표시할 범위">
      <button type="button" role="radio" aria-checked={!showAll} onClick={() => onShowAll(false)}>
        {dayKey === 'inbox' ? '보관함' : '이날 동선'}
      </button>
      <button type="button" role="radio" aria-checked={showAll} onClick={() => onShowAll(true)}>
        전체 일정
      </button>
    </div>
  );
}

export function MapNotice({ title, children, art = false }: { title: string; children: ReactNode; art?: boolean }) {
  return (
    <div className="map-wrap map-setup">
      {art && (
        <svg className="map-setup-art" viewBox="0 0 400 300" aria-hidden="true">
          <path
            d="M30 240 C 110 240, 90 90, 190 90 S 280 220, 370 60"
            fill="none"
            stroke="#C5CED8"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="2 14"
          />
          <circle cx="30" cy="240" r="10" fill="#fff" stroke="#8794A7" strokeWidth="4" />
          <circle cx="190" cy="90" r="10" fill="#fff" stroke="#8794A7" strokeWidth="4" />
          <circle cx="370" cy="60" r="10" fill="#fff" stroke="#8794A7" strokeWidth="4" />
        </svg>
      )}
      <div className="map-setup-card" role={art ? undefined : 'alert'}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** 국내 여행인데 카카오 키가 없을 때 */
export function KakaoSetupNotice() {
  return (
    <MapNotice title="카카오맵을 연결하면 국내 동선이 여기에 그려져요" art>
      <ol>
        <li>카카오디벨로퍼스에서 앱을 만들고, [앱] &gt; [제품 설정] &gt; [카카오맵]에서 사용 설정을 켜요.</li>
        <li>
          [앱] &gt; [플랫폼 키] &gt; [JavaScript 키]의 JavaScript SDK 도메인에 <code>http://localhost:5173</code>을 등록해요.
        </li>
        <li>
          <code>.env</code>에 <code>VITE_KAKAO_JS_KEY</code>(JavaScript 키)와 <code>KAKAO_REST_API_KEY</code>(REST API 키)를 적고
          개발 서버를 껐다 켜요.
        </li>
      </ol>
      <p>자세한 순서는 README.md의 “카카오맵 설정”을 보세요. 키가 없어도 일정과 준비물은 지금 바로 쓸 수 있어요.</p>
    </MapNotice>
  );
}

/** 해외 여행인데 구글 키가 없을 때 */
export function GoogleSetupNotice() {
  return (
    <MapNotice title="구글 지도를 연결하면 해외 동선이 여기에 그려져요" art>
      <ol>
        <li>Google Cloud에서 API 키를 만들고 Maps JavaScript API, Places API (New), Routes API를 사용 설정해요.</li>
        <li>
          <code>.env</code> 파일에 <code>VITE_GOOGLE_MAPS_API_KEY=발급받은키</code>를 적어요.
        </li>
        <li>개발 서버를 껐다 켜요.</li>
      </ol>
      <p>자세한 순서는 README.md의 “구글 지도 API 키 발급”을 보세요. 키가 없어도 일정과 준비물은 지금 바로 쓸 수 있어요.</p>
    </MapNotice>
  );
}

export const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
