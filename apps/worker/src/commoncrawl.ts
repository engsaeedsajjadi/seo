// Referring domains from the Common Crawl domain-level web graph.
// https://commoncrawl.org/web-graphs — each release has two gzipped text files under
//   <base>/<release>/domain/<release>-domain-vertices.txt.gz   id \t reversed domain \t hosts
//   <base>/<release>/domain/<release>-domain-edges.txt.gz      from_id \t to_id
// The edges file is tens of gigabytes, so it is streamed once for all targets and never stored.
//   1. vertices: find the ids of the target domains;
//   2. edges: collect the ids that link to them;
//   3. vertices again: turn those ids into domain names.
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

export type FetchStream = (url: string, init: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; body: any }>;

export interface GraphOptions {
  baseUrl: string;
  release: string;
  /** Referring domains kept per target; big sites have millions. */
  maxPerTarget?: number;
  signal?: AbortSignal;
  fetchFn?: FetchStream;
  /** Called every few million lines, so a long job can keep its lease. */
  onProgress?: (stage: string, lines: number) => void | Promise<void>;
}

/** "com.example" → "example.com". */
export function unreverseDomain(reversed: string): string {
  return reversed.split('.').reverse().join('.').toLowerCase();
}

/** The registered domain the graph uses: lower case, no scheme, path, port or leading www. */
export function graphDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/^www\./, '').replace(/\.$/, '');
}

export function graphFileUrl(baseUrl: string, release: string, kind: 'vertices' | 'edges'): string {
  return `${baseUrl.replace(/\/+$/, '')}/${release}/domain/${release}-domain-${kind}.txt.gz`;
}

async function* lines(url: string, options: GraphOptions, stage: string): AsyncGenerator<string> {
  const response = await (options.fetchFn ?? (fetch as unknown as FetchStream))(url, { signal: options.signal });
  if (!response.ok || !response.body) throw new Error(`Common Crawl ${stage} download failed: HTTP ${response.status}`);
  const source = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body as Readable;
  const reader = createInterface({ input: source.pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  try {
    for await (const line of reader) {
      if (options.signal?.aborted) throw new Error('aborted');
      if (++count % 5_000_000 === 0) await options.onProgress?.(stage, count);
      yield line;
    }
  } finally {
    reader.close();
    source.destroy();
  }
}

export interface GraphResult {
  release: string;
  /** Target domain → referring domains (the target itself excluded). */
  referring: Map<string, string[]>;
  /** Targets that are not in this release of the graph at all. */
  missing: string[];
  truncated: string[];
}

export async function referringDomains(targets: string[], options: GraphOptions): Promise<GraphResult> {
  const wanted = new Set(targets.map(graphDomain).filter(Boolean));
  const maxPer = options.maxPerTarget ?? 20000;
  const verticesUrl = graphFileUrl(options.baseUrl, options.release, 'vertices');

  // 1. ids of the targets
  const targetIds = new Map<string, string>();
  for await (const line of lines(verticesUrl, options, 'vertices')) {
    const [id, reversed] = line.split('\t');
    if (!id || !reversed) continue;
    const domain = unreverseDomain(reversed);
    if (wanted.has(domain)) {
      targetIds.set(id, domain);
      if (targetIds.size === wanted.size) break;
    }
  }

  // 2. who links to them
  const linkers = new Map<string, Set<string>>();
  const truncated = new Set<string>();
  if (targetIds.size > 0) {
    for await (const line of lines(graphFileUrl(options.baseUrl, options.release, 'edges'), options, 'edges')) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const to = line.slice(tab + 1).trim();
      const target = targetIds.get(to);
      if (!target) continue;
      const from = line.slice(0, tab);
      if (from === to) continue;
      let set = linkers.get(target);
      if (!set) { set = new Set(); linkers.set(target, set); }
      if (set.size < maxPer) set.add(from);
      else truncated.add(target);
    }
  }

  // 3. names of the linking ids
  const needed = new Set<string>();
  for (const set of linkers.values()) for (const id of set) needed.add(id);
  const names = new Map<string, string>();
  if (needed.size > 0) {
    for await (const line of lines(verticesUrl, options, 'vertices')) {
      const [id, reversed] = line.split('\t');
      if (id && reversed && needed.has(id)) {
        names.set(id, unreverseDomain(reversed));
        if (names.size === needed.size) break;
      }
    }
  }

  const referring = new Map<string, string[]>();
  for (const domain of wanted) referring.set(domain, []);
  for (const [target, ids] of linkers) {
    referring.set(target, [...ids].map((id) => names.get(id)).filter((d): d is string => !!d && d !== target).sort());
  }
  const found = new Set(targetIds.values());
  return { release: options.release, referring, missing: [...wanted].filter((d) => !found.has(d)), truncated: [...truncated] };
}
