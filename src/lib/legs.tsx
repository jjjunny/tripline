import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasGoogleMaps } from '../config';
import { RouteUnavailableError, fetchKakaoRoute } from './kakao';
import type { MapProvider, Stop, TravelMode } from './types';
import { hasCoords, haversine, safeStorage, type LatLng } from './utils';

/**
 * 한 구간(장소 A → 장소 B)의 이동 정보.
 * - ok: 실제 경로 (구글 Routes 또는 카카오)
 * - none: 경로가 없음. 직선 거리만 표시
 * - error: API 오류(키 권한, 할당량 등)
 * - straight: 경로 계산을 쓸 수 없어 계산하지 않음
 */
export interface Leg {
  key: string;
  fromId: string;
  toId: string;
  status: 'loading' | 'ok' | 'none' | 'error' | 'straight';
  distanceMeters?: number;
  durationMillis?: number | null;
  path?: LatLng[];
  /** 대중교통 요금(원), 카카오만 */
  fare?: number;
  /** 대중교통 환승 횟수, 카카오만 */
  transfers?: number;
  straightMeters: number;
  from: LatLng;
  to: LatLng;
  error?: string;
}

export type LegResult = Pick<Leg, 'status' | 'distanceMeters' | 'durationMillis' | 'path' | 'error' | 'fare' | 'transfers'>;

type Compute = (from: LatLng, to: LatLng, mode: TravelMode) => Promise<LegResult>;

/** 연속된 두 장소가 모두 좌표를 가질 때만 구간이 됨 */
export function legPairs(stops: Stop[]): [Stop & LatLng, Stop & LatLng][] {
  const out: [Stop & LatLng, Stop & LatLng][] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (hasCoords(a) && hasCoords(b)) out.push([a, b]);
  }
  return out;
}

const r5 = (n: number) => n.toFixed(5);
export const legKey = (provider: MapProvider, a: LatLng, b: LatLng, mode: TravelMode) =>
  `${provider}:${mode}:${r5(a.lat)},${r5(a.lng)}>${r5(b.lat)},${r5(b.lng)}`;

/* ---------- 캐시: 같은 구간을 다시 계산하지 않도록 (API 쿼터 절약) ---------- */

const CACHE_KEY = 'tripline:legs:v2';
const CACHE_MAX = 400;
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14; // 14일
const storage = safeStorage();
type CacheEntry = LegResult & { t: number };
let memCache: Map<string, CacheEntry> | null = null;

function cache(): Map<string, CacheEntry> {
  if (memCache) return memCache;
  memCache = new Map();
  try {
    const raw = storage.get(CACHE_KEY);
    if (raw) {
      const now = Date.now();
      for (const [k, v] of JSON.parse(raw) as [string, CacheEntry][]) if (now - v.t < CACHE_TTL) memCache.set(k, v);
    }
  } catch {
    /* ignore */
  }
  return memCache;
}

function cachePut(key: string, value: LegResult) {
  const c = cache();
  c.delete(key);
  c.set(key, { ...value, t: Date.now() });
  while (c.size > CACHE_MAX) c.delete(c.keys().next().value as string);
  storage.set(CACHE_KEY, JSON.stringify([...c.entries()]));
}

/** 경로 좌표를 최대 n 개로 줄여 저장 */
function decimate(path: LatLng[], n = 250): LatLng[] {
  if (path.length <= n) return path;
  const step = (path.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => path[Math.round(i * step)]);
}

/* ---------- context ---------- */

interface LegsValue {
  legs: Map<string, Leg>;
  /** 경로 계산을 쓸 수 없을 때 이유 (예: REST 키 없음) */
  notice: string | null;
}

const LegsCtx = createContext<LegsValue>({ legs: new Map(), notice: null });

/** 구간 목록 (key: 출발 장소 id) */
export function useLegs(): Map<string, Leg> {
  return useContext(LegsCtx).legs;
}

export function useLegsNotice(): string | null {
  return useContext(LegsCtx).notice;
}

function baseLeg(provider: MapProvider, a: Stop & LatLng, b: Stop & LatLng, mode: TravelMode): Omit<Leg, 'status'> {
  return {
    key: legKey(provider, a, b, mode),
    fromId: a.id,
    toId: b.id,
    straightMeters: haversine(a, b),
    from: { lat: a.lat, lng: a.lng },
    to: { lat: b.lat, lng: b.lng },
  };
}

interface ProviderProps {
  stops: Stop[];
  mode: TravelMode;
  children: ReactNode;
}

/**
 * 구간마다 compute 를 순서대로 호출하고 결과를 캐시.
 * compute 가 null 이면 라이브러리를 불러오는 중, unavailable 이 있으면 계산할 수 없어 직선으로 표시.
 */
function ComputedLegsProvider({
  stops,
  mode,
  provider,
  compute,
  unavailable,
  children,
}: ProviderProps & { provider: MapProvider; compute: Compute | null; unavailable: string | null }) {
  const [results, setResults] = useState<Record<string, LegResult>>({});
  // 제공자(카카오/구글)별로 따로 기억해서 다른 여행으로 넘어갈 때 안내가 섞이지 않게 함
  const [notices, setNotices] = useState<Partial<Record<MapProvider, string | null>>>({});
  const notice = notices[provider] ?? null;
  const setNotice = (text: string | null) => setNotices((n) => ({ ...n, [provider]: text }));

  const pairs = useMemo(() => legPairs(stops), [stops]);
  const pairsSig = pairs.map(([a, b]) => legKey(provider, a, b, mode)).join('|');

  useEffect(() => {
    if (!compute || unavailable) return;
    let cancelled = false;
    const c = cache();
    const fromCache: Record<string, LegResult> = {};
    const todo: [LatLng, LatLng, string][] = [];
    for (const [a, b] of pairs) {
      const key = legKey(provider, a, b, mode);
      const hit = c.get(key);
      if (hit) fromCache[key] = hit;
      else todo.push([a, b, key]);
    }
    setResults((prev) => {
      const next = { ...prev, ...fromCache };
      for (const [, , key] of todo) if (!next[key] || next[key].status !== 'ok') next[key] = { status: 'loading' };
      return next;
    });

    // 구간을 하나씩 순서대로 요청 (동시 요청 폭주 방지)
    (async () => {
      for (const [a, b, key] of todo) {
        if (cancelled) return;
        let res: LegResult;
        try {
          res = await compute(a, b, mode);
          if (res.status === 'ok' || res.status === 'none') cachePut(key, res);
          if (!cancelled) setNotice(null);
        } catch (e) {
          if (e instanceof RouteUnavailableError) {
            // 설정이 안 된 상태: 남은 구간은 요청하지 않고 직선으로
            if (cancelled) return;
            setNotice(e.message);
            setResults((prev) => {
              const next = { ...prev };
              for (const [, , k] of todo) if (next[k]?.status === 'loading') next[k] = { status: 'straight' };
              return next;
            });
            return;
          }
          res = { status: 'error', error: e instanceof Error ? e.message : String(e) };
        }
        if (cancelled) return;
        setResults((prev) => ({ ...prev, [key]: res }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // pairsSig 가 구간·이동수단·제공자를 모두 담고 있음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute, unavailable, pairsSig]);

  const value = useMemo(() => {
    const m = new Map<string, Leg>();
    for (const [a, b] of pairs) {
      const base = baseLeg(provider, a, b, mode);
      const r: LegResult = unavailable ? { status: 'straight' } : results[base.key] ?? { status: 'loading' };
      m.set(a.id, { ...base, ...r });
    }
    return { legs: m, notice: unavailable ?? notice };
  }, [pairs, mode, results, provider, notice, unavailable]);

  return <LegsCtx.Provider value={value}>{children}</LegsCtx.Provider>;
}

/** 해외 여행: 구글 Routes 라이브러리 (APIProvider 안에서만 호출 가능) */
function useGoogleComputeReal(): Compute | null {
  const routesLib = useMapsLibrary('routes');
  const compute = useCallback<Compute>(
    async (a, b, mode) => {
      try {
        const { routes } = await routesLib!.Route.computeRoutes({
          origin: a,
          destination: b,
          travelMode: mode,
          fields: ['distanceMeters', 'durationMillis', 'path'],
          language: 'ko',
        });
        const r = routes?.[0];
        if (!r) return { status: 'none' };
        return {
          status: 'ok',
          distanceMeters: r.distanceMeters ?? undefined,
          durationMillis: r.durationMillis ?? null,
          path: decimate((r.path ?? []).map((p) => ({ lat: p.lat, lng: p.lng }))),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ZERO_RESULTS|NOT_FOUND|no route/i.test(msg)) return { status: 'none' };
        throw e;
      }
    },
    [routesLib],
  );
  return routesLib ? compute : null;
}

// 구글 키가 없으면 APIProvider 가 없으므로 훅을 바꿔 끼움 (앱 실행 중에는 바뀌지 않는 값)
const useGoogleCompute: () => Compute | null = hasGoogleMaps ? useGoogleComputeReal : () => null;

/** 국내 여행: 카카오 경로 (서버 프록시 경유) */
const kakaoCompute: Compute = async (a, b, mode) => {
  const r = await fetchKakaoRoute({ mode, from: a, to: b });
  return r.status === 'ok'
    ? {
        status: 'ok',
        distanceMeters: r.distanceMeters,
        durationMillis: r.durationMillis ?? null,
        path: r.path,
        fare: r.fare,
        transfers: r.transfers,
      }
    : { status: 'none' };
};

/** 국내 여행은 카카오, 해외 여행은 구글로 구간 이동시간 계산 */
export function LegsProvider({ provider, ...props }: ProviderProps & { provider: MapProvider }) {
  const googleCompute = useGoogleCompute();
  if (provider === 'kakao') {
    return <ComputedLegsProvider {...props} provider="kakao" compute={kakaoCompute} unavailable={null} />;
  }
  return (
    <ComputedLegsProvider
      {...props}
      provider="google"
      compute={googleCompute}
      unavailable={hasGoogleMaps ? null : '구글 지도 API 키를 넣으면 해외 구간의 이동시간이 계산돼요.'}
    />
  );
}
