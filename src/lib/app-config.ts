// How this installation runs: SaaS with paid plans, or private for one business (no billing,
// sign-up by invitation). Read once from the API and shared by every component.
import { useEffect, useState } from 'react';
import { api, type AppConfig } from './api';

let cached: AppConfig | null = null;
let pending: Promise<AppConfig | null> | null = null;

export function loadAppConfig(): Promise<AppConfig | null> {
  if (cached) return Promise.resolve(cached);
  pending ??= api.getAppConfig().then((r) => {
    pending = null;
    if (r.success) cached = r.data;
    return cached;
  });
  return pending;
}

/** null until loaded; billing features stay hidden until the API says they exist. */
export function useAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(cached);
  useEffect(() => {
    let alive = true;
    if (!cached) void loadAppConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);
  return config;
}

/** Forget the cached value, e.g. after the first owner signs up and sign-up closes. */
export function resetAppConfig() {
  cached = null;
}
