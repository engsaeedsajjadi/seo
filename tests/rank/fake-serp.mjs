// Answers in the SerpApi format. The demo site ranks 14th for one keyword and not at all for the other.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const LOG = process.argv[2];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  appendFileSync(LOG, JSON.stringify(Object.fromEntries(u.searchParams)) + '\n');
  if (u.searchParams.get('api_key') !== 'local-fake-serp-key') { res.writeHead(401); return res.end(JSON.stringify({ error: 'Invalid API key.' })); }
  const start = Number(u.searchParams.get('start') || 0);
  const q = u.searchParams.get('q');
  const links = Array.from({ length: 10 }, (_, i) => `https://site${start + i}.ir/p`);
  if (q === 'تور کیش' && start === 10) links[3] = 'https://www.serp-demo.rankforge.test/tours/kish';
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ search_metadata: { id: `fake-${start}` }, search_information: { total_results: 5000 },
    organic_results: links.map((link, i) => ({ position: i + 1, link, title: 't' })), serpapi_pagination: start < 90 ? { next: 'x' } : undefined }));
}).listen(5999, '127.0.0.1');
