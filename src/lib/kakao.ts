import { useEffect, useState } from 'react';
import { KAKAO_JS_KEY, hasSupabase } from '../config';
import { supabase } from './supabase';
import type { RouteRequest, RouteResult } from '../../supabase/functions/_shared/kakao-route.ts';

/* ---------------- 카카오 지도 SDK 불러오기 ---------------- */

type Kakao = typeof kakao;
let loading: Promise<Kakao> | null = null;

export function loadKakao(): Promise<Kakao> {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  if (loading) return loading;
  loading = new Promise<Kakao>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&libraries=services&autoload=false`;
    s.async = true;
    s.onload = () => {
      const k = window.kakao;
      if (!k?.maps?.load) {
        reject(new Error('카카오 지도 SDK가 응답하지 않았어요'));
        return;
      }
      k.maps.load(() => resolve(k));
    };
    s.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했어요'));
    document.head.appendChild(s);
  });
  loading.catch(() => {
    loading = null; // 다음에 다시 시도할 수 있게
  });
  return loading;
}

/** 카카오 SDK 상태: 불러오는 중이면 kakao 가 null, 실패하면 error */
export function useKakao(): { kakao: Kakao | null; error: string | null } {
  const [state, setState] = useState<{ kakao: Kakao | null; error: string | null }>(() => ({
    kakao: window.kakao?.maps?.services ? window.kakao : null,
    error: null,
  }));
  useEffect(() => {
    if (state.kakao) return;
    let alive = true;
    loadKakao()
      .then((k) => alive && setState({ kakao: k, error: null }))
      .catch((e: unknown) => alive && setState({ kakao: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [state.kakao]);
  return state;
}

/** 장소 검색 때 지도 중심 근처를 먼저 보여 주려고, 화면의 카카오 지도를 공유 */
export const kakaoMapRef: { current: kakao.maps.Map | null } = { current: null };

/* ---------------- 카카오 경로 계산 (서버 프록시 경유) ---------------- */

export type { RouteRequest, RouteResult };

export class RouteUnavailableError extends Error {}

/**
 * 개발 중에는 Vite 개발 서버(/api/kakao-route), 배포 후에는 Supabase Edge Function(kakao-route)을 부릅니다.
 * REST API 키는 두 곳 모두 서버에만 있어요.
 */
export async function fetchKakaoRoute(req: RouteRequest): Promise<RouteResult> {
  if (import.meta.env.DEV) {
    const res = await fetch('/api/kakao-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => ({}))) as RouteResult & { error?: string };
    if (res.status === 501) throw new RouteUnavailableError(body.error ?? '카카오 REST API 키가 설정되지 않았어요');
    if (!res.ok) throw new Error(body.error ?? `경로 계산 실패 (${res.status})`);
    return body;
  }
  if (!hasSupabase || !supabase) {
    throw new RouteUnavailableError('배포 환경에서 카카오 경로를 계산하려면 Supabase Edge Function(kakao-route)이 필요해요');
  }
  const { data, error } = await supabase.functions.invoke<RouteResult>('kakao-route', { body: req });
  if (error) {
    let message = error.message;
    let status = 0;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      status = ctx.status;
      const b = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (b?.error) message = b.error;
    }
    if (status === 501 || status === 404) throw new RouteUnavailableError(message);
    throw new Error(message);
  }
  if (!data) throw new Error('경로 응답이 비어 있어요');
  return data;
}

/* ---------------- 링크 ---------------- */

export function kakaoPlaceUrl(s: { name: string; lat: number | null; lng: number | null; place_id: string | null }): string {
  if (s.place_id?.startsWith('kakao:')) return `https://place.map.kakao.com/${s.place_id.slice(6)}`;
  if (typeof s.lat === 'number' && typeof s.lng === 'number') {
    return `https://map.kakao.com/link/map/${encodeURIComponent(s.name.replace(/[,/]/g, ' '))},${s.lat},${s.lng}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(s.name)}`;
}
