// Cloudflare Worker：把冰箱屏的请求中转给 Supabase（免费额度：10 万次/天，我们每天约 288 次）
// 部署：dash.cloudflare.com → Workers & Pages → Create → Worker → 粘贴本文件 → Deploy
// 之后设备只认 https://<worker>.<account>.workers.dev（或绑定的自有域名）
const UPSTREAM = 'https://zbrvcwxwecorjdzqltxg.supabase.co/functions/v1/fridge-frame';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') {
      return new Response('method_not_allowed', { status: 405 });
    }

    const target = new URL(UPSTREAM);
    target.search = url.search;                     // 原样带过 ?device_id=...

    const headers = new Headers();
    const secret = request.headers.get('x-device-secret');
    if (!secret) return new Response('unauthorized', { status: 401 });
    headers.set('x-device-secret', secret);
    const inm = request.headers.get('if-none-match');
    if (inm) headers.set('if-none-match', inm);

    const upstream = await fetch(target.toString(), { method: 'GET', headers });

    const out = new Headers();
    for (const name of ['etag', 'x-frame-sha256', 'x-frame-format', 'x-frame-pages', 'content-type']) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    out.set('cache-control', 'no-store');

    if (upstream.status === 304) {
      return new Response(null, { status: 304, headers: out });
    }
    // 设备要求非 chunked + Content-Length = 45000，所以这里整体缓冲再返回
    const body = await upstream.arrayBuffer();
    out.set('content-length', String(body.byteLength));
    return new Response(body, { status: upstream.status, headers: out });
  },
};
