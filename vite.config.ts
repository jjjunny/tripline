import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { RouteError, kakaoRoute, parseRouteRequest } from './supabase/functions/_shared/kakao-route.ts';

/**
 * 개발 서버 전용 카카오 경로 프록시: POST /api/kakao-route
 * REST API 키(KAKAO_REST_API_KEY, VITE_ 접두사 없음)는 서버에만 있고 브라우저로 전달되지 않습니다.
 * 배포 후에는 같은 코드를 Supabase Edge Function(kakao-route)이 실행합니다.
 */
function kakaoRouteDevProxy(restKey: string): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'POST로 호출해 주세요' });
    if (!restKey) {
      return send(501, { error: '.env에 KAKAO_REST_API_KEY를 넣고 개발 서버를 다시 켜면 이동시간이 계산돼요.' });
    }
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      send(200, await kakaoRoute(parseRouteRequest(JSON.parse(raw)), restKey));
    } catch (e) {
      send(e instanceof RouteError ? e.status : 502, { error: e instanceof Error ? e.message : String(e) });
    }
  };
  return {
    name: 'tripline-kakao-route',
    configureServer(server) {
      server.middlewares.use('/api/kakao-route', (req, res) => void handle(req, res));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), kakaoRouteDevProxy((env.KAKAO_REST_API_KEY ?? '').trim())],
    server: { port: 5173 },
    build: { chunkSizeWarningLimit: 800 },
  };
});
