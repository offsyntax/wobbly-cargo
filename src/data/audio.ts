// Audio tuning data (GDD §11). Pure data: no Web Audio, no Phaser.

export type BusName = 'music' | 'ambience' | 'engine' | 'sfx' | 'ui';

/** Start levels per GDD §11.6 (linear gain). */
export const BUS_LEVELS: Record<BusName, number> = {
  music: 0.35,
  ambience: 0.25,
  engine: 0.6,
  sfx: 0.8,
  ui: 0.7,
};

export interface EngineLayer {
  /** Loop file (public/audio/<sound>.mp3). */
  sound: string;
  /** Engine RPM the loop was rendered at (playback rate 1.0). */
  nativeRpm: number;
}

export interface EngineProfile {
  id: string;
  /** Ordered low → high RPM. Crossfaded by RPM (equal power between neighbours). */
  layers: EngineLayer[];
  idleRpm: number;
  maxRpm: number;
  /** Per-layer playback rate clamp (GDD: 0.8–1.8). */
  minRate: number;
  maxRate: number;
  /** Rear-wheel angular velocity (rad/s) that maps to maxRpm while grounded. */
  wheelOmegaAtMax: number;
  /** Extra RPM fraction (0..1 of range) added while holding on the ground (load / slip). */
  holdBoost: number;
  /** Inertia time constants (s): rise on ground, rise airborne + hold (fast), fall. */
  tauRise: number;
  tauRiseAir: number;
  tauFall: number;
  /** Landing load dip: fraction of the RPM range removed at full strength. */
  landDip: number;
  /** Air time (s) that gives the full landing dip. */
  landDipAirTime: number;
  /** Throttle low-pass: cutoff when coasting vs. full throttle (Hz). */
  lowpassMinHz: number;
  lowpassMaxHz: number;
  /** Throttle smoothing (s). */
  tauThrottle: number;
  /** Layer mix gain (linear) on the engine bus. */
  gain: number;
  /** Rev blip on press: min seconds between blips. Pop on release: min seconds between pops. */
  blipCooldown: number;
  popCooldown: number;
  /** Chance of a pop on release (only above popMinRpm fraction of range). */
  popChance: number;
  popMinRpm: number;
}

/** Pickup = mid-size petrol 4-cylinder (GDD §11.1). */
export const PICKUP_ENGINE: EngineProfile = {
  id: 'pickup',
  layers: [
    { sound: 'engine_idle_loop', nativeRpm: 800 },
    { sound: 'engine_low_loop', nativeRpm: 2000 },
    { sound: 'engine_mid_loop', nativeRpm: 3500 },
    { sound: 'engine_high_loop', nativeRpm: 5500 },
  ],
  idleRpm: 800,
  maxRpm: 6500,
  minRate: 0.8,
  maxRate: 1.8,
  wheelOmegaAtMax: 31,
  holdBoost: 0.18,
  tauRise: 0.22,
  tauRiseAir: 0.07,
  tauFall: 0.45,
  landDip: 0.35,
  landDipAirTime: 0.8,
  lowpassMinHz: 900,
  lowpassMaxHz: 9000,
  tauThrottle: 0.08,
  gain: 0.9,
  blipCooldown: 0.35,
  popCooldown: 1.0,
  popChance: 0.7,
  popMinRpm: 0.3,
};

export const ENGINE_PROFILES: Record<string, EngineProfile> = { pickup: PICKUP_ENGINE };

export type ImpactTier = 'soft' | 'medium' | 'hard';

/**
 * Impulse thresholds (N·s) for land/bump tiers, tuned from headless bot runs on test-01 + city-01..03
 * (ground cap 7 m/s and full throttle): non-cargo impacts p50 1.9, p95 4.0-4.3, p99 about 10.
 * Event floors in vehicles.ts (impactMin 0.6-1.5, landMin 0.8) decide what reaches the audio at all.
 */
export const IMPACT_TIERS = {
  /** Below this nothing plays. */
  min: 0.8,
  /** soft: [min, medium) · medium: [medium, hard) · hard: [hard, ∞) */
  medium: 1.9,
  hard: 4,
  /** Impulse that reaches full volume in the hard tier. */
  max: 12,
};

export const IMPACT_SOUNDS: Record<ImpactTier, string[]> = {
  soft: ['impact_soft_1', 'impact_soft_2', 'impact_soft_3'],
  medium: ['impact_medium_1', 'impact_medium_2', 'impact_medium_3'],
  hard: ['impact_hard_1', 'impact_hard_2', 'impact_hard_3'],
};

export const SFX = {
  /** GDD §11.3: max simultaneous voices per impact family. */
  maxVoicesPerFamily: 4,
  /** Random pitch ±5 %, volume ±2 dB. */
  pitchJitter: 0.05,
  volumeJitterDb: 2,
  /** Cargo rattle: quiet, rate-limited (s between rattles), impulse range (N·s). */
  rattleInterval: 0.09,
  rattleMinImpulse: 0.3,
  rattleFullImpulse: 6,
  rattleGain: 0.55,
  rattleSounds: ['cargo_rattle_1', 'cargo_rattle_2', 'cargo_rattle_3'],
  /** Roof crunch: minimum impulse and cooldown (s). */
  roofMinImpulse: 3,
  roofCooldown: 0.4,
  /** Brake squeak on release at speed. */
  squeakMinSpeed: 4,
  squeakCooldown: 0.8,
  /** Skid loop: slip threshold, full slip, max gain. */
  skidThreshold: 0.25,
  skidFull: 0.9,
  skidGain: 0.7,
  /** Music duck on hard hits / crashes (dB, seconds). */
  duckDb: -6,
  duckTime: 0.6,
  /** Pause: master gain is set to 0 instantly; menus may use this low-pass (Hz). */
  pauseLowpassHz: 700,
};
