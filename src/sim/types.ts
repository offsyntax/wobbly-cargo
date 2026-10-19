// Contract between src/sim (producer) and src/render, src/audio, scenes (consumers).
// Units: metres, seconds, radians, N·s for impulses. Y is up. Sim never imports from consumers.

/** Input sampled once per fixed step. */
export interface SimInput {
  /** Hold (touch / mouse / Space / ↑): throttle on ground, nose-up rotation in air. */
  hold: boolean;
}

export type FailReason = 'cargo' | 'flipped' | 'fell';

/** Discrete events emitted during a step (drained by consumers each frame). */
export type SimEvent =
  /** Contact with a meaningful impulse. `part` says which body hit. */
  | { type: 'impact'; part: 'chassis' | 'wheel' | 'roof' | 'cargo'; impulse: number; x: number; y: number }
  /** Vehicle touched ground after being airborne (impulse = strongest wheel/chassis contact). */
  | { type: 'land'; impulse: number; airTime: number; x: number; y: number }
  /** Cargo took damage but survives (crack sound / visual). */
  | { type: 'cargoDamage'; index: number; hp: number; x: number; y: number }
  /** Cargo broke (splat). */
  | { type: 'cargoBreak'; index: number; x: number; y: number }
  /** Cargo left the bed region for longer than the grace time. */
  | { type: 'cargoLost'; index: number; x: number; y: number }
  | { type: 'finish'; stars: 0 | 1 | 2 | 3; timeSec: number }
  | { type: 'fail'; reason: FailReason };

/** Continuous per-step state for engine/tire audio, HUD and camera. */
export interface VehicleTelemetry {
  x: number;
  y: number;
  /** Chassis angle (rad, CCW positive). */
  angle: number;
  /** Forward speed along the ground (m/s). */
  speed: number;
  vx: number;
  vy: number;
  /** Rear (driven) wheel angular velocity (rad/s, positive = forward). */
  rearWheelAngVel: number;
  hold: boolean;
  airborne: boolean;
  /** Seconds since last ground contact (0 when grounded). */
  airTime: number;
  /** 0..1 tire slip of the driven wheel (0 = rolling, 1 = full spin/lock). */
  wheelSlip: number;
  /** 0..1 suspension compression [rear, front]. */
  suspension: [number, number];
  /** Terrain height directly under the vehicle (for camera framing). */
  groundY: number;
}
