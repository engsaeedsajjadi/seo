// Redirect proposals for broken internal addresses found by a crawl.
// Each broken page gets the working page whose address shares the most words with it, or the
// home page when nothing is close. A person approves every redirect before the plugin adds it.

export interface RedirectProposal {
  from: string;
  to: string;
  /** Words the two addresses share; 0 means the home page was chosen. */
  score: number;
}

function words(url: string): string[] {
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname); } catch { return []; }
  return path.toLowerCase().split(/[/\-_.\s]+/).filter((w) => w.length > 1 && !/^(html?|php|aspx?|index|page|\d+)$/.test(w));
}

function host(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export function proposeRedirects(
  broken: string[],
  working: string[],
  siteDomain: string,
  limit = 50,
): RedirectProposal[] {
  const site = siteDomain.replace(/^www\./, '').toLowerCase();
  const pages = working.filter((u) => host(u) === site).map((u) => ({ url: u, words: new Set(words(u)) }));
  const home = pages.find((p) => { try { return new URL(p.url).pathname === '/'; } catch { return false; } })?.url
    ?? `https://${siteDomain.replace(/\/+$/, '')}/`;
  const out: RedirectProposal[] = [];
  for (const from of broken) {
    if (host(from) !== site || out.length >= limit) continue;
    const want = words(from);
    let best: { url: string; score: number } | null = null;
    for (const p of pages) {
      const score = want.filter((w) => p.words.has(w)).length;
      // Ties go to the shorter address: a section page rather than one of its articles.
      if (score > 0 && (!best || score > best.score || (score === best.score && p.url.length < best.url.length))) best = { url: p.url, score };
    }
    const to = best?.url ?? home;
    if (to !== from) out.push({ from, to, score: best?.score ?? 0 });
  }
  return out;
}
