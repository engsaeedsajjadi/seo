/** Referring domains from a synthetic Common Crawl domain graph (same file layout, gzipped). */
import assert from 'assert';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { referringDomains, unreverseDomain, graphDomain, graphFileUrl } from '../../apps/worker/src/commoncrawl.js';

console.log('Testing Common Crawl referring domains...');
assert.strictEqual(unreverseDomain('ir.gardima'), 'gardima.ir');
assert.strictEqual(graphDomain('https://www.Gardima.ir/tours?x=1'), 'gardima.ir');
assert.strictEqual(graphFileUrl('https://data.example/hg/', 'cc-main-x', 'edges'), 'https://data.example/hg/cc-main-x/domain/cc-main-x-domain-edges.txt.gz');

const vertices = ['0\tcom.blog\t3', '1\tir.gardima\t1', '2\tir.rival\t1', '3\tir.news\t5', '4\torg.wiki\t9', '5\tcom.spam\t1'].join('\n');
const edges = ['0\t1', '0\t2', '1\t1', '3\t2', '4\t2', '5\t2', '4\t1', 'garbage'].join('\n');
const files: Record<string, string> = { vertices, edges };
const requested: string[] = [];
const fetchFn = async (url: string) => {
  requested.push(url);
  const kind = url.includes('edges') ? 'edges' : 'vertices';
  return { ok: true, status: 200, body: Readable.from([gzipSync(files[kind])]) };
};
const result = await referringDomains(['www.gardima.ir', 'rival.ir', 'absent.ir'], { baseUrl: 'https://cc.test/hg', release: 'cc-main-test', fetchFn });
assert.deepStrictEqual(result.referring.get('gardima.ir'), ['blog.com', 'wiki.org'], 'self links are dropped');
assert.deepStrictEqual(result.referring.get('rival.ir'), ['blog.com', 'news.ir', 'spam.com', 'wiki.org']);
assert.deepStrictEqual(result.missing, ['absent.ir']);
assert.strictEqual(requested.filter((u) => u.includes('edges')).length, 1, 'edges are streamed once for all targets');
console.log('✅ ids, edges and names resolved in one pass each');

const capped = await referringDomains(['rival.ir'], { baseUrl: 'https://cc.test/hg', release: 'cc-main-test', fetchFn, maxPerTarget: 2 });
assert.strictEqual(capped.referring.get('rival.ir')!.length, 2);
assert.deepStrictEqual(capped.truncated, ['rival.ir']);
console.log('✅ large targets are capped and reported');

await assert.rejects(referringDomains(['a.ir'], { baseUrl: 'x', release: 'r', fetchFn: async () => ({ ok: false, status: 404, body: null }) }), /HTTP 404/);
console.log('✅ a missing release is an error');
console.log('\n✅ ALL Common Crawl tests passed');
