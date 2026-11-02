/**
 * Zarinpal payment gateway, REST v4. Amounts are sent in toman (currency IRT).
 * A callback only says a customer came back: money counts only after verify says so.
 */
export interface ZarinpalConfig { merchantId: string; apiBase: string; startPayBase: string }

export function zarinpalConfig(): ZarinpalConfig | null {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchantId) return null;
  const host = process.env.ZARINPAL_SANDBOX === 'true' ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
  const apiBase = process.env.ZARINPAL_API_BASE || host;
  return { merchantId, apiBase, startPayBase: `${apiBase}/pg/StartPay` };
}

export class ZarinpalError extends Error {
  constructor(message: string, public readonly code?: number, public readonly reachable = true) {
    super(message);
    this.name = 'ZarinpalError';
  }
}

async function post(url: string, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ZarinpalError('Payment gateway could not be reached', undefined, false);
  }
  if (response.status >= 500) throw new ZarinpalError('Payment gateway is unavailable', undefined, false);
  try {
    return await response.json();
  } catch {
    throw new ZarinpalError('Payment gateway returned an invalid response', undefined, false);
  }
}

const errorCode = (json: any): number | undefined => {
  const raw = json?.errors?.code ?? json?.data?.code;
  return typeof raw === 'number' ? raw : undefined;
};

export async function requestPayment(cfg: ZarinpalConfig, input: { amountToman: number; description: string; callbackUrl: string; email?: string }) {
  const json = await post(`${cfg.apiBase}/pg/v4/payment/request.json`, {
    merchant_id: cfg.merchantId,
    amount: input.amountToman,
    currency: 'IRT',
    description: input.description,
    callback_url: input.callbackUrl,
    metadata: input.email ? { email: input.email } : undefined,
  });
  const authority = json?.data?.authority;
  if (json?.data?.code !== 100 || typeof authority !== 'string' || !authority) {
    throw new ZarinpalError('Payment gateway refused the request', errorCode(json));
  }
  return { authority, url: `${cfg.startPayBase}/${encodeURIComponent(authority)}` };
}

export type VerifyResult = { outcome: 'paid'; refId: string; cardPan?: string } | { outcome: 'not_paid'; code?: number };

/** 100 = verified now, 101 = verified before. Both mean the money arrived. */
export async function verifyPayment(cfg: ZarinpalConfig, input: { amountToman: number; authority: string }): Promise<VerifyResult> {
  const json = await post(`${cfg.apiBase}/pg/v4/payment/verify.json`, {
    merchant_id: cfg.merchantId,
    amount: input.amountToman,
    currency: 'IRT',
    authority: input.authority,
  });
  const code = json?.data?.code;
  if ((code === 100 || code === 101) && json?.data?.ref_id != null) {
    return { outcome: 'paid', refId: String(json.data.ref_id), cardPan: json.data.card_pan };
  }
  return { outcome: 'not_paid', code: errorCode(json) };
}
