const base = 'http://127.0.0.1:3001/api/v1';
const tag = Date.now().toString(36);
async function call(method, path, token, body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: 'http://localhost:4173', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null); return { status: r.status, data: j?.data, j };
}
const email = `wp-${tag}@example.test`;
const s = await call('POST', '/auth/signup', null, { email, password: 'Str0ng!Passw0rd#22', name: 'wp' });
const T = s.data.token;
const p = await call('POST', '/projects', T, { name: 'WP', domain: `wp-${tag}.rankforge.test`, country: 'IR', language: 'fa' });
const k = await call('POST', '/api-keys', T, { name: 'wordpress', scopes: ['read', 'write'] });
const ro = await call('POST', '/api-keys', T, { name: 'readonly', scopes: ['read'] });
console.log(JSON.stringify({ email, token: T, pid: p.data.id, org: p.data.organizationId, key: k.data.key, roKey: ro.data.key }));
