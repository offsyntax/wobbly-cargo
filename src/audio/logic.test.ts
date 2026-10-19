import { describe, expect, it } from 'vitest';
import { PICKUP_ENGINE, IMPACT_TIERS } from '../data/audio';
import { RateLimiter, RpmModel, VoiceLimiter, engineCutoff, engineLayerMix, impactParams, impactTier } from './logic';

const P = PICKUP_ENGINE;
const run = (m: RpmModel, i: { rearWheelAngVel: number; hold: boolean; airborne: boolean }, sec: number) => {
  let landed = false;
  for (let t = 0; t < sec; t += 1 / 60) landed = m.update(i, 1 / 60) || landed;
  return landed;
};

describe('RpmModel', () => {
  it('idles at rest and follows wheel speed with inertia', () => {
    const m = new RpmModel(P);
    run(m, { rearWheelAngVel: 0, hold: false, airborne: false }, 1);
    expect(m.rpm).toBeCloseTo(P.idleRpm, 0);
    m.update({ rearWheelAngVel: P.wheelOmegaAtMax / 2, hold: false, airborne: false }, 1 / 60);
    expect(m.norm).toBeGreaterThan(0);
    expect(m.norm).toBeLessThan(0.1); // inertia: no jump
    run(m, { rearWheelAngVel: P.wheelOmegaAtMax / 2, hold: false, airborne: false }, 3);
    expect(m.norm).toBeCloseTo(0.5, 2);
  });

  it('hold adds load boost on the ground', () => {
    const m = new RpmModel(P);
    run(m, { rearWheelAngVel: 10, hold: true, airborne: false }, 3);
    expect(m.norm).toBeCloseTo(10 / P.wheelOmegaAtMax + P.holdBoost, 2);
  });

  it('airborne + hold revs up much faster than on the ground', () => {
    const ground = new RpmModel(P), air = new RpmModel(P);
    run(ground, { rearWheelAngVel: P.wheelOmegaAtMax, hold: true, airborne: false }, 0.15);
    run(air, { rearWheelAngVel: 0, hold: true, airborne: true }, 0.15);
    expect(air.norm).toBeGreaterThan(0.8);
    expect(air.norm).toBeGreaterThan(ground.norm + 0.2);
  });

  it('airborne without hold falls to idle', () => {
    const m = new RpmModel(P);
    run(m, { rearWheelAngVel: 0, hold: true, airborne: true }, 0.5);
    run(m, { rearWheelAngVel: 0, hold: false, airborne: true }, 4);
    expect(m.norm).toBeLessThan(0.02);
  });

  it('landing reports once and dips RPM', () => {
    const m = new RpmModel(P);
    run(m, { rearWheelAngVel: 0, hold: true, airborne: true }, 1);
    const before = m.norm;
    const landed = m.update({ rearWheelAngVel: P.wheelOmegaAtMax, hold: true, airborne: false }, 1 / 60);
    expect(landed).toBe(true);
    expect(m.norm).toBeLessThan(before - P.landDip * 0.9);
    expect(m.update({ rearWheelAngVel: P.wheelOmegaAtMax, hold: true, airborne: false }, 1 / 60)).toBe(false);
  });
});

describe('engine layers', () => {
  it('equal-power crossfade between neighbours', () => {
    for (const rpm of [800, 1200, 2000, 2700, 4000, 5500]) {
      const mix = engineLayerMix(rpm, P);
      const power = mix.reduce((s, m) => s + m.gain * m.gain, 0);
      expect(power).toBeCloseTo(1, 5);
      expect(mix.filter((m) => m.gain > 1e-9).length).toBeLessThanOrEqual(2);
    }
    expect(engineLayerMix(P.idleRpm, P)[0].gain).toBe(1);
    expect(engineLayerMix(P.maxRpm, P)[3].gain).toBe(1);
  });

  it('playback rate stays within 0.8–1.8', () => {
    for (let rpm = 300; rpm <= 9000; rpm += 100) {
      for (const m of engineLayerMix(rpm, P)) {
        expect(m.rate).toBeGreaterThanOrEqual(0.8);
        expect(m.rate).toBeLessThanOrEqual(1.8);
      }
    }
  });

  it('low-pass opens with throttle', () => {
    expect(engineCutoff(0, 0, P)).toBeCloseTo(P.lowpassMinHz);
    expect(engineCutoff(1, 1, P)).toBeCloseTo(P.lowpassMaxHz);
    expect(engineCutoff(1, 0.3, P)).toBeGreaterThan(engineCutoff(0, 0.3, P) * 3);
  });
});

describe('impact tiers', () => {
  it('selects soft / medium / hard by impulse', () => {
    expect(impactTier(IMPACT_TIERS.min - 0.01)).toBeNull();
    expect(impactTier(Number.NaN)).toBeNull();
    expect(impactTier(IMPACT_TIERS.min)?.tier).toBe('soft');
    expect(impactTier(IMPACT_TIERS.medium - 0.01)?.tier).toBe('soft');
    expect(impactTier(IMPACT_TIERS.medium)?.tier).toBe('medium');
    expect(impactTier(IMPACT_TIERS.hard)?.tier).toBe('hard');
    expect(impactTier(1e6)?.strength).toBe(1);
  });

  it('louder and lower for stronger hits; jitter within ±5 % / ±2 dB', () => {
    const weak = impactParams(0.1, 0, 0), strong = impactParams(0.9, 0, 0);
    expect(strong.gain).toBeGreaterThan(weak.gain);
    expect(strong.rate).toBeLessThan(weak.rate);
    const hi = impactParams(0.5, 1, 1), lo = impactParams(0.5, -1, -1), mid = impactParams(0.5, 0, 0);
    expect(hi.rate / mid.rate).toBeCloseTo(1.05, 5);
    expect(lo.rate / mid.rate).toBeCloseTo(0.95, 5);
    expect(20 * Math.log10(hi.gain / mid.gain)).toBeCloseTo(2, 5);
    expect(20 * Math.log10(lo.gain / mid.gain)).toBeCloseTo(-2, 5);
  });
});

describe('VoiceLimiter', () => {
  it('allows 4 voices, then steals the quietest or drops the new one', () => {
    const v = new VoiceLimiter<string>(4);
    ['a', 'b', 'c', 'd'].forEach((h, i) => {
      expect(v.request(0.5 + i * 0.1, 0).play).toBe(true);
      v.add(h, 0.5 + i * 0.1, 10);
    });
    expect(v.request(0.4, 1)).toEqual({ play: false });
    expect(v.request(0.9, 1)).toEqual({ play: true, steal: 'a' });
    v.add('e', 0.9, 10);
    expect(v.active(1)).toBe(4);
  });

  it('frees voices when they end', () => {
    const v = new VoiceLimiter<number>(4);
    for (let i = 0; i < 4; i++) v.add(i, 1, 0.5);
    expect(v.request(0.1, 0.2).play).toBe(false);
    expect(v.request(0.1, 0.6)).toEqual({ play: true });
  });
});

describe('RateLimiter', () => {
  it('fires at most once per interval', () => {
    const r = new RateLimiter(1);
    expect(r.tryFire(0)).toBe(true);
    expect(r.tryFire(0.5)).toBe(false);
    expect(r.tryFire(0.99)).toBe(false);
    expect(r.tryFire(1)).toBe(true);
    let n = 0;
    for (let k = 0; k < 40; k++) if (r.tryFire(2 + k * 0.25)) n++; // exact binary steps
    expect(n).toBe(10);
  });
});
