import { test, expect } from '@playwright/test';

// Every customer page, logged in, on desktop and phone: Persian, no leaked implementation
// details, no broken data, no horizontal scroll. Needs the API (API_URL) and a web server.
const API = process.env.API_URL || 'http://localhost:3001';
const WEB = process.env.FRONTEND_URL || 'http://localhost:5173';
const JARGON = /no fake|— real|real api|PROVIDER_NOT_CONFIGURED|keyword_rankings|FOR UPDATE|idempotency|undefined|\bNaN\b|\[object Object\]/i;
const PAGES = ['', 'audit', 'keywords', 'rankings', 'competitors', 'backlinks', 'content', 'geo', 'aeo', 'reports', 'alerts', 'automation'];
const GLOBAL = ['projects', 'billing', 'team', 'settings', 'api', 'agency', 'integrations'];

for (const [label, viewport] of [['desktop', { width: 1366, height: 850 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`all pages are clean on ${label}`, async ({ page, request }) => {
    test.skip(!process.env.DATABASE_URL, 'requires the running stack and an isolated test database');
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    const email = `walk-${label}-${Date.now()}@example.test`;
    const password = 'Str0ng!Passw0rd#22';
    const headers = { Origin: WEB };
    const signup = await request.post(`${API}/api/v1/auth/signup`, { headers, data: { email, password, name: 'کاربر تست' } });
    expect(signup.status()).toBe(201);
    const token = (await signup.json()).data.token;
    const auth = { ...headers, Authorization: `Bearer ${token}` };
    const project = await request.post(`${API}/api/v1/projects`, { headers: auth, data: { name: 'سایت', domain: 'fixture.rankforge.test', country: 'IR', language: 'fa' } });
    const id = (await project.json()).data.id;
    await request.post(`${API}/api/v1/projects/${id}/keywords`, { headers: auth, data: { keywords: ['mock keyword'] } });
    await request.post(`${API}/api/v1/projects/${id}/rankings/check`, { headers: auth, data: {} });
    await page.waitForTimeout(3000);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(WEB);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('form button[type=submit]').click();
    await expect(page.getByRole('button', { name: 'خروج', exact: true })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    for (const path of [...PAGES.map((p) => `projects/${id}/${p}`), ...GLOBAL]) {
      await page.goto(`${WEB}/#/${path}`);
      await page.waitForTimeout(800);
      const text = await page.locator('main').innerText();
      expect.soft(text.match(JARGON)?.[0], `implementation detail on ${path}`).toBeUndefined();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `horizontal scroll on ${path}`).toBeLessThanOrEqual(0);
      if (label === 'phone') {
        const box = await page.locator('main').boundingBox();
        expect.soft(box!.width, `content width on ${path}`).toBeGreaterThan(280);
      }
    }
    expect(errors).toEqual([]);
  });
}
