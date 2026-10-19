// Cargo tuning data. Units: metres, planck density (kg/m²), N·s impulses, seconds.
// Impulses are planck post-solve normal impulses summed over a contact's points for one step.

export interface CargoSpec {
  id: string;
  /** Physics circle radius (art: `art/src/egg.svg`). */
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  hp: number;
  /** Impulses above this deal (impulse − breakThreshold) × damagePerImpulse HP. */
  breakThreshold: number;
  damagePerImpulse: number;
  /** A single impulse at or above this breaks the unit at once. */
  instantBreakImpulse: number;
  /** Outside the bed region longer than this = lost. */
  lostAfterSec: number;
  /** Minimum impulse for a cargo `impact` event (sound). */
  impactMin: number;
}

export const EGG: CargoSpec = {
  id: 'egg',
  radius: 0.22,
  density: 1.0, // ≈ 0.15 kg
  friction: 0.6,
  restitution: 0.1,
  linearDamping: 0.05,
  angularDamping: 0.6, // stops endless rolling in the bed
  hp: 100,
  breakThreshold: 0.35, // ≈ 2.3 m/s egg Δv: survives hills, small bumps, 1.5 m drops (light damage)
  damagePerImpulse: 300,
  instantBreakImpulse: 0.75, // ≈ 5 m/s: a 2 m drop or a nose-first landing
  lostAfterSec: 0.5,
  impactMin: 0.06,
};

export const CARGO: Record<string, CargoSpec> = { egg: EGG };
