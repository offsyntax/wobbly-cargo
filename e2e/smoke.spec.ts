import { test, expect } from '@playwright/test';

const SIZES = [
  { w: 390, h: 844 },
  { w: 390, h: 664 },
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
    if (w === 390) {
      // Phone: canvas fills the viewport, no bars.
      expect(Math.abs(b.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.width - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - h)).toBeLessThanOrEqual(1);
    } else {
      // Wide: letterboxed left/right, inside the viewport and centered.
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.y).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
      expect(Math.abs(b.x + b.width / 2 - w / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.y + b.height / 2 - h / 2)).toBeLessThanOrEqual(1);
      expect(b.width).toBeLessThan(w - 10);
    }

    await page.screenshot({ path: `test-results/shot-${w}x${h}.png` });
    expect(problems).toEqual([]);
  });
}
