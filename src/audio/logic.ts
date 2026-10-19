// Pure audio logic (no Web Audio): RPM model, layer crossfade, impact tiers, voice limiting,
// rate limiting. Unit-tested in logic.test.ts.
import type { EngineProfile, ImpactTier } from '../data/audio';
import { IMPACT_TIERS } from '../data/audio';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Exponential smoothing factor for time constant tau over dt. */
export const smooth = (dt: number, tau: number) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));

export interface RpmInput {
  rearWheelAngVel: number;
  hold: boolean;
  airborne: boolean;
}

/** Engine RPM with inertia, built from rear-wheel angular velocity and hold (GDD §11.1). */
export class RpmModel {
  /** Normalized RPM 0 (idle) .. 1 (max). */
  norm = 0;
  private wasAirborne = false;
  private airTime = 0;
  constructor(public profile: EngineProfile) {}

  get rpm(): number {
    const p = this.profile;
    return p.idleRpm + (p.maxRpm - p.idleRpm) * this.norm;
  }

  target(i: RpmInput): number {
    const p = this.profile;
    if (i.airborne) return i.hold ? 1 : 0; // free-spinning wheels rev out; off-throttle falls to idle
    const wheel = clamp(Math.abs(i.rearWheelAngVel) / p.wheelOmegaAtMax, 0, 1);
    return clamp(wheel + (i.hold ? p.holdBoost : 0), 0, 1);
  }

  /** Advance by dt seconds. Returns true on the step the vehicle lands. */
  update(i: RpmInput, dt: number): boolean {
    const p = this.profile;
    let landed = false;
    if (i.airborne) this.airTime += dt;
    else if (this.wasAirborne) {
      landed = true;
      const strength = clamp(this.airTime / p.landDipAirTime, 0.25, 1);
      this.norm = Math.max(0, this.norm - p.landDip * strength);
      this.airTime = 0;
    }
    this.wasAirborne = i.airborne;
    const tgt = this.target(i);
    const tau = tgt > this.norm ? (i.airborne && i.hold ? p.tauRiseAir : p.tauRise) : p.tauFall;
    this.norm += (tgt - this.norm) * smooth(dt, tau);
    this.norm = clamp(this.norm, 0, 1);
    return landed;
  }

  reset(): void {
    this.norm = 0;
    this.wasAirborne = false;
    this.airTime = 0;
  }
}

/**
 * Equal-power crossfade between neighbouring layers by RPM (log-RPM space) and the
 * per-layer playback rate (rpm / nativeRpm, clamped to [minRate, maxRate]).
 */
export function engineLayerMix(rpm: number, p: EngineProfile): { gain: number; rate: number }[] {
  const L = p.layers;
  const lr = Math.log(rpm);
  const out = L.map((l) => ({ gain: 0, rate: clamp(rpm / l.nativeRpm, p.minRate, p.maxRate) }));
  if (lr <= Math.log(L[0].nativeRpm)) out[0].gain = 1;
  else if (lr >= Math.log(L[L.length - 1].nativeRpm)) out[L.length - 1].gain = 1;
  else {
    for (let k = 0; k < L.length - 1; k++) {
      const a = Math.log(L[k].nativeRpm), b = Math.log(L[k + 1].nativeRpm);
      if (lr >= a && lr <= b) {
        const x = (lr - a) / (b - a);
        out[k].gain = Math.cos((x * Math.PI) / 2);
        out[k + 1].gain = Math.sin((x * Math.PI) / 2);
        break;
      }
    }
  }
  return out;
}

/** Low-pass cutoff (Hz) from smoothed throttle 0..1 and RPM 0..1 (exponential sweep). */
export function engineCutoff(throttle: number, rpmNorm: number, p: EngineProfile): number {
  const x = clamp(0.75 * throttle + 0.25 * rpmNorm, 0, 1);
  return p.lowpassMinHz * Math.pow(p.lowpassMaxHz / p.lowpassMinHz, x);
}

export interface TierPick {
  tier: ImpactTier;
  /** 0..1 position of the impulse inside the scale (drives volume and pitch). */
  strength: number;
}

/** Impulse → soft / medium / hard tier, or null below the audible threshold. */
export function impactTier(impulse: number, t = IMPACT_TIERS): TierPick | null {
  if (!(impulse >= t.min)) return null;
  const tier: ImpactTier = impulse < t.medium ? 'soft' : impulse < t.hard ? 'medium' : 'hard';
  const strength = clamp(Math.log(impulse / t.min) / Math.log(t.max / t.min), 0, 1);
  return { tier, strength };
}

/** Volume (linear) and playback rate for an impact; jitter values in [-1, 1]. */
export function impactParams(
  strength: number,
  jitterPitch: number,
  jitterVol: number,
  pitchJitter = 0.05,
  volumeJitterDb = 2,
): { gain: number; rate: number } {
  const gain = (0.35 + 0.65 * strength) * Math.pow(10, (volumeJitterDb * jitterVol) / 20);
  const rate = (1.08 - 0.16 * strength) * (1 + pitchJitter * jitterPitch);
  return { gain, rate };
}

/** Minimum-interval gate (e.g. exhaust pop max 1 per second, cargo rattle). */
export class RateLimiter {
  private last = -Infinity;
  constructor(public interval: number) {}
  tryFire(now: number): boolean {
    if (now - this.last < this.interval) return false;
    this.last = now;
    return true;
  }
  reset(): void {
    this.last = -Infinity;
  }
}

interface Voice<T> {
  gain: number;
  end: number;
  handle: T;
}

/**
 * Max N simultaneous voices per family; when full, the quietest voice is dropped
 * (the new one is dropped if it is the quietest).
 */
export class VoiceLimiter<T> {
  private voices: Voice<T>[] = [];
  constructor(public max: number) {}

  /** Returns whether to play, and which existing voice (if any) to stop. */
  request(gain: number, now: number): { play: boolean; steal?: T } {
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length < this.max) return { play: true };
    let q = 0;
    for (let i = 1; i < this.voices.length; i++) if (this.voices[i].gain < this.voices[q].gain) q = i;
    if (gain <= this.voices[q].gain) return { play: false };
    const [stolen] = this.voices.splice(q, 1);
    return { play: true, steal: stolen.handle };
  }

  add(handle: T, gain: number, end: number): void {
    this.voices.push({ handle, gain, end });
  }

  remove(handle: T): void {
    this.voices = this.voices.filter((v) => v.handle !== handle);
  }

  active(now: number): number {
    this.voices = this.voices.filter((v) => v.end > now);
    return this.voices.length;
  }
}
