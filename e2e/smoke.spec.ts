import { test, expect } from '@playwright/test';

const SIZES = [
  { w: 390, h: 844 },
  { w: 600, h: 600 },
  { w: 1280, h: 720 },
];

for (const { w, h } of SIZES) {
  test(`smoke ${w}x${h}`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', ''].includes(u.hostname) && u.protocol.startsWith('http')) problems.push(`external request: ${r.url()}`);
    });

    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForFunction(() => window.__WC__?.ready === true);
    await page.waitForTimeout(600); // let the box fall

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    const b = box!;
    expect(b.x).toBeGreaterThanOrEqual(-0.5);
    expect(b.y).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
    expect(b.width / b.height).toBeCloseTo(390 / 844, 1);

    await page.screenshot({ path: `test-results/shot-${w}x${h}.png` });
    expect(problems).toEqual([]);
  });
}
