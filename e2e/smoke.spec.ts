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
  test(`airborne: ground and box visible ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    const samples: { steps: number; top: number; bottom: number; boxY: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const s = await page.evaluate(() => ({
        steps: window.__WC__.simSteps,
        top: window.__WC__.view.top,
        bottom: window.__WC__.view.bottom,
        boxY: window.__WC__.boxY,
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
      expect(s.boxY).toBeGreaterThan(0.5);
      expect(s.boxY).toBeLessThanOrEqual(s.top);
      expect(s.boxY).toBeGreaterThanOrEqual(s.bottom);
    }
  });
}

// Camera smoothness. The log runs >= 3 s wall AND >= 300 sim steps (software GL at 1920x1080 is slow).
// d2 = vertical camera acceleration in m, normalised to a 60 Hz frame (uneven headless frame times
// would otherwise inflate a plain second difference). Measured smooth max is far below CAM_D2_MAX;
// the old 0.15 s lerp rig measured well above it on the landing.
const CAM_D2_MAX = 0.01;
for (const { w, h } of [{ w: 1920, h: 1080 }, { w: 390, h: 844 }]) {
  test(`camera smoothness ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?camlog=1');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    await page.waitForFunction(
      () => {
        const l = window.__WC__.camLog;
        return !!l && l.length > 1 && l[l.length - 1]!.t - l[0]!.t >= 3000 && l[l.length - 1]!.steps >= 300;
      },
      undefined,
      { timeout: 60_000 },
    );
    const log = await page.evaluate(() => window.__WC__.camLog!);
    expect(log.length).toBeGreaterThan(20);

    // zoom velocity sign changes
    let signs = 0;
    let last = 0;
    for (let i = 1; i < log.length; i++) {
      const dz = log[i]!.zoom - log[i - 1]!.zoom;
      if (Math.abs(dz) < 1e-9 * log[i]!.zoom) continue;
      const s = Math.sign(dz);
      if (last !== 0 && s !== last) signs++;
      last = s;
    }
    expect(signs).toBeLessThanOrEqual(1);

    // After the box first lands (centre at rest height, <= 0.55 m): the dead-zone target must not move at
    // all from the landing on, and the camera itself (spring tail from the fall) must be still 2 s later.
    const landed = log.findIndex((e) => e.boxY <= 0.55);
    expect(landed).toBeGreaterThan(0);
    const range = (v: number[]): number => Math.max(...v) - Math.min(...v);
    const tyTravel = range(log.slice(landed).map((e) => e.ty));
    const settled = log.filter((e) => e.t >= log[landed]!.t + 2000);
    expect(settled.length).toBeGreaterThan(5);
    const syTravel = range(settled.map((e) => e.sy));
    expect(tyTravel).toBeLessThan(0.05);
    expect(syTravel).toBeLessThan(0.05);

    let d2 = 0;
    for (let i = 2; i < log.length; i++) {
      const a = log[i - 2]!;
      const b = log[i - 1]!;
      const c = log[i]!;
      const d1 = (b.t - a.t) / 1000;
      const d2t = (c.t - b.t) / 1000;
      if (d1 <= 0 || d2t <= 0) continue;
      const acc = ((c.sy - b.sy) / d2t - (b.sy - a.sy) / d1) / ((d1 + d2t) / 2);
      d2 = Math.max(d2, Math.abs(acc) / 3600);
    }
    console.log(`CAMLOG ${w}x${h} frames=${log.length} zoomSignChanges=${signs} tyTravel=${tyTravel.toFixed(4)} syTravelSettled=${syTravel.toFixed(4)} maxD2=${d2.toFixed(5)}`);
    expect(d2).toBeLessThan(CAM_D2_MAX);
  });
}
