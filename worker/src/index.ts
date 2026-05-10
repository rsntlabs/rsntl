import { analyze } from './analysis.js';
import type { Env } from './types.js';

const CACHE_TTL = 300; // 5 min

function corsHeaders(origin: string, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? 'https://rsntl.com')
    .split(',').map(s => s.trim());
  const isLocal = /^http:\/\/localhost(:\d+)?$/.test(origin);
  const allow = isLocal || allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') ?? '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true }, { headers: cors });
    }

    const match = url.pathname.match(/^\/quote\/([A-Za-z0-9.\-^]+)$/);
    if (!match) {
      return new Response('Not found', { status: 404, headers: cors });
    }

    const ticker = match[1].toUpperCase();
    const cacheKey = new Request(`https://finance.rsntl.com/quote/${ticker}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }

    try {
      const data = await analyze(ticker, env);
      const body = JSON.stringify(data);
      const response = new Response(body, {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err: any) {
      return Response.json(
        { error: err?.message ?? 'Analysis failed' },
        { status: 502, headers: cors }
      );
    }
  },
};
