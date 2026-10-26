/**
 * 카카오 경로 계산 (자동차 / 대중교통 / 도보 / 자전거)
 *
 * REST API 키는 브라우저에 노출하면 안 되므로 서버에서만 실행합니다.
 * - 개발 중: vite.config.ts 의 개발 서버 미들웨어(/api/kakao-route)
 * - 배포 후: Supabase Edge Function (supabase/functions/kakao-route)
 * 두 곳이 이 파일 하나를 같이 씁니다. 외부 모듈을 import 하지 마세요(Deno와 Node 모두에서 동작해야 함).
 */

export type KakaoTravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';

export interface RouteRequest {
  mode: KakaoTravelMode;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

export interface RouteResult {
  status: 'ok' | 'none';
  distanceMeters?: number;
  durationMillis?: number;
  path?: { lat: number; lng: number }[];
  /** 대중교통 요금(원) */
  fare?: number;
  /** 대중교통 환승 횟수 */
  transfers?: number;
  /** 경로가 없을 때 카카오가 준 사유 코드 */
  reason?: string;
}

export class RouteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const MODES: KakaoTravelMode[] = ['DRIVING', 'WALKING', 'BICYCLING', 'TRANSIT'];

/** 요청 본문 검증. 국내 좌표만 허용해 프록시가 엉뚱하게 쓰이지 않게 함 */
export function parseRouteRequest(body: unknown): RouteRequest {
  const b = body as Partial<RouteRequest> | null;
  const ok = (p: unknown): p is { lat: number; lng: number } => {
    const q = p as { lat?: unknown; lng?: unknown } | null;
    return (
      !!q &&
      typeof q.lat === 'number' &&
      typeof q.lng === 'number' &&
      q.lat >= 32 &&
      q.lat <= 39.5 &&
      q.lng >= 123.5 &&
      q.lng <= 132.5
    );
  };
  if (!b || !MODES.includes(b.mode as KakaoTravelMode) || !ok(b.from) || !ok(b.to)) {
    throw new RouteError('잘못된 요청이에요. mode와 국내 좌표 from, to가 필요해요.', 400);
  }
  return { mode: b.mode as KakaoTravelMode, from: b.from, to: b.to };
}

type Fetch = typeof fetch;

async function getJson(url: string, restKey: string, fetchImpl: Fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${restKey}` } });
  } catch (e) {
    throw new RouteError(`카카오 서버에 연결하지 못했어요 (${e instanceof Error ? e.message : String(e)})`, 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new RouteError('카카오 REST API 키가 올바르지 않거나 카카오맵 사용 설정이 꺼져 있어요.', 502);
  }
  if (res.status === 429) {
    throw new RouteError('카카오 무료 쿼터를 다 썼어요. 내일 다시 계산돼요.', 429);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new RouteError(`카카오 경로 API 오류 (${res.status}) ${detail}`.trim(), 502);
  }
  return res.json();
}

type Pt = { lat: number; lng: number };

/** [[x, y], ...] → {lat, lng}[] */
function fromPoints(points: unknown): Pt[] {
  if (!Array.isArray(points)) return [];
  const out: Pt[] = [];
  for (const p of points) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') out.push({ lng: p[0], lat: p[1] });
  }
  return out;
}

/** 경로 좌표를 최대 n 개로 줄임 */
export function decimate(path: Pt[], n = 250): Pt[] {
  if (path.length <= n) return path;
  const step = (path.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => path[Math.round(i * step)]);
}

/* ---------- 자동차: 카카오모빌리티 길찾기 ---------- */

interface DriveResponse {
  routes?: {
    result_code: number;
    result_msg?: string;
    summary?: { distance: number; duration: number };
    sections?: { roads?: { vertexes?: number[] }[] }[];
  }[];
}

export function parseDriving(json: unknown): RouteResult {
  const r = (json as DriveResponse).routes?.[0];
  if (!r || r.result_code !== 0 || !r.summary) return { status: 'none', reason: r?.result_msg ?? 'NO_ROUTE' };
  const path: Pt[] = [];
  for (const sec of r.sections ?? []) {
    for (const road of sec.roads ?? []) {
      const v = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) path.push({ lng: v[i], lat: v[i + 1] });
    }
  }
  return {
    status: 'ok',
    distanceMeters: r.summary.distance,
    durationMillis: r.summary.duration * 1000,
    path: decimate(path),
  };
}

/* ---------- 도보 / 자전거 ---------- */

interface WalkResponse {
  status?: string;
  route?: {
    properties?: { totalDistance: number; totalTime: number };
    legs?: { steps?: { path?: { points?: unknown } }[] }[];
  };
}

export function parseWalkLike(json: unknown): RouteResult {
  const j = json as WalkResponse;
  if (j.status !== 'OK' || !j.route?.properties) return { status: 'none', reason: j.status ?? 'NO_ROUTE' };
  const path: Pt[] = [];
  for (const leg of j.route.legs ?? []) for (const step of leg.steps ?? []) path.push(...fromPoints(step.path?.points));
  return {
    status: 'ok',
    distanceMeters: j.route.properties.totalDistance,
    durationMillis: j.route.properties.totalTime * 1000,
    path: decimate(path),
  };
}

/* ---------- 대중교통 ---------- */

interface TransitResponse {
  status?: string;
  routes?: {
    properties?: { totalDistance: number; totalTime: number; transfers?: number; fare?: { value?: number } };
    steps?: { path?: { points?: unknown } }[];
  }[];
}

export function parseTransit(json: unknown): RouteResult {
  const j = json as TransitResponse;
  const routes = (j.routes ?? []).filter((r) => r.properties);
  if (j.status !== 'OK' || routes.length === 0) return { status: 'none', reason: j.status ?? 'NO_RESULTS' };
  // 가장 빨리 도착하는 경로를 고름
  const best = routes.reduce((a, b) => (b.properties!.totalTime < a.properties!.totalTime ? b : a));
  const p = best.properties!;
  const path: Pt[] = [];
  for (const step of best.steps ?? []) path.push(...fromPoints(step.path?.points));
  return {
    status: 'ok',
    distanceMeters: p.totalDistance,
    durationMillis: p.totalTime * 1000,
    path: decimate(path),
    fare: p.fare?.value,
    transfers: p.transfers,
  };
}

/* ---------- 진입점 ---------- */

export async function kakaoRoute(req: RouteRequest, restKey: string, fetchImpl: Fetch = fetch): Promise<RouteResult> {
  const { from, to } = req;
  if (req.mode === 'DRIVING') {
    const q = new URLSearchParams({
      origin: `${from.lng},${from.lat}`,
      destination: `${to.lng},${to.lat}`,
      priority: 'RECOMMEND',
    });
    return parseDriving(await getJson(`https://apis-navi.kakaomobility.com/v1/directions?${q}`, restKey, fetchImpl));
  }
  const q = new URLSearchParams({
    start_x: String(from.lng),
    start_y: String(from.lat),
    end_x: String(to.lng),
    end_y: String(to.lat),
  });
  if (req.mode === 'TRANSIT') {
    return parseTransit(await getJson(`https://dapi.kakao.com/v2/routing/publictraffic?${q}`, restKey, fetchImpl));
  }
  const kind = req.mode === 'WALKING' ? 'walk' : 'bicycle';
  return parseWalkLike(await getJson(`https://dapi.kakao.com/v2/routing/${kind}?${q}`, restKey, fetchImpl));
}
