const env = import.meta.env;

export const GOOGLE_MAPS_API_KEY: string = (env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
export const GOOGLE_MAP_ID: string = (env.VITE_GOOGLE_MAP_ID ?? '').trim() || 'DEMO_MAP_ID';

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL ?? '').trim();
export const SUPABASE_KEY: string = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

/** 카카오 JavaScript 키: 지도 표시 + 장소 검색 (브라우저에 노출돼도 되는 키, 도메인으로 제한) */
export const KAKAO_JS_KEY: string = (env.VITE_KAKAO_JS_KEY ?? '').trim();

export const hasGoogleMaps = GOOGLE_MAPS_API_KEY.length > 0;
export const hasKakaoMaps = KAKAO_JS_KEY.length > 0;
export const hasSupabase = SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
