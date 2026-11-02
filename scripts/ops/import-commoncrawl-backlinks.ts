#!/usr/bin/env tsx
/**
 * Imports referring domains from a Common Crawl domain-level web graph (updated about quarterly).
 * Domain level only: it says which domains link to a project, not the page or anchor text.
 *
 * Download first (vertices about 900 MB, edges about 14 GB; check Common Crawl's terms):
 *   https://commoncrawl.org/blog -> "Host- and Domain-Level Web Graphs" -> domain vertices and edges
 * Run with the system role, on a host with little else to do:
 *   DATABASE_URL=... node --import tsx scripts/ops/import-commoncrawl-backlinks.ts <vertices.gz> <edges.gz> <release>
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { Pool } from 'pg';

const [verticesPath, edgesPath, release] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (!verticesPath || !edgesPath || !release || !databaseUrl) {
  console.error('Usage: DATABASE_URL=... import-commoncrawl-backlinks <vertices.gz> <edges.gz> <release>');
  process.exit(1);
}
const MAX_PER_TARGET = Number(process.env.MAX_REFERRING_DOMAINS || 5000);
const reverse = (name: string) => name.split('.').reverse().join('.');

async function* lines(path: string) {
  const stream = createReadStream(path).pipe(createGunzip());
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) yield line as string;
}

const pool = new Pool({ connectionString: databaseUrl });
const startedAt = new Date();
const projects = (await pool.query(`SELECT id, organization_id, normalized_domain FROM projects WHERE deleted_at IS NULL`)).rows;
const domain = (p: any) => String(p.normalized_domain).toLowerCase().replace(/^www\./, '');
const wanted = new Map<string, any[]>();
for (const p of projects) wanted.set(domain(p), [...(wanted.get(domain(p)) || []), p]);

// Pass 1: which graph ids are our projects. The graph uses reversed names such as "ir.example".
const targetIds = new Map<string, string>();
for await (const line of lines(verticesPath)) {
  const [id, rev] = line.split('\t');
  const name = reverse(rev);
  if (wanted.has(name)) targetIds.set(id, name);
}
console.log(`Projects: ${projects.length}, found in graph: ${targetIds.size}`);

// Pass 2: who links to them. Only ids are kept: the file holds billions of edges.
const sources = new Map<string, Set<string>>();
const neededSources = new Set<string>();
for await (const line of lines(edgesPath)) {
  const tab = line.indexOf('\t');
  const to = line.slice(tab + 1);
  if (!targetIds.has(to)) continue;
  const from = line.slice(0, tab);
  const set = sources.get(to) || new Set<string>();
  if (set.size < MAX_PER_TARGET && from !== to) { set.add(from); neededSources.add(from); }
  sources.set(to, set);
}

// Pass 3: names for those ids.
const names = new Map<string, string>();
for await (const line of lines(verticesPath)) {
  const [id, rev] = line.split('\t');
  if (neededSources.has(id)) names.set(id, reverse(rev));
}

let written = 0;
for (const [targetId, sourceIds] of sources) {
  const target = targetIds.get(targetId)!;
  for (const project of wanted.get(target) || []) {
    for (const sourceId of sourceIds) {
      const source = names.get(sourceId);
      if (!source) continue;
      await pool.query(
        `INSERT INTO backlinks (project_id, organization_id, source_url, source_domain, target_url, first_seen_at, last_seen_at, status, provider, evidence)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 'active', 'commoncrawl', $6)
         ON CONFLICT (project_id, source_url, target_url) DO UPDATE SET last_seen_at = NOW(), status = 'active', evidence = EXCLUDED.evidence`,
        [project.id, project.organization_id, `https://${source}`, source, `https://${target}`, JSON.stringify({ release, level: 'domain' })],
      );
      written++;
    }
  }
}
const lost = await pool.query(`UPDATE backlinks SET status = 'lost' WHERE provider = 'commoncrawl' AND status = 'active' AND last_seen_at < $1`, [startedAt]);
console.log(`Referring domains written: ${written}, marked lost: ${lost.rowCount}`);
await pool.end();
