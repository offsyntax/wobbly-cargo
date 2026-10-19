import { describe, it, expect } from 'vitest';
import { lerp, lerpAngle, lerpPose } from './interp';

describe('interp', () => {
  it('lerp', () => expect(lerp(2, 6, 0.25)).toBe(3));
  it('shortest arc across +-pi', () => {
    const a = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.cos(a) + 1)).toBeLessThan(1e-9); // lands at pi, not 0
  });
  it('handles unbounded angles', () => {
    expect(lerpAngle(0, 4 * Math.PI + 0.2, 0.5)).toBeCloseTo(0.1, 9);
  });
  it('alpha 0 / 1 give endpoints, clamped', () => {
    const p = { x: 0, y: 0, angle: 0 };
    const c = { x: 2, y: 4, angle: 1 };
    expect(lerpPose(p, c, 0)).toEqual(p);
    expect(lerpPose(p, c, 1)).toEqual(c);
    expect(lerpPose(p, c, 5)).toEqual(c);
    expect(lerpPose(p, c, 0.5)).toEqual({ x: 1, y: 2, angle: 0.5 });
  });
});
