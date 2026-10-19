// Web Audio sound system (GDD §11). Phaser-agnostic: pass in an AudioContext (e.g. Phaser's
// `(scene.sound as Phaser.Sound.WebAudioSoundManager).context`) or create your own.
// Inputs come only from sim output (VehicleTelemetry, SimEvent); audio never changes physics.
//
// Usage from a scene:
//   const audio = new AudioSystem(ctx); await audio.load();
//   on first pointer/key down: audio.unlock();
//   each frame: audio.update(sim.telemetry, dt); audio.onEvents(drainedEvents);
//   platform: audio.setMuted(!audioEnabled); audio.setPaused(paused);
import type { SimEvent, VehicleTelemetry } from '../sim/types';
import {
  BUS_LEVELS,
  IMPACT_SOUNDS,
  PICKUP_ENGINE,
  SFX,
  type BusName,
  type EngineProfile,
} from '../data/audio';
import {
  RateLimiter,
  RpmModel,
  VoiceLimiter,
  engineCutoff,
  engineLayerMix,
  impactParams,
  impactTier,
  smooth,
} from './logic';
import { LOOP_REGIONS, SOUND_NAMES } from './sounds.gen';

/** LAME encoder delay + decoder delay (samples @ 44.1 kHz), used only if a browser keeps it. */
const MP3_DELAY_SEC = 1105 / 44100;
const RAMP = 0.03; // seconds, parameter smoothing for continuous controls

type Family = 'body' | 'crash' | 'cargo' | 'egg' | 'engine' | 'tire';

interface VoiceHandle {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export interface PlayOptions {
  bus?: BusName;
  gain?: number;
  rate?: number;
}

export interface AudioSystemOptions {
  /** URL prefix of the processed sounds (default `audio/`, relative to the page). */
  baseUrl?: string;
  profile?: EngineProfile;
  /** Suspend the AudioContext while paused (default true). */
  suspendOnPause?: boolean;
  /** Random source in [0, 1) (tests / deterministic replays). */
  random?: () => number;
}

interface LoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioSystem {
  readonly ctx: AudioContext;
  private readonly buses: Record<BusName, GainNode>;
  private readonly master: GainNode;
  private readonly masterLp: BiquadFilterNode;
  private readonly musicDuck: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly families = new Map<Family, VoiceLimiter<VoiceHandle>>();
  private readonly lastVariant = new Map<string, string>();
  private readonly baseUrl: string;
  private readonly suspendOnPause: boolean;
  private readonly random: () => number;

  // engine
  private profile: EngineProfile;
  private readonly rpmModel: RpmModel;
  private engineLayers: LoopVoice[] = [];
  private engineLp: BiquadFilterNode | null = null;
  private engineOut: GainNode | null = null;
  private skid: LoopVoice | null = null;
  private throttle = 0;
  private prevHold = false;
  private override: { rpm: number; throttle: number } | null = null;
  private readonly blipLimiter: RateLimiter;
  private readonly popLimiter: RateLimiter;
  private readonly squeakLimiter = new RateLimiter(SFX.squeakCooldown);
  private readonly rattleLimiter = new RateLimiter(SFX.rattleInterval);
  private readonly roofLimiter = new RateLimiter(SFX.roofCooldown);

  private muted = false;
  private paused = false;
  private unlocked = false;
  private menuMode = false;

  constructor(ctx?: AudioContext, opts: AudioSystemOptions = {}) {
    this.ctx = ctx ?? new AudioContext();
    this.baseUrl = opts.baseUrl ?? 'audio/';
    this.suspendOnPause = opts.suspendOnPause ?? true;
    this.random = opts.random ?? Math.random;
    this.profile = opts.profile ?? PICKUP_ENGINE;
    this.rpmModel = new RpmModel(this.profile);
    this.blipLimiter = new RateLimiter(this.profile.blipCooldown);
    this.popLimiter = new RateLimiter(this.profile.popCooldown);

    const c = this.ctx;
    // buses → (music duck) → master low-pass (menus) → compressor → limiter → master (mute/pause)
    this.master = c.createGain();
    this.master.connect(c.destination);
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    limiter.connect(this.master);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.15;
    comp.connect(limiter);
    this.masterLp = c.createBiquadFilter();
    this.masterLp.type = 'lowpass';
    this.masterLp.frequency.value = 20000;
    this.masterLp.connect(comp);
    this.musicDuck = c.createGain();
    this.musicDuck.connect(this.masterLp);

    const mk = (name: BusName): GainNode => {
      const g = c.createGain();
      g.gain.value = BUS_LEVELS[name];
      g.connect(name === 'music' ? this.musicDuck : this.masterLp);
      return g;
    };
    this.buses = { music: mk('music'), ambience: mk('ambience'), engine: mk('engine'), sfx: mk('sfx'), ui: mk('ui') };
    for (const f of ['body', 'crash', 'cargo', 'egg', 'engine', 'tire'] as Family[]) {
      this.families.set(f, new VoiceLimiter<VoiceHandle>(SFX.maxVoicesPerFamily));
    }
  }

  // ------------------------------------------------------------------ loading
  /** Fetch + decode the processed sounds. Missing files are skipped (calls become no-ops). */
  async load(names: readonly string[] = SOUND_NAMES): Promise<void> {
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${this.baseUrl}${n}.mp3`);
          if (!res.ok) return;
          this.buffers.set(n, await this.ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* missing or undecodable: stay silent for this sound */
        }
      }),
    );
  }

  /** Provide an already decoded buffer (e.g. from Phaser's audio cache). */
  setBuffer(name: string, buffer: AudioBuffer): void {
    this.buffers.set(name, buffer);
  }

  hasSound(name: string): boolean {
    return this.buffers.has(name);
  }

  /** Mixer bus to connect other sources to (music, ambience, ui later). */
  bus(name: BusName): GainNode {
    return this.buses[name];
  }

  // ------------------------------------------------------------------ platform controls
  /** Call on the first user input (tap / click / key). Safe to call repeatedly. */
  unlock(): void {
    this.unlocked = true;
    if (!this.paused && this.ctx.state === 'suspended') void this.ctx.resume();
    // iOS Safari: start a silent buffer inside the gesture
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  /** Instant: master gain to 0 (and suspend the context) while paused. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyMaster();
    if (!this.suspendOnPause) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    else if (!paused && this.unlocked && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Menus / pause overlay: low-pass and reduced volume on everything (GDD §11.6). */
  setMenuMode(on: boolean): void {
    this.menuMode = on;
    const now = this.ctx.currentTime;
    this.masterLp.frequency.setTargetAtTime(on ? SFX.pauseLowpassHz : 20000, now, 0.08);
    this.applyMaster();
  }

  setBusVolume(bus: BusName, v: number): void {
    this.buses[bus].gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.02);
  }

  getBusVolume(bus: BusName): number {
    return this.buses[bus].gain.value;
  }

  private applyMaster(): void {
    const v = this.muted || this.paused ? 0 : this.menuMode ? 0.5 : 1;
    const g = this.master.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(v, now);
  }

  // ------------------------------------------------------------------ engine
  setEngineProfile(p: EngineProfile): void {
    this.stopEngine();
    this.profile = p;
    this.rpmModel.profile = p;
    this.blipLimiter.interval = p.blipCooldown;
    this.popLimiter.interval = p.popCooldown;
  }

  /** Sound Lab: drive the engine directly (rpm in RPM, throttle 0..1); null = use telemetry. */
  setEngineOverride(o: { rpm: number; throttle: number } | null): void {
    this.override = o;
  }

  /** Current engine state (for the Sound Lab readout). */
  engineState(): { rpm: number; norm: number; throttle: number } {
    return { rpm: this.rpmModel.rpm, norm: this.rpmModel.norm, throttle: this.throttle };
  }

  private startLoop(name: string, dest: AudioNode): LoopVoice | null {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const r = LOOP_REGIONS[name];
    let offset = 0;
    if (r) {
      // Browsers that keep the MP3 encoder delay decode a slightly longer buffer.
      const extra = buf.duration - r.fileSec;
      const off = extra > 0.01 ? MP3_DELAY_SEC : 0;
      src.loopStart = r.start + off;
      src.loopEnd = r.end + off;
      offset = src.loopStart + this.random() * (r.end - r.start);
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(dest);
    src.start(0, offset);
    return { src, gain };
  }

  private startEngine(): boolean {
    if (this.engineOut) return true;
    if (!this.profile.layers.every((l) => this.buffers.has(l.sound))) return false;
    const c = this.ctx;
    this.engineOut = c.createGain();
    this.engineOut.gain.value = this.profile.gain;
    this.engineOut.connect(this.buses.engine);
    this.engineLp = c.createBiquadFilter();
    this.engineLp.type = 'lowpass';
    this.engineLp.Q.value = 0.9;
    this.engineLp.frequency.value = this.profile.lowpassMinHz;
    this.engineLp.connect(this.engineOut);
    this.engineLayers = this.profile.layers.map((l) => this.startLoop(l.sound, this.engineLp!)!);
    this.skid = this.startLoop('skid_loop', this.buses.sfx);
    return true;
  }

  /** Fade out and release the engine + skid loops (menus, level end). */
  stopEngine(): void {
    const now = this.ctx.currentTime;
    for (const v of [...this.engineLayers, this.skid]) {
      if (!v) continue;
      v.gain.gain.setTargetAtTime(0, now, 0.05);
      v.src.stop(now + 0.3);
    }
    const out = this.engineOut;
    if (out) setTimeout(() => out.disconnect(), 400);
    this.engineLayers = [];
    this.skid = null;
    this.engineOut = null;
    this.engineLp = null;
    this.rpmModel.reset();
    this.throttle = 0;
    this.prevHold = false;
  }

  /** Per frame (or per sim step) with the latest telemetry; dt in seconds. */
  update(t: VehicleTelemetry, dt: number): void {
    const p = this.profile;
    const now = this.ctx.currentTime;
    this.rpmModel.update(t, dt);
    this.throttle += ((t.hold ? 1 : 0) - this.throttle) * smooth(dt, p.tauThrottle);
    const rpm = this.override ? this.override.rpm : this.rpmModel.rpm;
    const thr = this.override ? this.override.throttle : this.throttle;
    const norm = Math.min(1, Math.max(0, (rpm - p.idleRpm) / (p.maxRpm - p.idleRpm)));

    if (this.startEngine()) {
      const mix = engineLayerMix(rpm, p);
      mix.forEach((m, k) => {
        const v = this.engineLayers[k];
        v.gain.gain.setTargetAtTime(m.gain, now, RAMP);
        v.src.playbackRate.setTargetAtTime(m.rate, now, RAMP);
      });
      this.engineLp!.frequency.setTargetAtTime(engineCutoff(thr, norm, p), now, RAMP);
      if (this.skid) {
        const s = t.airborne ? 0 : Math.min(1, Math.max(0, (t.wheelSlip - SFX.skidThreshold) / (SFX.skidFull - SFX.skidThreshold)));
        const speedFade = Math.min(1, Math.abs(t.speed) / 1.5 + (t.hold ? 0.5 : 0));
        this.skid.gain.gain.setTargetAtTime(SFX.skidGain * s * speedFade, now, 0.04);
        this.skid.src.playbackRate.setTargetAtTime(0.9 + 0.3 * s, now, 0.04);
      }
    }

    // throttle edges: rev blip on press, pop + brake squeak on release
    if (t.hold && !this.prevHold && this.blipLimiter.tryFire(now)) {
      this.playVoice('engine', 'rev_blip', 'engine', 0.55, 0.9 + 0.3 * norm * (this.random() * 0.2 + 0.9));
    }
    if (!t.hold && this.prevHold) {
      if (norm > p.popMinRpm && this.random() < p.popChance && this.popLimiter.tryFire(now)) {
        this.playVariant('engine', ['exhaust_pop_1', 'exhaust_pop_2'], 'engine', 0.6, 0.95 + 0.1 * this.random());
      }
      if (!t.airborne && Math.abs(t.speed) >= SFX.squeakMinSpeed && this.squeakLimiter.tryFire(now)) {
        const k = Math.min(1, Math.abs(t.speed) / (SFX.squeakMinSpeed * 3));
        this.playVoice('tire', 'brake_squeak', 'sfx', 0.4 + 0.5 * k, 0.95 + 0.1 * this.random());
      }
    }
    this.prevHold = t.hold;
  }

  // ------------------------------------------------------------------ events
  onEvents(events: readonly SimEvent[]): void {
    const now = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'land':
          this.impact(e.impulse * 1.1);
          break;
        case 'impact':
          if (e.part === 'roof') {
            if (e.impulse >= SFX.roofMinImpulse && this.roofLimiter.tryFire(now)) {
              const s = Math.min(1, e.impulse / 40);
              this.playJittered('crash', ['roof_crunch'], 0.6 + 0.4 * s, 1.05 - 0.1 * s);
              this.duckMusic();
            }
          } else if (e.part === 'cargo') {
            if (e.impulse >= SFX.rattleMinImpulse && this.rattleLimiter.tryFire(now)) {
              const s = Math.min(1, e.impulse / SFX.rattleFullImpulse);
              this.playJittered('cargo', SFX.rattleSounds, SFX.rattleGain * (0.4 + 0.6 * s), 1);
            }
          } else this.impact(e.impulse);
          break;
        case 'cargoDamage':
          this.playJittered('egg', ['egg_crack'], 0.85, 1);
          break;
        case 'cargoBreak':
          this.playJittered('egg', ['egg_splat'], 1, 1);
          this.duckMusic();
          break;
        default:
          break; // finish / fail / cargoLost: UI stings come later (GDD §11.4)
      }
    }
  }

  private impact(impulse: number): void {
    const pick = impactTier(impulse);
    if (!pick) return;
    const { gain, rate } = impactParams(pick.strength, this.jit(), this.jit(), SFX.pitchJitter, SFX.volumeJitterDb);
    this.playVariant('body', IMPACT_SOUNDS[pick.tier], 'sfx', gain, rate);
    if (pick.tier === 'hard') this.duckMusic();
  }

  private jit(): number {
    return this.random() * 2 - 1;
  }

  private playJittered(family: Family, names: string[], gain: number, rate: number): void {
    const g = gain * Math.pow(10, (SFX.volumeJitterDb * this.jit()) / 20);
    this.playVariant(family, names, 'sfx', g, rate * (1 + SFX.pitchJitter * this.jit()));
  }

  /** Random variation, never the same one twice in a row. */
  private playVariant(family: Family, names: string[], bus: BusName, gain: number, rate: number): void {
    const key = names[0];
    const last = this.lastVariant.get(key);
    const pool = names.length > 1 ? names.filter((n) => n !== last) : names;
    const name = pool[Math.floor(this.random() * pool.length)];
    this.lastVariant.set(key, name);
    this.playVoice(family, name, bus, gain, rate);
  }

  private duckMusic(): void {
    const g = this.musicDuck.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Math.pow(10, SFX.duckDb / 20), now, 0.02);
    g.setTargetAtTime(1, now + SFX.duckTime, 0.25);
  }

  private playVoice(family: Family, name: string, bus: BusName, gain: number, rate: number): VoiceHandle | null {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const lim = this.families.get(family)!;
    const now = this.ctx.currentTime;
    const req = lim.request(gain, now);
    if (!req.play) return null;
    if (req.steal) {
      req.steal.gain.gain.setTargetAtTime(0, now, 0.01);
      req.steal.src.stop(now + 0.06);
    }
    const h = this.playRaw(name, { bus, gain, rate });
    if (h) lim.add(h, gain, now + buf.duration / rate);
    return h;
  }

  private playRaw(name: string, o: PlayOptions): VoiceHandle | null {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = o.gain ?? 1;
    src.connect(gain).connect(this.buses[o.bus ?? 'sfx']);
    src.onended = () => gain.disconnect();
    src.start();
    return { src, gain };
  }

  /** Sound Lab / UI: play a sound once (loops play once from the loop region start). */
  play(name: string, o: PlayOptions = {}): void {
    this.playRaw(name, o);
  }

  /** Active voices in an impact family (Sound Lab readout). */
  activeVoices(family: Family): number {
    return this.families.get(family)!.active(this.ctx.currentTime);
  }

  dispose(): void {
    this.stopEngine();
    this.master.disconnect();
  }
}
