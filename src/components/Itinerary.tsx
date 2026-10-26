import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bike,
  Car,
  Check,
  ExternalLink,
  Footprints,
  GripVertical,
  Inbox,
  Map as MapIcon,
  Plus,
  TrainFront,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { kakaoPlaceUrl } from '../lib/kakao';
import { useLegs, useLegsNotice, type Leg } from '../lib/legs';
import { useStore } from '../lib/store';
import type { DayKey, MapProvider, Stop, TravelMode, Trip, TripDay } from '../lib/types';
import {
  INBOX_COLOR,
  TRAVEL_MODES,
  byPosition,
  dayColor,
  dayDate,
  fmtDistance,
  fmtDuration,
  fmtLong,
  fmtShort,
  googleDirectionsUrl,
  googleLegUrl,
  googlePlaceUrl,
  hasCoords,
  isInKorea,
  kakaoLegUrl,
} from '../lib/utils';
import { PlaceSearch } from './PlaceSearch';
import { Menu, useDraft } from './ui';

export const MODE_ICON: Record<TravelMode, (size: number) => ReactNode> = {
  TRANSIT: (s) => <TrainFront size={s} />,
  DRIVING: (s) => <Car size={s} />,
  WALKING: (s) => <Footprints size={s} />,
  BICYCLING: (s) => <Bike size={s} />,
};

interface Props {
  trip: Trip;
  provider: MapProvider;
  days: TripDay[];
  stops: Stop[];
  dayKey: DayKey;
  onDayKey: (k: DayKey) => void;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  onRequestDeleteDay: (day: TripDay) => void;
}

export function Itinerary({ trip, provider, days, stops, dayKey, onDayKey, selectedStopId, onSelectStop, onRequestDeleteDay }: Props) {
  const { actions } = useStore();
  const day = dayKey === 'inbox' ? null : days.find((d) => d.id === dayKey) ?? null;
  const color = day ? dayColor(day.position) : INBOX_COLOR;
  const list = useMemo(
    () => stops.filter((s) => s.day_id === (day?.id ?? null)).sort(byPosition),
    [stops, day?.id],
  );
  const inboxCount = useMemo(() => stops.filter((s) => s.day_id === null).length, [stops]);

  useEffect(() => {
    document.querySelector(`[data-day-key="${dayKey}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [dayKey]);

  return (
    <div className="itinerary">
      <div className="daybar" role="tablist" aria-label="날짜">
        {days.map((d) => {
          const date = dayDate(trip, d);
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              data-day-key={d.id}
              aria-selected={d.id === dayKey}
              className="day-pill"
              style={{ ['--c' as string]: dayColor(d.position) }}
              onClick={() => onDayKey(d.id)}
            >
              <span className="day-num">{d.position + 1}</span>
              <span className="day-date">{date ? fmtShort(date) : `${d.position + 1}일차`}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="day-add"
          onClick={() => onDayKey(actions.addDay(trip.id))}
          aria-label="날짜 하루 추가"
          title="날짜 하루 추가"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          role="tab"
          data-day-key="inbox"
          aria-selected={dayKey === 'inbox'}
          className="day-pill is-inbox"
          onClick={() => onDayKey('inbox')}
        >
          <Inbox size={15} />
          <span className="day-date">보관함</span>
          {inboxCount > 0 && <span className="day-count">{inboxCount}</span>}
        </button>
      </div>

      {day ? (
        <DayHeader trip={trip} provider={provider} day={day} stops={list} onRequestDelete={() => onRequestDeleteDay(day)} />
      ) : (
        <div className="day-head" style={{ ['--c' as string]: color }}>
          <div className="day-head-top">
            <span className="line-badge is-inbox">
              <Inbox size={16} />
            </span>
            <div className="day-head-titles">
              <h2>보관함</h2>
              <p>가고 싶지만 아직 날짜를 정하지 않은 장소예요. 장소를 눌러 원하는 날로 옮기세요.</p>
            </div>
          </div>
        </div>
      )}

      <div className="add-stop">
        <PlaceSearch
          provider={provider}
          placeholder={day ? `${day.position + 1}일차에 갈 곳 검색` : '보관함에 담을 곳 검색'}
          onPick={(p) => onSelectStop(actions.addStop(trip.id, day?.id ?? null, p))}
        />
      </div>

      <StopList
        stops={list}
        days={days}
        trip={trip}
        provider={provider}
        color={color}
        mode={day?.travel_mode ?? 'TRANSIT'}
        isInbox={!day}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
      />
    </div>
  );
}

/* ---------------- 날짜 머리 ---------------- */

function DayHeader({
  trip,
  provider,
  day,
  stops,
  onRequestDelete,
}: {
  trip: Trip;
  provider: MapProvider;
  day: TripDay;
  stops: Stop[];
  onRequestDelete: () => void;
}) {
  const { actions } = useStore();
  const legs = useLegs();
  const notice = useLegsNotice();
  const date = dayDate(trip, day);
  const titleInput = useDraft(day.title ?? '', (v) => actions.updateDay(day.id, { title: v.trim() || null }));

  const visited = stops.filter((s) => s.visited).length;
  let ms = 0;
  let meters = 0;
  let okCount = 0;
  let missing = 0;
  let koreaNoRoute = false;
  for (const leg of legs.values()) {
    if (leg.status === 'ok') {
      okCount++;
      ms += leg.durationMillis ?? 0;
      meters += leg.distanceMeters ?? 0;
    } else if (leg.status !== 'loading') {
      missing++;
      if (leg.status === 'none' && (isInKorea(leg.from) || isInKorea(leg.to))) koreaNoRoute = true;
    }
  }
  const directions = googleDirectionsUrl(stops, day.travel_mode);

  return (
    <div className="day-head" style={{ ['--c' as string]: dayColor(day.position) }}>
      <div className="day-head-top">
        <span className="line-badge">{day.position + 1}</span>
        <div className="day-head-titles">
          <h2>{day.position + 1}일차</h2>
          <p>{date ? fmtLong(date) : '날짜 미정'}</p>
        </div>
        <Menu
          label="날짜 메뉴"
          items={[
            ...(directions
              ? [{ label: '이날 동선을 구글 지도에서 열기', icon: <ExternalLink size={15} />, href: directions }]
              : []),
            { label: '이 날짜 삭제', icon: <Trash2 size={15} />, danger: true, onSelect: onRequestDelete },
          ]}
        />
      </div>
      <input
        className="day-title-input"
        placeholder="이날의 테마 (예: 교토 당일치기)"
        aria-label="이날의 테마"
        maxLength={60}
        {...titleInput}
      />
      <div className="mode-switch" role="radiogroup" aria-label="이동 수단">
        {TRAVEL_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={day.travel_mode === m.value}
            className="mode-option"
            onClick={() => actions.updateDay(day.id, { travel_mode: m.value })}
          >
            {MODE_ICON[m.value](15)}
            {m.label}
          </button>
        ))}
      </div>
      <p className="day-summary">
        {stops.length === 0 ? (
          '아직 갈 곳이 없어요'
        ) : (
          <>
            <span>
              {stops.length}곳 중 <b>{visited}곳</b> 방문
            </span>
            {okCount > 0 && (
              <span>
                이동 <b>{fmtDuration(ms)}</b>, {fmtDistance(meters)}
                {missing > 0 && ' (경로 없는 구간 제외)'}
              </span>
            )}
          </>
        )}
      </p>
      {notice && <p className="day-hint is-info">{notice}</p>}
      {provider === 'google' && koreaNoRoute && day.travel_mode !== 'TRANSIT' && (
        <p className="day-hint">
          국내 구간은 구글의 {day.travel_mode === 'DRIVING' ? '자동차' : day.travel_mode === 'WALKING' ? '도보' : '자전거'} 경로가
          제공되지 않을 수 있어요. 여행 정보 수정에서 국내 여행으로 바꾸면 카카오로 계산해요.
        </p>
      )}
    </div>
  );
}

/* ---------------- 노선도 형태의 장소 목록 ---------------- */

function StopList({
  stops,
  days,
  trip,
  provider,
  color,
  mode,
  isInbox,
  selectedStopId,
  onSelectStop,
}: {
  stops: Stop[];
  days: TripDay[];
  trip: Trip;
  provider: MapProvider;
  color: string;
  mode: TravelMode;
  isInbox: boolean;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
}) {
  const { actions } = useStore();
  const legs = useLegs();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (stops.length === 0) {
    return (
      <div className="line-empty" style={{ ['--c' as string]: color }}>
        <span className="line-empty-dot" />
        <p>
          {isInbox
            ? '검색해서 언젠가 가 보고 싶은 곳을 담아 두세요.'
            : provider === 'kakao'
              ? '위에서 장소를 검색해 추가하세요. 지도에서 원하는 곳을 눌러도 추가할 수 있어요.'
              : '위에서 장소를 검색해 추가하세요. 지도에서 가게나 명소 아이콘을 눌러도 추가할 수 있어요.'}
        </p>
      </div>
    );
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = stops.map((s) => s.id);
    actions.reorderStops(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol className="line" style={{ ['--c' as string]: color }} data-inbox={isInbox || undefined}>
          {stops.map((s, i) => (
            <StopItem
              key={s.id}
              stop={s}
              index={i}
              isFirst={i === 0}
              isLast={i === stops.length - 1}
              next={stops[i + 1]}
              leg={isInbox ? undefined : legs.get(s.id)}
              mode={mode}
              days={days}
              trip={trip}
              provider={provider}
              isInbox={isInbox}
              selected={s.id === selectedStopId}
              onSelect={() => onSelectStop(s.id === selectedStopId ? null : s.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function StopItem({
  stop,
  index,
  isFirst,
  isLast,
  next,
  leg,
  mode,
  days,
  trip,
  provider,
  isInbox,
  selected,
  onSelect,
}: {
  stop: Stop;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  next?: Stop;
  leg?: Leg;
  mode: TravelMode;
  days: TripDay[];
  trip: Trip;
  provider: MapProvider;
  isInbox: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { actions } = useStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const memo = useDraft(stop.memo ?? '', (v) => actions.updateStop(stop.id, { memo: v.trim() || null }));
  const located = hasCoords(stop);

  useEffect(() => {
    if (selected) document.getElementById(`stop-${stop.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected, stop.id]);

  return (
    <li
      ref={setNodeRef}
      id={`stop-${stop.id}`}
      className="station"
      data-first={isFirst || undefined}
      data-last={isLast || undefined}
      data-visited={stop.visited || undefined}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      data-unlocated={!located || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="rail">
        <button
          type="button"
          className="dot"
          aria-pressed={stop.visited}
          aria-label={stop.visited ? `${stop.name} 방문 취소` : `${stop.name} 방문 완료로 표시`}
          title={stop.visited ? '방문 취소' : '방문 완료'}
          onClick={() => actions.updateStop(stop.id, { visited: !stop.visited })}
        >
          {stop.visited ? <Check size={14} strokeWidth={3} /> : index + 1}
        </button>
      </div>

      <div className="station-body">
        <button type="button" className="station-head" onClick={onSelect} aria-expanded={selected}>
          <span className="station-name">{stop.name}</span>
          {stop.visit_time && <span className="station-time">{stop.visit_time}</span>}
          {stop.address && <span className="station-addr">{stop.address}</span>}
          {!located && <span className="station-addr">지도 위치 없음</span>}
          {!selected && stop.memo && <span className="station-memo">{stop.memo}</span>}
        </button>

        {selected && (
          <div className="station-editor">
            <div className="editor-row">
              <label className="field field-inline">
                <span>시간</span>
                <input
                  type="time"
                  value={stop.visit_time ?? ''}
                  onChange={(e) => actions.updateStop(stop.id, { visit_time: e.target.value || null })}
                />
              </label>
              <label className="field field-inline">
                <span>날짜</span>
                <select
                  value={stop.day_id ?? 'inbox'}
                  onChange={(e) => actions.moveStop(stop.id, e.target.value === 'inbox' ? null : e.target.value)}
                >
                  {days.map((d) => {
                    const date = dayDate(trip, d);
                    return (
                      <option key={d.id} value={d.id}>
                        {d.position + 1}일차{date ? ` ${fmtShort(date)}` : ''}
                      </option>
                    );
                  })}
                  <option value="inbox">보관함</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>메모</span>
              <textarea rows={2} placeholder="예약 번호, 꼭 먹을 메뉴, 입장료 등" {...memo} />
            </label>
            <div className="editor-actions">
              <a
                className="link-btn"
                href={provider === 'kakao' ? kakaoPlaceUrl(stop) : googlePlaceUrl(stop)}
                target="_blank"
                rel="noreferrer"
              >
                <MapIcon size={14} /> {provider === 'kakao' ? '카카오맵에서 보기' : '구글 지도에서 보기'}
              </a>
              <button type="button" className="link-btn is-danger" onClick={() => actions.deleteStop(stop.id)}>
                <Trash2 size={14} /> 이 장소 삭제
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="button" className="grip" aria-label={`${stop.name} 순서 바꾸기`} {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>

      {!isInbox && !isLast && next && <LegRow leg={leg} from={stop} to={next} mode={mode} provider={provider} />}
    </li>
  );
}

function LegRow({ leg, from, to, mode, provider }: { leg?: Leg; from: Stop; to: Stop; mode: TravelMode; provider: MapProvider }) {
  if (!leg) {
    return (
      <div className="leg" data-status="gap">
        <span className="leg-text">위치가 없는 장소가 있어 이동 정보를 계산하지 않아요</span>
      </div>
    );
  }
  const korea = isInKorea(leg.from) && isInKorea(leg.to);
  let text: ReactNode;
  switch (leg.status) {
    case 'loading':
      text = '이동 시간 계산 중…';
      break;
    case 'ok':
      text = (
        <>
          <b>{leg.durationMillis != null ? fmtDuration(leg.durationMillis) : '시간 정보 없음'}</b>
          {leg.distanceMeters != null && <span>{fmtDistance(leg.distanceMeters)}</span>}
          {leg.fare != null && leg.fare > 0 && <span>{leg.fare.toLocaleString('ko-KR')}원</span>}
          {leg.transfers != null && leg.transfers > 0 && <span>환승 {leg.transfers}회</span>}
        </>
      );
      break;
    case 'none':
      text = `경로 없음, 직선 ${fmtDistance(leg.straightMeters)}`;
      break;
    case 'error':
      text = `경로 계산 실패, 직선 ${fmtDistance(leg.straightMeters)}`;
      break;
    default:
      text = `직선 ${fmtDistance(leg.straightMeters)}`;
  }
  return (
    <div className="leg" data-status={leg.status} title={leg.status === 'error' ? leg.error : undefined}>
      <span className="leg-icon">{MODE_ICON[mode](14)}</span>
      <span className="leg-text">{text}</span>
      <span className="leg-links">
        {korea && (
          <a href={kakaoLegUrl(from, to)} target="_blank" rel="noreferrer">
            카카오
          </a>
        )}
        {provider === 'google' && (
          <a href={googleLegUrl(from, to, mode)} target="_blank" rel="noreferrer">
            구글
          </a>
        )}
      </span>
    </div>
  );
}
