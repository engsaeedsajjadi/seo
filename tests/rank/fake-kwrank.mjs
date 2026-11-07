// Stands in for the KWRank Web API with the documented request and response shapes.
// Keywords start unchecked; POST /__check marks them checked: "تور کیش" ranks 4, others are not in the top 100.
import http from 'node:http';
const domains = [{ id: 3, is_active: 1, link: 'unrelated.ir', number_of_keywords: 0 }];
const keywords = new Map(); // domainId -> rows
let nextId = 100;
const TOKEN = 'fake-kwrank-token';
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const list = (key, data) => ({ result: true, [key]: { current_page: 1, data, next_page_url: null }, status: 200 });
async function form(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) });
  return Object.fromEntries((await r.formData()).entries());
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/authorize') {
    const f = await form(req);
    return f.client_id === 'local-kw-id' && f.secret_id === 'local-kw-secret'
      ? json(res, 200, { result: true, access_token: TOKEN, token_type: 'Bearer', status: 200 })
      : json(res, 401, { result: false, message: 'Invalid client credentials.', status: 401 });
  }
  if (p === '/__check') {
    for (const rows of keywords.values()) for (const k of rows) {
      k.has_the_ranking_ever_been_checked = true;
      k.rank = k.keyword_name === 'تور کیش' ? 4 : null;
      k.link = k.rank ? 'https://www.kw-demo.rankforge.test/tours/kish' : null;
      k.rank_updated_at = '2026-11-07';
    }
    return json(res, 200, { ok: true });
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { result: false, message: 'Unauthenticated.' });
  if (p === '/domains' && req.method === 'GET') return json(res, 200, list('domains_list', domains));
  if (p === '/domains' && req.method === 'POST') {
    const f = await form(req); const id = nextId++;
    domains.push({ id, is_active: 1, link: f.domain, number_of_keywords: 0 }); keywords.set(id, []);
    return json(res, 200, { result: true, message: 'Domain added successfully.', status: 200, id });
  }
  const m = /^\/domain\/(\d+)\/keywords$/.exec(p);
  if (m && req.method === 'GET') return json(res, 200, list('keywords_list', keywords.get(Number(m[1])) ?? []));
  if (m && req.method === 'POST') {
    const f = await form(req); const rows = keywords.get(Number(m[1])) ?? [];
    // Like the real service: several items in one form are stored as one comma-joined keyword.
    const items = Object.keys(f).filter((k) => k.startsWith('keywords['));
    const names = items.length > 1 ? [items.map((k) => f[k]).join(',')] : items.map((k) => f[k]);
    const added = names.map((name) => {
      const row = { id: nextId++, keyword_name: name, device_type: f.device_type, country_id: Number(f.country_id), is_active: 1,
        has_the_ranking_ever_been_checked: false, rank: null, link: null, country: 'ایران', rank_updated_at: null };
      rows.push(row); return { id: row.id, keyword_name: row.keyword_name };
    });
    keywords.set(Number(m[1]), rows);
    return json(res, 200, { result: true, message: 'New keywords added successfully.', keywords: added, status: 200 });
  }
  json(res, 404, { result: false, message: 'Not found' });
}).listen(5998, '127.0.0.1');
