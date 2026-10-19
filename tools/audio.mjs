// npm run audio
//   1. Generates our own procedural sources into audio/src/*.wav (only files that are missing;
//      pass --regen to overwrite them). Recorded third-party sources placed in audio/src with
//      the same name win: they are never overwritten without --regen.
//   2. Processes every audio/src/*.{wav,ogg,mp3,flac} -> public/audio/<name>.mp3:
//      trim silence, short fades (one-shots), zero-crossing loop cut (names ending in `_loop`),
//      loudness normalization (one-shots ≈ -16 LUFS, loops quieter), true peak ≤ -1 dBFS, mono MP3.
//   3. Prints a measurement table of the outputs (duration, integrated LUFS, true peak, loop seam).
//   `node tools/audio.mjs --measure` only prints the table for the existing outputs.
import { existsSync, readdirSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const SRC = 'audio/src';
const OUT = 'public/audio';
const SR = 44100;
const BITRATE = '64k';
const BUDGET = 1.5 * 1024 * 1024;
const args = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- loudness targets (LUFS)
// Short one-shots are measured by looping them to >= 3 s (≈ short-term loudness while playing).
const TARGETS = {
  default: -16,
  engine_idle_loop: -21,
  engine_low_loop: -21,
  engine_mid_loop: -21,
  engine_high_loop: -21,
  skid_loop: -22,
  cargo_rattle_1: -20,
  cargo_rattle_2: -20,
  cargo_rattle_3: -20,
  exhaust_pop_1: -18,
  exhaust_pop_2: -18,
  brake_squeak: -18,
};
const PEAK_LIMIT_DB = -1.0;

// ================================================================= procedural synthesis
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const TAU = Math.PI * 2;
const dbToLin = (db) => Math.pow(10, db / 20);

/** RBJ biquad; coefficients may be updated while running (time-varying sweeps). */
class Biquad {
  constructor(type, f, q, gainDb = 0) { this.z1 = this.z2 = 0; this.set(type, f, q, gainDb); }
  set(type, f, q, gainDb = 0) {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else { // peaking
      b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  // transposed direct form II
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Runs a filter chain over a circular buffer twice so the output is seamless when looped. */
function filterCircular(buf, filters) {
  const out = new Float32Array(buf.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < buf.length; i++) {
      let v = buf[i];
      for (const f of filters) v = f.run(v);
      if (pass === 1) out[i] = v;
    }
  }
  return out;
}
function filterLinear(buf, filters) {
  for (let i = 0; i < buf.length; i++) { let v = buf[i]; for (const f of filters) v = f.run(v); buf[i] = v; }
  return buf;
}
const sat = (buf, drive) => { for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / Math.tanh(drive); return buf; };
const mixInto = (dst, src, gain = 1, offset = 0) => {
  for (let i = 0; i < src.length && i + offset < dst.length; i++) dst[i + offset] += src[i] * gain;
};

/**
 * Engine loop: a train of exhaust pulses (one per cylinder firing) rendered into a circular
 * buffer, so the loop is seamless by construction. Each pulse = decaying resonant body +
 * a burst of noise; per-cylinder amplitude differences give the "lumpy" engine character.
 */
function engineLoop({ rpm, cylinders = 4, seconds = 1.5, seed, body, noise, bright, lumpy }) {
  const n = Math.round(seconds * SR);
  const buf = new Float32Array(n);
  const fire = (rpm / 60) * (cylinders / 2); // 4-stroke firing frequency
  const firings = Math.round(fire * seconds); // integer number of firings per loop
  const period = n / firings;
  const r = rng(seed);
  const cylGain = Array.from({ length: cylinders }, () => 1 - lumpy * r());
  const tau = Math.min(0.012, period / SR * 0.6);
  const pulseLen = Math.round(period * 2.5);
  for (let k = 0; k < firings; k++) {
    const start = Math.round(k * period + (r() - 0.5) * period * 0.03);
    const amp = cylGain[k % cylinders] * (0.85 + 0.3 * r());
    const fr = body * (0.95 + 0.1 * r());
    for (let j = 0; j < pulseLen; j++) {
      const t = j / SR;
      const env = Math.exp(-t / tau);
      const v = amp * env * (Math.sin(TAU * fr * t) + noise * (r() * 2 - 1) * Math.exp(-t / (tau * 0.4)));
      buf[(start + j) % n] += v;
    }
  }
  // low rumble at firing frequency + half-order (integer cycles per loop -> seamless)
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    buf[i] += 0.35 * Math.sin(TAU * firings * ph) + 0.15 * Math.sin(TAU * Math.round(firings / 2) * ph + 1.3);
  }
  let out = filterCircular(buf, [new Biquad('lp', bright, 0.8), new Biquad('peak', body * 2, 1.2, 4), new Biquad('hp', 30, 0.7)]);
  out = sat(out, 1.6);
  return out;
}

/** Non-looping engine burst with an RPM curve (rev blip). */
function engineSweep({ seconds, seed, rpmAt, body, noise, bright }) {
  const n = Math.round(seconds * SR);
  const buf = new Float32Array(n + SR);
  const r = rng(seed);
  let t = 0;
  while (t < seconds) {
    const rpm = rpmAt(t / seconds);
    const fire = rpm / 30;
    const start = Math.round(t * SR);
    const tau = Math.min(0.012, 0.6 / fire);
    const amp = 0.85 + 0.3 * r();
    for (let j = 0; j < SR * tau * 6; j++) {
      const tt = j / SR;
      const env = Math.exp(-tt / tau);
      buf[start + j] += amp * env * (Math.sin(TAU * body * tt) + noise * (r() * 2 - 1) * Math.exp(-tt / (tau * 0.4)));
    }
    t += 1 / fire;
  }
  const out = filterLinear(buf.subarray(0, n), [new Biquad('lp', bright, 0.8), new Biquad('peak', body * 2, 1.2, 4), new Biquad('hp', 30, 0.7)]);
  sat(out, 1.6);
  for (let i = 0; i < n; i++) { const p = i / n; out[i] *= Math.min(1, p * 40) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1); }
  return out;
}

/** Sine "thump" with exponential pitch drop. */
function thump(seconds, f0, f1, decay, seed = 1) {
  const n = Math.round(seconds * SR), out = new Float32Array(n), r = rng(seed);
  let ph = r() * 0.2;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / (decay * 0.5));
    ph += TAU * f / SR;
    out[i] = Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, t * 2000);
  }
  return out;
}
/** Filtered noise burst. */
function noiseBurst(seconds, decay, seed, filters, attack = 0.0005) {
  const n = Math.round(seconds * SR), out = new Float32Array(n), r = rng(seed);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (r() * 2 - 1) * Math.exp(-t / decay) * Math.min(1, t / attack); }
  return filterLinear(out, filters);
}
/** Inharmonic decaying partials (metal ring). */
function metal(seconds, partials, decay, seed) {
  const n = Math.round(seconds * SR), out = new Float32Array(n), r = rng(seed);
  for (const f of partials) {
    const a = 0.5 + 0.5 * r(), d = decay * (0.5 + r()), ph = r() * TAU;
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] += a * Math.sin(ph + TAU * f * t) * Math.exp(-t / d); }
  }
  return out;
}
/** Random clicks (rattle tail / cracks). */
function clicks(seconds, count, spanStart, spanEnd, seed, f, q, decayClick = 0.002, falloff = 0.15) {
  const n = Math.round(seconds * SR), out = new Float32Array(n), r = rng(seed);
  for (let k = 0; k < count; k++) {
    const t0 = spanStart + (spanEnd - spanStart) * Math.pow(r(), 1.3);
    const amp = (0.4 + 0.6 * r()) * Math.exp(-(t0 - spanStart) / falloff);
    const bp = new Biquad('bp', f * (0.7 + 0.6 * r()), q);
    const s = Math.round(t0 * SR);
    for (let j = 0; j < SR * decayClick * 8 && s + j < n; j++) {
      out[s + j] += bp.run((r() * 2 - 1) * amp * Math.exp(-j / SR / decayClick)) * 3;
    }
  }
  return out;
}
function silence(seconds) { return new Float32Array(Math.round(seconds * SR)); }

function impact(tier, v) {
  const seed = 100 * (tier === 'soft' ? 1 : tier === 'medium' ? 2 : 3) + v;
  const r = rng(seed);
  if (tier === 'soft') {
    const len = 0.35;
    const out = thump(len, 140 + 25 * v, 55, 0.07 + 0.01 * v, seed);
    mixInto(out, noiseBurst(len, 0.02, seed, [new Biquad('lp', 900 + 200 * v, 0.7)]), 0.5);
    mixInto(out, clicks(len, 3 + v, 0.01, 0.12, seed + 7, 1800, 4, 0.0015, 0.05), 0.15);
    return out;
  }
  if (tier === 'medium') {
    const len = 0.55;
    const out = thump(len, 120 + 20 * v, 45, 0.09 + 0.015 * v, seed);
    mixInto(out, noiseBurst(len, 0.035, seed, [new Biquad('lp', 1600 + 300 * v, 0.7), new Biquad('peak', 400, 1, 5)]), 0.7);
    mixInto(out, metal(len, [310 + 30 * r(), 587 + 40 * r(), 1043 + 60 * r()], 0.08, seed), 0.12);
    mixInto(out, clicks(len, 8 + 2 * v, 0.02, 0.3, seed + 3, 2400, 5, 0.0015, 0.12), 0.25);
    return sat(out, 1.4);
  }
  const len = 0.85;
  const out = thump(len, 110 + 15 * v, 38, 0.13 + 0.02 * v, seed);
  mixInto(out, noiseBurst(len, 0.06, seed, [new Biquad('lp', 3500 + 500 * v, 0.7), new Biquad('peak', 700, 1, 4)]), 0.9);
  mixInto(out, metal(len, [233 + 20 * r(), 419 + 30 * r(), 761 + 40 * r(), 1291 + 80 * r(), 2017 + 100 * r()], 0.14, seed), 0.22);
  mixInto(out, clicks(len, 18 + 3 * v, 0.03, 0.55, seed + 5, 2800, 5, 0.002, 0.2), 0.35);
  return sat(out, 1.8);
}

function roofCrunch() {
  const len = 1.0, seed = 501;
  const out = thump(len, 95, 35, 0.12, seed);
  // crunch: several dense noise grains, bright and mid
  for (let g = 0; g < 6; g++) {
    const grain = noiseBurst(0.12, 0.025, seed + g, [new Biquad('bp', 900 + g * 450, 1.2)]);
    mixInto(out, grain, 0.9 - g * 0.08, Math.round((0.005 + g * 0.018) * SR));
  }
  mixInto(out, metal(len, [187, 353, 611, 977, 1489, 2203], 0.22, seed), 0.3);
  mixInto(out, clicks(len, 40, 0.06, 0.95, seed + 9, 3000, 6, 0.0025, 0.35), 0.45);
  return sat(out, 2);
}

function cargoRattle(v) {
  const len = 0.16, seed = 700 + v;
  const out = silence(len);
  const r = rng(seed);
  const hits = 2 + (v % 2);
  for (let h = 0; h < hits; h++) {
    const f = 1300 + 700 * r() + 400 * v;
    const click = noiseBurst(0.05, 0.006, seed + h * 11, [new Biquad('bp', f, 6), new Biquad('peak', f * 0.5, 2, 6)]);
    mixInto(click, metal(0.05, [f * 0.5, f * 0.83], 0.01, seed + h), 0.25);
    mixInto(out, click, h === 0 ? 1 : 0.55, Math.round((h * (0.025 + 0.02 * r())) * SR));
  }
  return out;
}

function eggCrack() {
  const len = 0.32, seed = 801;
  const out = clicks(len, 9, 0.0, 0.2, seed, 3200, 3, 0.0012, 0.12);
  mixInto(out, clicks(len, 4, 0.0, 0.06, seed + 1, 1500, 2, 0.002, 0.05), 0.8);
  // faint shell creak: very short resonant chirp
  const creak = new Float32Array(Math.round(0.08 * SR));
  for (let i = 0; i < creak.length; i++) { const t = i / SR; creak[i] = Math.sin(TAU * (900 + 2500 * t) * t) * Math.exp(-t / 0.02) * 0.2; }
  mixInto(out, creak, 1, Math.round(0.03 * SR));
  return out;
}

function eggSplat() {
  const len = 0.7, seed = 901, r = rng(seed);
  const out = thump(len, 110, 40, 0.06, seed);
  // wet body: noise through a band-pass sweeping down, with bubbly amplitude wobble
  const n = Math.round(len * SR), wet = new Float32Array(n);
  const bp = new Biquad('bp', 1400, 1.5);
  let wob = 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 64 === 0) { bp.set('bp', 1400 * Math.exp(-t / 0.15) + 260, 1.5); wob = 0.6 + 0.8 * r(); }
    wet[i] = bp.run((r() * 2 - 1)) * Math.exp(-t / 0.14) * Math.min(1, t * 800) * wob;
  }
  mixInto(out, wet, 2.2);
  // droplets: short rising blips
  for (let d = 0; d < 4; d++) {
    const t0 = 0.08 + 0.35 * r(), f0 = 500 + 500 * r();
    const drop = new Float32Array(Math.round(0.04 * SR));
    for (let i = 0; i < drop.length; i++) { const t = i / SR; drop[i] = Math.sin(TAU * (f0 + 9000 * t) * t) * Math.exp(-t / 0.01); }
    mixInto(out, drop, 0.18 * (1 - d * 0.15), Math.round(t0 * SR));
  }
  return sat(out, 1.3);
}

function brakeSqueak() {
  const len = 0.5, n = Math.round(len * SR), out = new Float32Array(n), r = rng(1001);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / len;
    const f = 2350 - 250 * p + 35 * Math.sin(TAU * 28 * t);
    ph += TAU * f / SR;
    const env = Math.min(1, t / 0.03) * Math.pow(1 - p, 1.5) * (0.8 + 0.2 * Math.sin(TAU * 13 * t));
    out[i] = env * (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) + env * 0.05 * (r() * 2 - 1);
  }
  return filterLinear(out, [new Biquad('hp', 600, 0.7)]);
}

function skidLoop() {
  const seconds = 1.25, n = Math.round(seconds * SR), r = rng(1101);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = r() * 2 - 1;
  const a = filterCircular(buf, [new Biquad('bp', 950, 2.5)]);
  const b = filterCircular(buf, [new Biquad('bp', 1900, 4)]);
  const c = filterCircular(buf, [new Biquad('lp', 400, 0.7)]);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ph = i / n; // flutter with integer cycles per loop -> seamless
    const flutter = 0.75 + 0.15 * Math.sin(TAU * 15 * ph) + 0.1 * Math.sin(TAU * 37 * ph + 0.7);
    out[i] = (a[i] + 0.5 * b[i] + 0.6 * c[i]) * flutter;
  }
  return sat(out, 1.5);
}

function exhaustPop(v) {
  const len = 0.35, seed = 1200 + v, r = rng(seed), out = silence(len);
  const pops = 2 + v;
  let t = 0;
  for (let k = 0; k < pops; k++) {
    const p = noiseBurst(0.08, 0.008 + 0.004 * r(), seed + k, [new Biquad('lp', 700 + 500 * r(), 1.5), new Biquad('peak', 180, 1.5, 6)]);
    mixInto(p, thump(0.08, 160 + 60 * r(), 70, 0.015, seed + k), 0.6);
    mixInto(out, p, 1 - k * 0.2, Math.round(t * SR));
    t += 0.035 + 0.045 * r();
  }
  return sat(out, 2.2);
}

const PICKUP = { body: 95, noise: 0.55, lumpy: 0.25 };
const RECIPES = {
  engine_idle_loop: () => engineLoop({ rpm: 800, seed: 11, ...PICKUP, bright: 1400, noise: 0.4 }),
  engine_low_loop: () => engineLoop({ rpm: 2000, seed: 12, ...PICKUP, body: 110, bright: 2200 }),
  engine_mid_loop: () => engineLoop({ rpm: 3500, seed: 13, ...PICKUP, body: 130, bright: 3200, noise: 0.7 }),
  engine_high_loop: () => engineLoop({ rpm: 5500, seed: 14, ...PICKUP, body: 160, bright: 4500, noise: 0.9, lumpy: 0.15 }),
  rev_blip: () => engineSweep({ seconds: 0.55, seed: 21, body: 120, noise: 0.6, bright: 3200,
    rpmAt: (p) => 1200 + 3600 * Math.sin(Math.PI * Math.min(1, p * 1.4)) * (p < 0.35 ? 1 : 0.6 + 0.4 * (1 - p)) }),
  exhaust_pop_1: () => exhaustPop(1),
  exhaust_pop_2: () => exhaustPop(2),
  brake_squeak: brakeSqueak,
  skid_loop: skidLoop,
  impact_soft_1: () => impact('soft', 1), impact_soft_2: () => impact('soft', 2), impact_soft_3: () => impact('soft', 3),
  impact_medium_1: () => impact('medium', 1), impact_medium_2: () => impact('medium', 2), impact_medium_3: () => impact('medium', 3),
  impact_hard_1: () => impact('hard', 1), impact_hard_2: () => impact('hard', 2), impact_hard_3: () => impact('hard', 3),
  roof_crunch: roofCrunch,
  cargo_rattle_1: () => cargoRattle(1), cargo_rattle_2: () => cargoRattle(2), cargo_rattle_3: () => cargoRattle(3),
  egg_crack: eggCrack,
  egg_splat: eggSplat,
};

function writeWav(path, data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(path, buf);
}

// ================================================================= processing helpers
function decode(file) {
  const res = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`ffmpeg decode failed: ${file}\n${res.stderr}`);
  const b = res.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function writeF32Wav(path, data) {
  const buf = Buffer.alloc(44 + data.length * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(data.length * 4, 40);
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(buf, 44);
  writeFileSync(path, buf);
}
/** Integrated loudness + true peak of a clip, looped to >= 3 s so short one-shots are measurable. */
function measure(data, tmp) {
  const reps = Math.max(1, Math.ceil((3 * SR) / data.length));
  const long = new Float32Array(data.length * reps);
  for (let k = 0; k < reps; k++) long.set(data, k * data.length);
  const p = join(tmp, 'm.wav');
  writeF32Wav(p, long);
  const res = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = res.stderr;
  const I = parseFloat(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(txt.slice(txt.lastIndexOf('Summary')))?.[1] ?? 'NaN');
  const tp = parseFloat(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(txt.slice(txt.lastIndexOf('True peak')))?.[1] ?? 'NaN');
  return { I, tp };
}
function trimSilence(d, thresholdDb = -50) {
  const th = dbToLin(thresholdDb);
  let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < th) a++;
  while (b > a && Math.abs(d[b]) < th) b--;
  return d.slice(Math.max(0, a - 16), Math.min(d.length, b + 1));
}
function fades(d, inMs = 2, outMs = 25) {
  const fi = Math.round((inMs / 1000) * SR), fo = Math.min(Math.round((outMs / 1000) * SR), d.length >> 1);
  for (let i = 0; i < fi && i < d.length; i++) d[i] *= i / fi;
  for (let i = 0; i < fo; i++) d[d.length - 1 - i] *= i / fo;
  return d;
}
/** Cut a loop so it starts and ends on rising zero crossings (seam = continuous value + slope sign). */
function zeroCrossingLoop(d) {
  const rising = (i) => d[i - 1] <= 0 && d[i] > 0;
  let a = 1; while (a < d.length >> 2 && !rising(a)) a++;
  let b = d.length - 1; while (b > d.length - (d.length >> 2) && !rising(b)) b--;
  return d.slice(a, b);
}
/** Seam metric: wrap-point step |d[0] - d[last]| divided by the 99th-percentile sample step
 *  inside the loop. <= 1 means the seam is no bigger than normal steps (no click). */
function seam(d) {
  const steps = new Float32Array(d.length - 1);
  for (let i = 1; i < d.length; i++) steps[i - 1] = Math.abs(d[i] - d[i - 1]);
  steps.sort();
  const p99 = steps[Math.floor(steps.length * 0.99)];
  const jump = Math.abs(d[0] - d[d.length - 1]);
  return p99 > 0 ? jump / p99 : 0;
}
// Loops are encoded with LOOP_PAD samples of wrap-around audio on both sides, so MP3 frame
// artifacts at the file edges fall outside the loop region [LOOP_PAD, LOOP_PAD + len).
// The runtime sets AudioBufferSourceNode.loopStart/loopEnd from src/audio/loops.gen.ts.
const LOOP_PAD = 2048;
const loopRegions = {};
function padLoop(d) {
  const out = new Float32Array(d.length + 2 * LOOP_PAD);
  out.set(d.subarray(d.length - LOOP_PAD), 0);
  out.set(d, LOOP_PAD);
  out.set(d.subarray(0, LOOP_PAD), LOOP_PAD + d.length);
  return out;
}
/** Region of a decoded loop MP3 (ffmpeg strips the encoder delay, like browsers do). */
function mp3LoopRegion(d, name) {
  const r = loopRegions[name];
  return d.slice(r.start, r.start + r.len);
}
function encodeMp3(data, out, tmp) {
  const p = join(tmp, 'e.wav');
  writeF32Wav(p, data);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', p, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, out]);
}

// ================================================================= main
function generate() {
  mkdirSync(SRC, { recursive: true });
  let made = 0;
  for (const [name, fn] of Object.entries(RECIPES)) {
    const p = join(SRC, `${name}.wav`);
    const exists = readdirSync(SRC).some((f) => basename(f, extname(f)) === name);
    if (exists && !args.has('--regen')) continue;
    writeWav(p, fn());
    made++;
  }
  console.log(`audio: generated ${made} procedural source(s) in ${SRC}`);
}

function processAll(tmp) {
  const files = readdirSync(SRC).filter((f) => /\.(wav|ogg|mp3|flac)$/i.test(f));
  mkdirSync(OUT, { recursive: true });
  for (const f of files) {
    const name = basename(f, extname(f));
    const isLoop = name.endsWith('_loop');
    let d = decode(join(SRC, f));
    if (isLoop) d = zeroCrossingLoop(d);
    else d = fades(trimSilence(d));
    const target = TARGETS[name] ?? TARGETS.default;
    const outPath = join(OUT, `${name}.mp3`);
    if (isLoop) loopRegions[name] = { start: LOOP_PAD, len: d.length };
    let { I } = measure(d, tmp);
    let gainDb = target - I;
    // sample-peak headroom before encoding, then verify true peak on the encoded MP3
    let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
    gainDb = Math.min(gainDb, PEAK_LIMIT_DB - 0.8 - 20 * Math.log10(pk));
    for (let attempt = 0; attempt < 4; attempt++) {
      const g = dbToLin(gainDb), y = d.map((v) => v * g);
      encodeMp3(isLoop ? padLoop(y) : y, outPath, tmp);
      const m = measure(isLoop ? mp3LoopRegion(decode(outPath), name) : decode(outPath), tmp);
      if (m.tp <= PEAK_LIMIT_DB) break;
      gainDb -= m.tp - PEAK_LIMIT_DB + 0.2;
    }
  }
  // remove outputs whose source is gone (and old .ogg outputs)
  const names = new Set(files.map((f) => basename(f, extname(f))));
  for (const f of readdirSync(OUT)) if (!f.endsWith('.mp3') || !names.has(basename(f, '.mp3'))) rmSync(join(OUT, f));
  writeManifest([...names].sort());
}

function writeManifest(names) {
  const loops = Object.keys(loopRegions).sort().map((n) => {
    const r = loopRegions[n];
    return `  ${n}: { start: ${(r.start / SR).toFixed(6)}, end: ${((r.start + r.len) / SR).toFixed(6)}, fileSec: ${((r.len + 2 * LOOP_PAD) / SR).toFixed(6)} },`;
  });
  const src = [
    '// GENERATED by tools/audio.mjs (npm run audio). Do not edit by hand.',
    '/** Every processed sound in public/audio (<name>.mp3). */',
    `export const SOUND_NAMES = ${JSON.stringify(names)} as const;`,
    'export type SoundName = (typeof SOUND_NAMES)[number];',
    '/** Loop regions in seconds of the padded loop files (see tools/audio.mjs LOOP_PAD). */',
    'export const LOOP_REGIONS: Record<string, { start: number; end: number; fileSec: number }> = {',
    ...loops,
    '};',
    '',
  ].join('\n');
  writeFileSync('src/audio/sounds.gen.ts', src);
}

function report(tmp) {
  const rows = [];
  let total = 0;
  for (const f of readdirSync(OUT).filter((x) => x.endsWith('.mp3')).sort()) {
    const name = basename(f, '.mp3'), p = join(OUT, f), size = statSync(p).size;
    total += size;
    const isLoop = name.endsWith('_loop');
    const raw = decode(p);
    if (isLoop && !loopRegions[name]) loopRegions[name] = { start: LOOP_PAD, len: raw.length - 2 * LOOP_PAD };
    const d = isLoop ? mp3LoopRegion(raw, name) : raw;
    const { I, tp } = measure(d, tmp);
    rows.push({ name, sec: (d.length / SR).toFixed(3), lufs: I.toFixed(1), tp: tp.toFixed(1), seam: isLoop ? seam(d).toFixed(2) : '-', kb: (size / 1024).toFixed(1) });
  }
  console.log('name                 sec     LUFS   TP(dBFS)  seam(/p99 step)  KB');
  for (const r of rows) console.log(`${r.name.padEnd(20)} ${r.sec.padStart(6)} ${r.lufs.padStart(7)} ${r.tp.padStart(8)} ${r.seam.padStart(10)} ${r.kb.padStart(12)}`);
  console.log(`total: ${rows.length} files, ${(total / 1024).toFixed(1)} KB (budget ${(BUDGET / 1024).toFixed(0)} KB)`);
  const bad = rows.filter((r) => parseFloat(r.tp) > PEAK_LIMIT_DB);
  if (bad.length) { console.error(`true peak above ${PEAK_LIMIT_DB} dBFS: ${bad.map((r) => r.name).join(', ')}`); process.exitCode = 1; }
  if (total >= BUDGET) { console.error('audio budget exceeded'); process.exitCode = 1; }
}

const tmp = mkdtempSync(join(tmpdir(), 'wc-audio-'));
try {
  if (!args.has('--measure')) {
    generate();
    if (!existsSync(SRC)) { console.log('no audio sources'); process.exit(0); }
    processAll(tmp);
  }
  report(tmp);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
