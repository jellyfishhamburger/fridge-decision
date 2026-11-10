// 通用反代：让浏览器/设备经自有域名访问 Supabase（Auth / REST / Edge Functions）
// 部署：Cloudflare Workers → 新建 Worker（名字 supa-relay）→ 粘贴本文件 → Deploy → 绑自有域名
// 与 fridge-relay 的区别：这个要转发任意路径、任意方法，并且要处理 CORS（App 在 github.io 上跨域调用）
const UPSTREAM = 'https://zbrvcwxwecorjdzqltxg.supabase.co';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(UPSTREAM + url.pathname + url.search);

    // 预检：直接回 CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    const headers = new Headers();
    for (const name of ['authorization', 'apikey', 'content-type', 'prefer', 'x-client-info', 'accept', 'range', 'if-none-match']) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    headers.set('user-agent', request.headers.get('user-agent') || 'FridgeRelay/1.0');

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    const out = new Headers(cors(request));
    for (const name of ['content-type', 'content-length', 'content-range', 'etag', 'location', 'cache-control']) {
      const v = upstream.headers.get(name);
      if (v) out.set(name, v);
    }
    out.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

function cors(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers': 'authorization,apikey,content-type,prefer,x-client-info,accept,if-none-match',
    'access-control-expose-headers': 'content-range,content-length,etag,location',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
