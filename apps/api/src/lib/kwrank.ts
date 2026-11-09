// KWRank keyword suggestions (POST /keyword-suggester), called while the user waits.
// Rank tracking itself runs in the worker (apps/worker/src/kwrank.ts).
// API reference: https://kwrank.ir/documentation/web-api/reference/start-keyword-research

let token: string | null = null;

const baseUrl = () => (process.env.KWRANK_BASE_URL || 'https://kwrank.ir/api/v1').replace(/\/+$/, '');

export function kwRankSuggestConfigured(): boolean {
  return Boolean(process.env.KWRANK_CLIENT_ID && process.env.KWRANK_CLIENT_SECRET);
}

export class KwRankApiError extends Error {
  constructor(message: string, public httpStatus?: number) {
    super(message);
  }
}

async function send(path: string, form: FormData, auth?: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* reported below */ }
    if (!response.ok || body?.result === false) {
      throw new KwRankApiError(`HTTP ${body?.status || response.status}: ${String(body?.message ?? text).slice(0, 200)}`, Number(body?.status) || response.status);
    }
    return body;
  } catch (error) {
    if (error instanceof KwRankApiError) throw error;
    throw new KwRankApiError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(): Promise<string> {
  const form = new FormData();
  form.set('client_id', process.env.KWRANK_CLIENT_ID || '');
  form.set('secret_id', process.env.KWRANK_CLIENT_SECRET || '');
  const body = await send('/authorize', form);
  if (!body?.access_token) throw new KwRankApiError('authorization returned no token');
  token = String(body.access_token);
  return token;
}

/** Related searches for a keyword, as KWRank returns them (no volumes). */
export async function suggestKeywords(keyword: string): Promise<string[]> {
  const form = new FormData();
  form.set('keyword', keyword);
  let body: any;
  try {
    body = await send('/keyword-suggester', form, token ?? await authorize());
  } catch (error) {
    if (!(error instanceof KwRankApiError) || error.httpStatus !== 401) throw error;
    token = null;
    body = await send('/keyword-suggester', form, await authorize());
  }
  const list: unknown[] = Array.isArray(body?.suggested_keywords) ? body.suggested_keywords : [];
  return [...new Set(list.filter((k): k is string => typeof k === 'string').map((k) => k.trim()).filter((k) => k.length > 0 && k.length <= 200))];
}
