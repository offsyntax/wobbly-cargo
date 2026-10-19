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

import { CameraRig, deadZone, smoothDamp, stepZoomHold } from './camera';

describe('smoothDamp', () => {
  it('converges without overshoot', () => {
    let v = 0;
    let x = 0;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      const r = smoothDamp(x, 10, v, 0.45, 1 / 60);
      x = r.value;
      v = r.velocity;
      max = Math.max(max, x);
    }
    expect(max).toBeLessThanOrEqual(10);
    expect(x).toBeCloseTo(10, 3);
  });
  it('no overshoot from an initial velocity toward the target, and from above', () => {
    let x = 9.9;
    let v = 50;
    for (let i = 0; i < 300; i++) {
      const r = smoothDamp(x, 10, v, 0.25, 1 / 60);
      x = r.value;
      v = r.velocity;
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
    }
    x = 20;
    v = 0;
    for (let i = 0; i < 300; i++) {
      const r = smoothDamp(x, 10, v, 0.8, 1 / 60);
      x = r.value;
      v = r.velocity;
      expect(x).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });
  it('is frame-rate independent enough (60 vs 144 Hz)', () => {
    const run = (hz: number): number => {
      let x = 0;
      let v = 0;
      for (let i = 0; i < hz * 0.5; i++) ({ value: x, velocity: v } = smoothDamp(x, 1, v, 0.45, 1 / hz));
      return x;
    };
    expect(Math.abs(run(60) - run(144))).toBeLessThan(0.01);
  });
});

describe('deadZone', () => {
  it('ignores moves inside the band', () => {
    expect(deadZone(5, 5.09, 0.1)).toBe(5);
    expect(deadZone(5, 4.91, 0.1)).toBe(5);
  });
  it('drags along the band edge outside it', () => {
    expect(deadZone(5, 6, 0.1)).toBeCloseTo(5.9, 9);
    expect(deadZone(5, 3, 0.1)).toBeCloseTo(3.1, 9);
  });
  it('rig target does not move for a 0.3 m bounce at 1920x1080', () => {
    const rig = new CameraRig();
    const inp = (y: number) => ({
      vehicleX: 0, vehicleY: y, groundY: 0, viewW: 1920, viewH: 1080, baseZoom: 120, anchorX: 0.32, anchorY: 0.55,
    });
    rig.update(0, inp(0.5), true);
    const y0 = rig.y;
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60, inp(0.5 + 0.3 * Math.abs(Math.sin(i / 8))));
      expect(rig.y).toBeCloseTo(y0, 9);
    }
  });
});

describe('stepZoomHold', () => {
  it('zooms out immediately', () => {
    expect(stepZoomHold({ held: 1, timer: 0 }, 0.8, 1 / 60).held).toBe(0.8);
  });
  it('zooms in only after 0.5 s sustained >= +0.05', () => {
    let s = { held: 0.8, timer: 0 };
    for (let i = 0; i < 29; i++) s = stepZoomHold(s, 0.9, 1 / 60);
    expect(s.held).toBe(0.8);
    for (let i = 0; i < 3; i++) s = stepZoomHold(s, 0.9, 1 / 60);
    expect(s.held).toBe(0.9);
  });
  it('a brief spike (bounce) resets the timer and never zooms in', () => {
    let s = { held: 0.8, timer: 0 };
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 20; i++) s = stepZoomHold(s, 0.9, 1 / 60);
      s = stepZoomHold(s, 0.82, 1 / 60);
    }
    expect(s.held).toBe(0.8);
  });
  it('small rises under 0.05 are ignored', () => {
    let s = { held: 0.8, timer: 0 };
    for (let i = 0; i < 120; i++) s = stepZoomHold(s, 0.84, 1 / 60);
    expect(s.held).toBe(0.8);
  });
});
