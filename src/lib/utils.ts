import type { Stop, TravelMode, Trip, TripDay } from './types';

/* ---------- ids ---------- */

export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // 보안 컨텍스트가 아닐 때를 위한 대체 구현 (UUID v4 형식)
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ---------- colors ---------- */

/** 지하철 노선처럼 날짜마다 다른 색 */
export const LINE_COLORS = [
  '#2F6FDB', // 파랑
  '#1E9E5A', // 초록
  '#E0782A', // 주황
  '#0E9DBF', // 하늘
  '#8C5BB8', // 보라
  '#B0742B', // 갈색
  '#6F7F12', // 올리브
  '#D6336C', // 분홍
];

export const INBOX_COLOR = '#8794A7';

export function dayColor(position: number): string {
  return LINE_COLORS[((position % LINE_COLORS.length) + LINE_COLORS.length) % LINE_COLORS.length];
}

/* ---------- dates ---------- */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86_400_000);
}

export function dayDate(trip: Trip, day: TripDay): Date | null {
  const start = parseDate(trip.start_date);
  return start ? addDays(start, day.position) : null;
}

/** 11.14 (금) */
export function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}.${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

/** 11월 14일 금요일 */
export function fmtLong(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

/** 11월 14일 – 17일 / 11월 30일 – 12월 2일 / 2026년 12월 30일 – 2027년 1월 2일 */
export function fmtRange(start: Date, end: Date): string {
  const now = new Date();
  const withYear = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== now.getFullYear();
  const s = `${withYear ? `${start.getFullYear()}년 ` : ''}${start.getMonth() + 1}월 ${start.getDate()}일`;
  if (daysBetween(start, end) === 0) return s;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${s} – ${end.getFullYear()}년 ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }
  if (start.getMonth() === end.getMonth()) return `${s} – ${end.getDate()}일`;
  return `${s} – ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

export function tripRangeLabel(trip: Trip, dayCount: number): string {
  const start = parseDate(trip.start_date);
  const n = Math.max(dayCount, 1);
  const nights = n > 1 ? `${n - 1}박 ${n}일` : '당일';
  if (!start) return `날짜 미정, ${nights}`;
  return `${fmtRange(start, addDays(start, n - 1))}, ${nights}`;
}

export type TripStatus = { label: string; tone: 'soon' | 'now' | 'past' | 'none' };

export function tripStatus(trip: Trip, dayCount: number, today = new Date()): TripStatus {
  const start = parseDate(trip.start_date);
  if (!start) return { label: '날짜 미정', tone: 'none' };
  const end = addDays(start, Math.max(dayCount, 1) - 1);
  const toStart = daysBetween(today, start);
  if (toStart > 0) return { label: `D-${toStart}`, tone: 'soon' };
  if (daysBetween(today, end) >= 0) return { label: '여행 중', tone: 'now' };
  return { label: '다녀옴', tone: 'past' };
}

/* ---------- distance / duration ---------- */

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m / 1000)}km`;
}

export function fmtDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

export type LatLng = { lat: number; lng: number };

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function hasCoords(s: Stop): s is Stop & { lat: number; lng: number } {
  return typeof s.lat === 'number' && typeof s.lng === 'number';
}

/** 대한민국 영역(대략) */
export function isInKorea(p: LatLng): boolean {
  return p.lat >= 33 && p.lat <= 38.9 && p.lng >= 124.5 && p.lng <= 131.9;
}

/* ---------- travel modes ---------- */

export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: 'TRANSIT', label: '대중교통' },
  { value: 'DRIVING', label: '자동차' },
  { value: 'WALKING', label: '도보' },
  { value: 'BICYCLING', label: '자전거' },
];

/* ---------- external links ---------- */

function coord(s: Stop): string {
  return `${s.lat},${s.lng}`;
}

/** 구글 장소 id 만 (카카오 id 는 'kakao:' 로 시작) */
function gid(s: Stop): string | null {
  return s.place_id && !s.place_id.startsWith('kakao:') ? s.place_id : null;
}

/** 구글 지도 길찾기 링크 (한 날의 전체 동선). 경유지는 최대 9곳 */
export function googleDirectionsUrl(stops: Stop[], mode: TravelMode): string | null {
  const pts = stops.filter(hasCoords);
  if (pts.length === 0) return null;
  if (pts.length === 1) return googlePlaceUrl(pts[0]);
  const origin = pts[0];
  const dest = pts[pts.length - 1];
  const mids = pts.slice(1, -1).slice(0, 9);
  const p = new URLSearchParams({ api: '1', origin: coord(origin), destination: coord(dest), travelmode: mode.toLowerCase() });
  if (gid(origin)) p.set('origin_place_id', gid(origin)!);
  if (gid(dest)) p.set('destination_place_id', gid(dest)!);
  if (mids.length) {
    p.set('waypoints', mids.map(coord).join('|'));
    if (mids.every((m) => gid(m))) p.set('waypoint_place_ids', mids.map((m) => gid(m)).join('|'));
  }
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export function googlePlaceUrl(s: Stop): string {
  const p = new URLSearchParams({ api: '1', query: hasCoords(s) ? coord(s) : s.name });
  if (gid(s)) p.set('query_place_id', gid(s)!);
  return `https://www.google.com/maps/search/?${p.toString()}`;
}

export function googleLegUrl(a: Stop, b: Stop, mode: TravelMode): string {
  return googleDirectionsUrl([a, b], mode) ?? googlePlaceUrl(b);
}

/** 카카오맵 길찾기 (국내 구간용) */
export function kakaoLegUrl(a: Stop, b: Stop): string {
  const part = (s: Stop) => `${encodeURIComponent(s.name.replace(/[,/]/g, ' '))},${s.lat},${s.lng}`;
  return `https://map.kakao.com/link/from/${part(a)}/to/${part(b)}`;
}

/* ---------- misc ---------- */

export function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeStorage() {
  return {
    get(key: string): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* 저장 공간이 없거나 차단된 경우 무시 */
      }
    },
    remove(key: string) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
