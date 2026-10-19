import { test, expect, type Page } from '@playwright/test';

const SIZES = [
  { w: 390, h: 844 },
  { w: 844, h: 390 },
  { w: 600, h: 600 },
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1080 },
];

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', ''].includes(u.hostname) && u.protocol.startsWith('http')) problems.push(`external request: ${r.url()}`);
  });
  return problems;
}

async function expectFills(page: Page, w: number, h: number): Promise<void> {
  await expect
    .poll(async () => {
      const b = await page.locator('canvas').boundingBox();
      return b ? [b.x, b.y, b.width, b.height].map((v) => Math.round(v)).join(',') : '';
    })
    .toMatch(new RegExp(`^-?[01],-?[01],(${w - 1}|${w}|${w + 1}),(${h - 1}|${h}|${h + 1})$`));
}

const steps = (page: Page): Promise<number> => page.evaluate(() => window.__WC__.simSteps);

for (const { w, h } of SIZES) {
  test(`smoke ${w}x${h}`, async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    await page.waitForFunction(() => window.__WC__.simSteps > 240); // sim time, not wall time: slow software GL at large sizes

    await expectFills(page, w, h);
    // HUD text: Phaser text is canvas-drawn, so check the title's reported screen bounds.
    const hud = await page.evaluate(() => window.__WC__.hud);
    expect(hud.x).toBeGreaterThanOrEqual(0);
    expect(hud.y).toBeGreaterThanOrEqual(0);
    expect(hud.x + hud.w).toBeLessThanOrEqual(w);
    expect(hud.y + hud.h).toBeLessThanOrEqual(h);

    await page.screenshot({ path: `test-results/shot-${w}x${h}.png` });
    expect(problems).toEqual([]);
  });
}

test('backing store is css x min(dpr,2)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  const c = await page.evaluate(() => {
    const el = document.querySelector('canvas')!;
    return { w: el.width, h: el.height };
  });
  expect(c).toEqual({ w: 780, h: 1688 });
  await ctx.close();
});

test('live resize keeps sim state', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  await page.waitForFunction(() => window.__WC__.simSteps > 30);
  const before = await steps(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectFills(page, 844, 390);
  const after = await steps(page);
  expect(after).toBeGreaterThanOrEqual(before);
  await page.waitForTimeout(300);
  expect(await steps(page)).toBeGreaterThan(after);
  expect(await page.evaluate(() => window.__WC__.scene)).toBe('Game');
  expect(problems).toEqual([]);
});

test('input: mouse, keys, pause', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
  await page.goto('/');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  const held = (): Promise<boolean> => page.evaluate(() => window.__WC__.held);

  await page.mouse.move(300, 300);
  await page.mouse.down();
  expect(await held()).toBe(true);
  await page.mouse.up();
  expect(await held()).toBe(false);

  await page.keyboard.down('Space');
  expect(await held()).toBe(true);
  await page.keyboard.up('Space');
  expect(await held()).toBe(false);
  await page.keyboard.down('ArrowUp');
  expect(await held()).toBe(true);
  await page.keyboard.up('ArrowUp');
  expect(await held()).toBe(false);

  await page.keyboard.press('p');
  expect(await page.evaluate(() => window.__WC__.paused)).toBe(true);
  const s1 = await steps(page);
  await page.waitForTimeout(300);
  expect(await steps(page)).toBe(s1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__WC__.paused)).toBe(false);
  await page.waitForTimeout(300);
  expect(await steps(page)).toBeGreaterThan(s1);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('input: touch via real touch events (touchscreen API)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    // page.touchscreen.tap only offers tap (down+up); sample held between via a pointerdown listener.
    await page.evaluate(() => {
      const w = window as unknown as { __seen: boolean[] };
      w.__seen = [];
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') w.__seen.push(window.__WC__.held);
      });
    });
    await page.touchscreen.tap(200, 400);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: boolean[] }).__seen[0])).toBe(true);
    expect(await page.evaluate(() => window.__WC__.held)).toBe(false);
  });
});

for (const { w, h } of [{ w: 1920, h: 1080 }, { w: 844, h: 390 }]) {
  test(`vehicle and ground visible at spawn ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    const samples: { steps: number; top: number; bottom: number; vehicleY: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const s = await page.evaluate(() => ({
        steps: window.__WC__.simSteps,
        top: window.__WC__.view.top,
        bottom: window.__WC__.view.bottom,
        vehicleY: window.__WC__.vehicleY,
      }));
      if (s.steps >= 40) break;
      samples.push(s);
      if (samples.length === 3) await page.screenshot({ path: `test-results/air-${w}x${h}.png` });
      await page.waitForTimeout(15);
    }
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.bottom).toBeLessThanOrEqual(0);
      expect(s.top).toBeGreaterThanOrEqual(0);
      expect(s.vehicleY).toBeGreaterThan(0.3);
      expect(s.vehicleY).toBeLessThanOrEqual(s.top);
      expect(s.vehicleY).toBeGreaterThanOrEqual(s.bottom);
    }
  });
}

// Camera smoothness on the real vehicle. d2 = vertical camera acceleration in m, normalised to a 60 Hz frame
// (uneven headless frame times would otherwise inflate a plain second difference).
const CAM_D2_MAX = 0.01;
for (const { w, h } of [{ w: 1920, h: 1080 }, { w: 390, h: 844 }]) {
  test(`camera smoothness ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?level=test-01&camlog=1');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    // phase 1: at rest. The dead-zone target must not move once the suspension has settled.
    await page.waitForFunction(() => window.__WC__.simSteps >= 150, undefined, { timeout: 60_000 });
    const restEnd = await page.evaluate(() => window.__WC__.camLog!.length);
    // phase 2: drive for 4 s of sim time.
    await page.keyboard.down('Space');
    const s0 = await steps(page);
    await page.waitForFunction((n) => window.__WC__.simSteps >= n + 240, s0, { timeout: 60_000 });
    await page.keyboard.up('Space');
    await page.waitForFunction((n) => window.__WC__.simSteps >= n + 300, s0, { timeout: 60_000 });
    const log = await page.evaluate(() => window.__WC__.camLog!);
    expect(log.length).toBeGreaterThan(30);

    const range = (v: number[]): number => Math.max(...v) - Math.min(...v);
    const rest = log.slice(Math.floor(restEnd / 2), restEnd);
    expect(range(rest.map((e) => e.ty))).toBeLessThan(0.05);
    expect(range(rest.map((e) => e.sy))).toBeLessThan(0.05);

    // zoom: speed zoom eases out while accelerating and back in after release (at most two direction changes)
    let signs = 0;
    let last = 0;
    for (let i = restEnd + 1; i < log.length; i++) {
      const dz = log[i]!.zoom - log[i - 1]!.zoom;
      if (Math.abs(dz) < 1e-9 * log[i]!.zoom) continue;
      const sg = Math.sign(dz);
      if (last !== 0 && sg !== last) signs++;
      last = sg;
    }
    expect(signs).toBeLessThanOrEqual(2);

    let d2 = 0;
    for (let i = restEnd + 2; i < log.length; i++) {
      const a = log[i - 2]!;
      const b = log[i - 1]!;
      const c = log[i]!;
      const d1 = (b.t - a.t) / 1000;
      const d2t = (c.t - b.t) / 1000;
      if (d1 <= 0 || d2t <= 0) continue;
      const acc = ((c.sy - b.sy) / d2t - (b.sy - a.sy) / d1) / ((d1 + d2t) / 2);
      d2 = Math.max(d2, Math.abs(acc) / 3600);
    }
    console.log(`CAMLOG ${w}x${h} frames=${log.length} zoomSignChanges=${signs} maxD2=${d2.toFixed(5)}`);
    expect(d2).toBeLessThan(CAM_D2_MAX);
  });
}

// --- gameplay -------------------------------------------------------------------------------------------

test('holding Space for 3 s of sim time drives the vehicle at least 10 m', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?level=test-01');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  await page.waitForFunction(() => window.__WC__.simSteps >= 60);
  const x0 = await page.evaluate(() => window.__WC__.vehicleX);
  const s0 = await steps(page);
  await page.keyboard.down('Space');
  await page.waitForFunction((n) => window.__WC__.simSteps >= n + 180, s0, { timeout: 60_000 });
  await page.keyboard.up('Space');
  const x1 = await page.evaluate(() => window.__WC__.vehicleX);
  expect(x1 - x0).toBeGreaterThanOrEqual(10);
  expect(problems).toEqual([]);
});

test('default level is city-01, ?level selects test-01 with 3 eggs', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  expect(await page.evaluate(() => window.__WC__.level)).toBe('city-01');
  await page.goto('/?level=test-01');
  await page.waitForFunction(() => window.__WC__?.ready === true && window.__WC__.level === 'test-01');
  expect(await page.evaluate(() => window.__WC__.cargoLeft)).toBe(3);
});

for (const { w, h } of [{ w: 390, h: 844 }, { w: 844, h: 390 }]) {
  test(`test-01 run ends in an overlay inside the viewport ${w}x${h}`, async ({ page }) => {
    test.setTimeout(150_000);
    const problems = watch(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?level=test-01');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => ['complete', 'fail'].includes(window.__WC__.state), undefined, { timeout: 90_000, polling: 250 });
    await page.keyboard.up('Space');
    const end = await page.evaluate(() => ({ state: window.__WC__.state, o: window.__WC__.overlay, b: window.__WC__.buttons }));
    expect(['complete', 'fail']).toContain(end.state);
    expect(end.o).not.toBeNull();
    const o = end.o!;
    expect(o.x).toBeGreaterThanOrEqual(0);
    expect(o.y).toBeGreaterThanOrEqual(0);
    expect(o.x + o.w).toBeLessThanOrEqual(w);
    expect(o.y + o.h).toBeLessThanOrEqual(h);
    expect(end.b.length).toBeGreaterThan(0);
    for (const b of end.b) {
      expect(b.w).toBeGreaterThanOrEqual(44);
      expect(b.h).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(w);
      expect(b.y + b.h).toBeLessThanOrEqual(h);
    }
    await page.screenshot({ path: `test-results/overlay-${end.state}-${w}x${h}.png` });
    expect(problems).toEqual([]);
  });
}

test('Retry is instant, a held key does not drive until pressed again, R and the button both retry', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?level=test-01');
  await page.waitForFunction(() => window.__WC__?.ready === true);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => ['complete', 'fail'].includes(window.__WC__.state), undefined, { timeout: 90_000, polling: 250 });
  // Space is still down: R retries, the held key must not drive
  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__WC__.state)).toBe('play');
  expect(await page.evaluate(() => window.__WC__.held)).toBe(false);
  const s0 = await steps(page);
  await page.waitForFunction((n) => window.__WC__.simSteps >= n + 45, s0, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__WC__.vehicleX)).toBeLessThan(3.5);
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => window.__WC__.held)).toBe(true);
  await page.keyboard.up('Space');

  // pause overlay: the button resumes without driving
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__WC__.state)).toBe('paused');
  const btn = await page.evaluate(() => window.__WC__.buttons[0]!);
  await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
  expect(await page.evaluate(() => window.__WC__.state)).toBe('play');
  expect(await page.evaluate(() => window.__WC__.held)).toBe(false);
  expect(problems).toEqual([]);
});
