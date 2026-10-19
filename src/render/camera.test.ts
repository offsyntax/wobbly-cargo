import { describe, it, expect } from 'vitest';
import { anchor, baseZoom, clamp, clampZoomMul, frameVertical } from './camera';

describe('baseZoom', () => {
  it('1280x720 -> 80', () => expect(baseZoom(1280, 720)).toBeCloseTo(80, 5));
  it('1920x1080 -> 120', () => expect(baseZoom(1920, 1080)).toBeCloseTo(120, 5));
  it('390x844 -> 24.375', () => expect(baseZoom(390, 844)).toBeCloseTo(24.375, 3));
  it('844x390 limited by height', () => expect(baseZoom(844, 390)).toBeCloseTo(43.33, 1));
  it('invalid -> 1', () => expect(baseZoom(0, 0)).toBe(1));
});

describe('anchor', () => {
  it('x is always 0.32', () => {
    for (const [w, h] of [[390, 844], [1, 1], [2560, 1080]]) expect(anchor(w!, h!).x).toBe(0.32);
  });
  it('wide -> 0.55', () => {
    expect(anchor(1920, 1080).y).toBeCloseTo(0.55, 6);
    expect(anchor(2560, 1080).y).toBeCloseTo(0.55, 6);
  });
  it('tall -> 0.62', () => {
    expect(anchor(360, 640).y).toBeCloseTo(0.62, 6);
    expect(anchor(390, 844).y).toBeCloseTo(0.62, 2);
    expect(anchor(300, 1000).y).toBeCloseTo(0.62, 6);
  });
  it('1:1 is midway', () => expect(anchor(600, 600).y).toBeCloseTo(0.585, 6));
  it('monotonic with aspect', () => {
    expect(anchor(844, 390).y).toBeLessThan(anchor(600, 600).y);
    expect(anchor(600, 600).y).toBeLessThan(anchor(390, 844).y);
  });
});

describe('clamp', () => {
  it('clamp', () => expect(clamp(5, 0, 3)).toBe(3));
  it('zoom mul range', () => {
    expect(clampZoomMul(0.1)).toBe(0.75);
    expect(clampZoomMul(2)).toBe(1);
    expect(clampZoomMul(0.9)).toBe(0.9);
  });
});

describe('frameVertical', () => {
  const base = baseZoom(1920, 1000); // ~111 px/m, view ~9 m
  const common = { viewW: 1920, viewH: 1000, baseZoom: base, anchorY: 0.55, margin: 0.12 };
  const bounds = (c: { centerY: number; zoomMul: number }) => {
    const h = 1000 / (base * c.zoomMul);
    return { top: c.centerY + h / 2, bottom: c.centerY - h / 2, h };
  };
  it('on the ground: anchor framing, mul 1', () => {
    const c = frameVertical({ ...common, vehicleY: 0.5, groundY: 0 });
    expect(c.zoomMul).toBe(1);
    const h = 1000 / base;
    expect(c.centerY).toBeCloseTo(0.5 + 0.05 * h, 6);
  });
  it('8 m up: zooms out, ground and vehicle visible', () => {
    const c = frameVertical({ ...common, vehicleY: 8, groundY: 0 });
    const b = bounds(c);
    expect(c.zoomMul).toBeLessThan(1);
    expect(c.zoomMul).toBeGreaterThanOrEqual(0.75);
    expect(b.bottom).toBeLessThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(8);
  });
  it('12 m up: clamps at 0.75, vehicle visible near top margin', () => {
    const c = frameVertical({ ...common, vehicleY: 12, groundY: 0 });
    const b = bounds(c);
    expect(c.zoomMul).toBe(0.75);
    expect(b.top - 12).toBeCloseTo(0.12 * b.h, 6);
    expect(b.bottom).toBeGreaterThan(0);
  });
  it('uses groundY parameter', () => {
    const c = frameVertical({ ...common, vehicleY: 28, groundY: 20 });
    expect(c.zoomMul).toBeLessThan(1);
    const b = bounds(c);
    expect(b.bottom).toBeLessThanOrEqual(20);
    expect(b.top).toBeGreaterThanOrEqual(28);
  });
  it('vehicle never cut off', () => {
    for (let y = 0; y < 100; y += 3) {
      const b = bounds(frameVertical({ ...common, vehicleY: y, groundY: 0 }));
      expect(b.top).toBeGreaterThanOrEqual(y);
      expect(b.bottom).toBeLessThanOrEqual(y);
    }
  });
});
