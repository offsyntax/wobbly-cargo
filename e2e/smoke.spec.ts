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
