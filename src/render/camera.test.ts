import { describe, it, expect } from 'vitest';
import { anchor, baseZoom, clamp, clampZoomMul } from './camera';

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
