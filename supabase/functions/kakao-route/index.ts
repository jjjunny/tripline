// Supabase Edge Function: 카카오 경로 계산 프록시 (배포용)
// 배포: supabase secrets set KAKAO_REST_API_KEY=... && supabase functions deploy kakao-route
// 로그인한 사용자만 호출할 수 있습니다(기본 JWT 검증).
import { RouteError, kakaoRoute, parseRouteRequest } from '../_shared/kakao-route.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST로 호출해 주세요' }, 405);

  const restKey = Deno.env.get('KAKAO_REST_API_KEY');
  if (!restKey) {
    return json({ error: 'Supabase 시크릿에 KAKAO_REST_API_KEY가 없어요. supabase secrets set으로 넣어 주세요.' }, 501);
  }

  try {
    const body = parseRouteRequest(await req.json());
    return json(await kakaoRoute(body, restKey));
  } catch (e) {
    const status = e instanceof RouteError ? e.status : 502;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
