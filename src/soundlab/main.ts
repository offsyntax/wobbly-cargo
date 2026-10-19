// Dev-only Sound Lab (sound-lab.html). Auditions every sound and drives AudioSystem with
// slider / synthetic telemetry exactly like the game will. Never imported by the game.
import { AudioSystem } from '../audio/AudioSystem';
import { SOUND_NAMES } from '../audio/sounds.gen';
import { BUS_LEVELS, ENGINE_PROFILES, IMPACT_TIERS, type BusName } from '../data/audio';
import type { SimEvent, VehicleTelemetry } from '../sim/types';

const app = document.getElementById('app')!;
const audio = new AudioSystem(new AudioContext());
const loaded = audio.load();

function el(tag: string, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElement {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
function inp(props: Record<string, unknown>): HTMLInputElement {
  return Object.assign(document.createElement('input'), props);
}
function section(title: string, ...kids: (Node | string)[]) {
  const s = el('section', {}, el('h2', { textContent: title }), ...kids);
  app.append(s);
  return s;
}
function slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, on: (v: number) => void) {
  const out = el('span', { className: 'readout', textContent: fmt(value) });
  const input = inp({ type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v);
    on(v);
  });
  return { row: el('label', { className: 'row' }, el('span', { textContent: label }), input, out), input };
}

const unlockEl = document.getElementById('unlock')!;
unlockEl.addEventListener('pointerdown', () => {
  audio.unlock();
  unlockEl.remove();
});

// ------------------------------------------------------------- raw sounds
const raw = el('div', { className: 'grid' });
for (const n of SOUND_NAMES) {
  raw.append(el('button', { textContent: n, onclick: () => audio.play(n, { bus: n.startsWith('engine') || n.startsWith('rev') || n.startsWith('exhaust') ? 'engine' : 'sfx' }) }));
}
section('Every sound (raw, rate 1.0)', raw);

// ------------------------------------------------------------- events through AudioSystem
const evGrid = el('div', { className: 'grid' });
const at = { x: 0, y: 0 };
const evButtons: [string, () => SimEvent[]][] = [
  ['bump soft', () => [{ type: 'impact', part: 'wheel', impulse: 5, ...at }]],
  ['bump medium', () => [{ type: 'impact', part: 'chassis', impulse: 20, ...at }]],
  ['bump hard', () => [{ type: 'impact', part: 'chassis', impulse: 70, ...at }]],
  ['land soft', () => [{ type: 'land', impulse: 4, airTime: 0.3, ...at }]],
  ['land medium', () => [{ type: 'land', impulse: 18, airTime: 0.7, ...at }]],
  ['land hard', () => [{ type: 'land', impulse: 60, airTime: 1.4, ...at }]],
  ['roof crunch', () => [{ type: 'impact', part: 'roof', impulse: 30, ...at }]],
  ['cargo rattle', () => [{ type: 'impact', part: 'cargo', impulse: 2 + Math.random() * 4, ...at }]],
  ['egg crack', () => [{ type: 'cargoDamage', index: 0, hp: 1, ...at }]],
  ['egg splat', () => [{ type: 'cargoBreak', index: 0, ...at }]],
  ['6 hard hits at once (voice limit 4)', () => Array.from({ length: 6 }, (_, i) => ({ type: 'impact' as const, part: 'chassis' as const, impulse: 40 + i * 8, ...at }))],
  ['rattle burst x10 (rate limit)', () => Array.from({ length: 10 }, () => ({ type: 'impact' as const, part: 'cargo' as const, impulse: 4, ...at }))],
];
for (const [label, make] of evButtons) evGrid.append(el('button', { className: 'alt', textContent: label, onclick: () => audio.onEvents(make()) }));
const impulse = slider('impulse (N·s)', 1, 120, 1, 20, (v) => `${v}`, () => {});
evGrid.append(el('button', { className: 'alt', textContent: 'bump @ slider', onclick: () => audio.onEvents([{ type: 'impact', part: 'chassis', impulse: parseFloat(impulse.input.value), ...at }]) }));
section(`Events (tiers: soft ≥ ${IMPACT_TIERS.min}, medium ≥ ${IMPACT_TIERS.medium}, hard ≥ ${IMPACT_TIERS.hard} N·s; ±5 % pitch, ±2 dB)`, evGrid, impulse.row);

// ------------------------------------------------------------- engine panel
const profile = ENGINE_PROFILES.pickup;
const state = { rpm: profile.idleRpm, throttle: 0, airborne: false, direct: false, slip: 0, speed: 0 };
const rpmS = slider('RPM (wheel)', profile.idleRpm, profile.maxRpm, 10, state.rpm, (v) => `${v}`, (v) => (state.rpm = v));
const thrS = slider('throttle', 0, 1, 0.01, 0, (v) => v.toFixed(2), (v) => (state.throttle = v));
const slipS = slider('wheel slip', 0, 1, 0.01, 0, (v) => v.toFixed(2), (v) => (state.slip = v));
const speedS = slider('speed (m/s)', 0, 20, 0.5, 0, (v) => `${v}`, (v) => (state.speed = v));
const air = inp({ type: 'checkbox', onchange: () => (state.airborne = air.checked) });
const direct = inp({ type: 'checkbox', onchange: () => (state.direct = direct.checked) });
const readout = el('div', { className: 'readout' });
section(
  'Engine (pickup)',
  el('p', { className: 'note', textContent: 'Telemetry mode: RPM slider sets rear-wheel speed, throttle ≥ 0.5 = hold. Press/release hold for the rev blip, pop and (speed ≥ 4) brake squeak. "Direct" plays exact RPM/throttle (no inertia) to judge each layer.' }),
  rpmS.row, thrS.row, slipS.row, speedS.row,
  el('label', {}, air, ' airborne'), ' ', el('label', {}, direct, ' direct RPM/throttle'),
  readout,
);

// ------------------------------------------------------------- buses
const busRows = (Object.keys(BUS_LEVELS) as BusName[]).map((b) => slider(b, 0, 1, 0.01, BUS_LEVELS[b], (v) => v.toFixed(2), (v) => audio.setBusVolume(b, v)).row);
const muteBox = inp({ type: 'checkbox', onchange: () => audio.setMuted(muteBox.checked) });
const pauseBox = inp({ type: 'checkbox', onchange: () => audio.setPaused(pauseBox.checked) });
const menuBox = inp({ type: 'checkbox', onchange: () => audio.setMenuMode(menuBox.checked) });
section('Buses', ...busRows, el('label', {}, muteBox, ' mute'), ' ', el('label', {}, pauseBox, ' pause'), ' ', el('label', {}, menuBox, ' menu low-pass'));

// ------------------------------------------------------------- simulated drive
/** Scripted 16 s drive: idle, launch with slip, cruise with bumps + rattles, jump, landing, braking, crash. */
let sim: { t: number; fired: Set<number> } | null = null;
interface Cue { at: number; ev: () => SimEvent[] }
const cues: Cue[] = [
  { at: 3.2, ev: () => [{ type: 'impact', part: 'wheel', impulse: 6, ...at }] },
  { at: 3.9, ev: () => [{ type: 'impact', part: 'cargo', impulse: 3, ...at }] },
  { at: 4.6, ev: () => [{ type: 'impact', part: 'wheel', impulse: 15, ...at }, { type: 'impact', part: 'cargo', impulse: 5, ...at }] },
  { at: 7.6, ev: () => [{ type: 'land', impulse: 45, airTime: 1.5, ...at }, { type: 'impact', part: 'cargo', impulse: 6, ...at }] },
  { at: 7.7, ev: () => [{ type: 'cargoDamage', index: 0, hp: 1, ...at }] },
  { at: 8.4, ev: () => [{ type: 'impact', part: 'wheel', impulse: 8, ...at }] },
  { at: 12.6, ev: () => [{ type: 'impact', part: 'roof', impulse: 35, ...at }, { type: 'impact', part: 'chassis', impulse: 50, ...at }] },
  { at: 12.8, ev: () => [{ type: 'cargoBreak', index: 0, ...at }] },
];
function scripted(t: number): VehicleTelemetry {
  const tel: VehicleTelemetry = { x: 0, y: 0, angle: 0, speed: 0, vx: 0, vy: 0, rearWheelAngVel: 0, hold: false, airborne: false, airTime: 0, wheelSlip: 0, suspension: [0, 0], groundY: 0 };
  const wheelR = 0.4;
  if (t < 1) return tel; // idle
  if (t < 6) { // launch + accelerate, wheelspin first second
    tel.hold = true;
    tel.speed = Math.min(12, (t - 1) * 4);
    tel.wheelSlip = t < 2 ? 0.8 : Math.max(0, 0.8 - (t - 2) * 2);
    tel.rearWheelAngVel = tel.speed / wheelR * (1 + tel.wheelSlip * 0.6);
  } else if (t < 7.6) { // jump: airborne with hold, then release mid-air
    tel.airborne = true;
    tel.airTime = t - 6;
    tel.hold = t < 7.1;
    tel.speed = 12;
  } else if (t < 10) { // land, keep driving
    tel.hold = true;
    tel.speed = 11;
    tel.rearWheelAngVel = 11 / wheelR;
  } else if (t < 12.5) { // release at speed: squeak + pop, coast down
    tel.speed = Math.max(0, 11 - (t - 10) * 3);
    tel.rearWheelAngVel = tel.speed / wheelR;
    tel.wheelSlip = t < 10.8 ? 0.5 : 0;
  } else if (t < 16) {
    tel.speed = 0;
  }
  return tel;
}
const simBtn = el('button', { className: 'go', textContent: 'simulate drive (16 s)', onclick: () => { audio.unlock(); sim = { t: 0, fired: new Set() }; } });
section('Simulated drive', el('p', { className: 'note', textContent: 'Idle → launch with wheelspin → bumps and cargo rattles → jump (rev in air, release) → hard landing + egg crack → brake squeak + pop → roof crash + egg splat.' }), simBtn);

// ------------------------------------------------------------- frame loop
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let tel: VehicleTelemetry;
  if (sim) {
    sim.t += dt;
    tel = scripted(sim.t);
    cues.forEach((c, i) => {
      if (sim!.t >= c.at && !sim!.fired.has(i)) {
        sim!.fired.add(i);
        audio.onEvents(c.ev());
      }
    });
    audio.setEngineOverride(null);
    if (sim.t > 16) sim = null;
  } else {
    const omega = ((state.rpm - profile.idleRpm) / (profile.maxRpm - profile.idleRpm)) * profile.wheelOmegaAtMax;
    tel = { x: 0, y: 0, angle: 0, speed: state.speed, vx: 0, vy: 0, rearWheelAngVel: omega, hold: state.throttle >= 0.5, airborne: state.airborne, airTime: 0, wheelSlip: state.slip, suspension: [0, 0], groundY: 0 };
    audio.setEngineOverride(state.direct ? { rpm: state.rpm, throttle: state.throttle } : null);
  }
  audio.update(tel, dt);
  const e = audio.engineState();
  readout.textContent = `ctx ${audio.ctx.state} · model rpm ${e.rpm.toFixed(0)} (${(e.norm * 100).toFixed(0)}%) · throttle ${e.throttle.toFixed(2)} · body voices ${audio.activeVoices('body')}${sim ? ` · sim ${sim.t.toFixed(1)} s` : ''}`;
  requestAnimationFrame(frame);
}
void loaded.then(() => requestAnimationFrame(frame));
