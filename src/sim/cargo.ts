// Cargo units (eggs in MVP): free dynamic circles sitting in the bed, NOT welded.
// Damage comes from post-solve normal impulses (recorded by GameSim), evaluated once per step.
import { Circle, Vec2, type Body, type World } from 'planck';
import type { CargoSpec } from '../data/cargo';
import type { VehicleSpec } from '../data/vehicles';
import { CAT_CARGO, CAT_WHEEL } from './constants';

export type CargoStatus = 'ok' | 'broken' | 'lost';

export interface CargoUnit {
  index: number;
  body: Body | null;
  status: CargoStatus;
  hp: number;
  /** Seconds continuously outside the bed region. */
  outsideTime: number;
  /** Strongest contact impulse seen during the current step. */
  stepImpulse: number;
  stepX: number;
  stepY: number;
}

/** Spawn `count` units evenly across the bed floor of a chassis at (x, y), angle 0. */
export function spawnCargo(
  world: World,
  spec: CargoSpec,
  vehicle: VehicleSpec,
  x: number,
  y: number,
  count: number,
): CargoUnit[] {
  const { minX, maxX, floorY } = vehicle.bed;
  const units: CargoUnit[] = [];
  const slot = (maxX - minX) / count;
  for (let i = 0; i < count; i++) {
    // index 0 = rearmost
    const lx = minX + slot * (i + 0.5);
    const ly = floorY + spec.radius + 0.01;
    const body = world.createBody({
      type: 'dynamic',
      position: new Vec2(x + lx, y + ly),
      linearDamping: spec.linearDamping,
      angularDamping: spec.angularDamping,
      bullet: true,
    });
    body.createFixture(new Circle(spec.radius), {
      density: spec.density,
      friction: spec.friction,
      restitution: spec.restitution,
      filterCategoryBits: CAT_CARGO,
      filterMaskBits: 0xffff & ~CAT_WHEEL,
    });
    units.push({ index: i, body, status: 'ok', hp: spec.hp, outsideTime: 0, stepImpulse: 0, stepX: 0, stepY: 0 });
  }
  return units;
}

/** Is a world point inside the chassis-local cargo region? */
export function inCargoRegion(chassis: Body, vehicle: VehicleSpec, x: number, y: number): boolean {
  const p = chassis.getLocalPoint(new Vec2(x, y));
  const r = vehicle.cargoRegion;
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}

/** Outcome of one unit's damage evaluation for this step. */
export type DamageResult = { kind: 'none' } | { kind: 'damage'; hp: number } | { kind: 'break' };

export function evaluateDamage(unit: CargoUnit, spec: CargoSpec): DamageResult {
  const j = unit.stepImpulse;
  if (j >= spec.instantBreakImpulse) return { kind: 'break' };
  if (j > spec.breakThreshold) {
    unit.hp -= (j - spec.breakThreshold) * spec.damagePerImpulse;
    if (unit.hp <= 0) {
      unit.hp = 0;
      return { kind: 'break' };
    }
    return { kind: 'damage', hp: unit.hp };
  }
  return { kind: 'none' };
}
