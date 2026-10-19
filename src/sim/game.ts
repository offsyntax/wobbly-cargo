// GameSim: one level, one vehicle, its cargo, and the GDD §5 rules. Pure planck, no Phaser.
// Deterministic: step() advances exactly one fixed step; same level + same inputs → same result.
import { type Vec2Value, type Body, type Contact, type ContactImpulse, type Fixture, type World } from 'planck';
import { CARGO, type CargoSpec } from '../data/cargo';
import { PICKUP, type VehicleSpec } from '../data/vehicles';
import { evaluateDamage, inCargoRegion, spawnCargo, type CargoStatus, type CargoUnit } from './cargo';
import {
  FALL_MARGIN,
  FIXED_DT,
  IMPACT_COOLDOWN_SEC,
  POS_ITERS,
  ROOF_FAIL_SEC,
  SPAWN_SETTLE_SEC,
  TERRAIN_FRICTION,
  VEL_ITERS,
} from './constants';
import { LevelGeometry, type LevelData, type Pt } from './level';
import type { FailReason, SimEvent, SimInput, VehicleTelemetry } from './types';
import { Vehicle } from './vehicle';
import { createWorld } from './world';

export interface Pose {
  x: number;
  y: number;
  angle: number;
}

export interface CargoUnitState {
  index: number;
  status: CargoStatus;
  hp: number;
  maxHp: number;
  /** Last known pose (frozen at the moment of break/loss). */
  x: number;
  y: number;
  angle: number;
}

export interface SimBodies {
  chassis: Pose;
  /** [rear, front] */
  wheels: [Pose, Pose];
  /** null once the unit broke or was lost (body removed). */
  cargo: (Pose | null)[];
  /** Smoothed terrain polylines (static; same array every call). */
  terrain: Pt[][];
  /** Static prop outlines (same array every call). */
  props: { type: string; points: Pt[] }[];
}

export type SimStatus = 'running' | 'finished' | 'failed';

type PartKey = 'chassis' | 'roof' | 'wheel0' | 'wheel1';

interface Hit {
  impulse: number;
  x: number;
  y: number;
}

export class GameSim {
  readonly world: World;
  readonly level: LevelGeometry;
  readonly vehicle: Vehicle;
  readonly cargoSpec: CargoSpec;
  readonly cargo: CargoUnit[];
  status: SimStatus = 'running';
  failReason: FailReason | null = null;
  stars: 0 | 1 | 2 | 3 = 0;
  /** Sim time (s) = steps × FIXED_DT. */
  time = 0;
  steps = 0;

  private readonly ground: Body;
  private events: SimEvent[] = [];
  private hold = false;
  private airborne = false;
  private wheelTouch: [boolean, boolean] = [false, false];
  private lastGroundTime = 0;
  private roofTime = 0;
  private partHits = new Map<PartKey, Hit>();
  private lastImpact = new Map<string, number>();
  private frozen: Pose[] = [];

  constructor(
    data: LevelData,
    readonly vehicleSpec: VehicleSpec = PICKUP,
  ) {
    const cargoSpec = CARGO[data.cargo];
    if (!cargoSpec) throw new Error(`${data.id}: unknown cargo "${data.cargo}"`);
    this.cargoSpec = cargoSpec;
    this.world = createWorld();
    this.level = new LevelGeometry(data);
    this.ground = this.level.createBodies(this.world, TERRAIN_FRICTION);

    // Spawn so the lower wheel sits 5 cm above the ground; start[1] is a lower bound.
    const s = vehicleSpec;
    const sx = data.start[0];
    const clearance = Math.max(
      ...s.wheelAnchors.map(([ax, ay]) => this.level.groundHeightAt(sx + ax) - ay + s.wheelRadius + 0.05),
    );
    const sy = Math.max(data.start[1], clearance);
    this.vehicle = new Vehicle(this.world, s, sx, sy);
    this.cargo = spawnCargo(this.world, cargoSpec, s, sx, sy, data.cargoCount);
    this.frozen = this.cargo.map((u) => this.pose(u.body!));

    this.world.on('post-solve', (c: Contact, imp: ContactImpulse) => this.onPostSolve(c, imp));
  }

  // ---------------------------------------------------------------- step

  /** Advance exactly one fixed step (FIXED_DT). */
  step(input: SimInput): void {
    this.hold = this.status === 'running' ? input.hold : false;
    this.vehicle.applyControl(this.hold, this.airborne);
    for (const u of this.cargo) u.stepImpulse = 0;
    this.partHits.clear();

    this.world.step(FIXED_DT, VEL_ITERS, POS_ITERS);
    this.steps++;
    this.time = this.steps * FIXED_DT;

    this.updateGroundState();
    this.emitImpacts();
    if (this.status !== 'running') return;
    this.updateCargo();
    this.checkRules();
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- contacts

  private onPostSolve(contact: Contact, imp: ContactImpulse): void {
    const n = contact.getManifold().pointCount;
    if (!n) return;
    const ni = imp.normalImpulses;
    let j = 0;
    for (let i = 0; i < n; i++) j += ni[i];
    if (j <= 0) return;
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    let wp: Vec2Value | null = null;
    const where = (): Vec2Value => {
      if (!wp) {
        const wm = contact.getWorldManifold(null);
        wp = wm && wm.points.length ? wm.points[0] : fa.getBody().getPosition();
      }
      return wp;
    };
    this.recordHit(fa, fb, j, where);
    this.recordHit(fb, fa, j, where);
  }

  private recordHit(self: Fixture, other: Fixture, j: number, where: () => Vec2Value): void {
    const body = self.getBody();
    for (const u of this.cargo) {
      if (u.body === body) {
        if (j > u.stepImpulse) {
          const p = where();
          u.stepImpulse = j;
          u.stepX = p.x;
          u.stepY = p.y;
        }
        return;
      }
    }
    if (other.getBody() !== this.ground) return;
    const v = this.vehicle;
    let key: PartKey | null = null;
    if (self === v.roof) key = 'roof';
    else if (body === v.chassis) key = 'chassis';
    else if (body === v.wheels[0]) key = 'wheel0';
    else if (body === v.wheels[1]) key = 'wheel1';
    if (!key) return;
    const prev = this.partHits.get(key);
    if (!prev || j > prev.impulse) {
      const p = where();
      this.partHits.set(key, { impulse: j, x: p.x, y: p.y });
    }
  }

  private touchingGround(body: Body, fixture?: Fixture): boolean {
    for (let e = body.getContactList(); e; e = e.next) {
      const c = e.contact;
      if (!c.isTouching() || e.other !== this.ground) continue;
      if (fixture && c.getFixtureA() !== fixture && c.getFixtureB() !== fixture) continue;
      return true;
    }
    return false;
  }

  private updateGroundState(): void {
    const v = this.vehicle;
    this.wheelTouch = [this.touchingGround(v.wheels[0]), this.touchingGround(v.wheels[1])];
    const grounded = this.wheelTouch[0] || this.wheelTouch[1];
    if (grounded) {
      if (this.airborne) {
        let best: Hit | null = null;
        for (const h of this.partHits.values()) if (!best || h.impulse > best.impulse) best = h;
        const airTime = this.time - this.lastGroundTime;
        if (best && best.impulse >= v.spec.landMin && this.time > SPAWN_SETTLE_SEC) {
          this.events.push({ type: 'land', impulse: best.impulse, airTime, x: best.x, y: best.y });
        }
      }
      this.airborne = false;
      this.lastGroundTime = this.time;
    } else if (this.time - this.lastGroundTime > v.spec.airborneDelay) {
      this.airborne = true;
    }
    this.roofTime = this.touchingGround(v.chassis, v.roof) ? this.roofTime + FIXED_DT : 0;
  }

  private canEmit(key: string): boolean {
    const last = this.lastImpact.get(key);
    if (last !== undefined && this.time - last < IMPACT_COOLDOWN_SEC - 1e-9) return false;
    this.lastImpact.set(key, this.time);
    return true;
  }

  private emitImpacts(): void {
    const min = this.vehicle.spec.impactMin;
    // Fixed order keeps the event stream deterministic.
    const parts: [PartKey, 'chassis' | 'wheel' | 'roof', number][] = [
      ['chassis', 'chassis', min.chassis],
      ['roof', 'roof', min.roof],
      ['wheel0', 'wheel', min.wheel],
      ['wheel1', 'wheel', min.wheel],
    ];
    for (const [key, part, threshold] of parts) {
      const h = this.partHits.get(key);
      if (h && h.impulse >= threshold && this.canEmit(key)) {
        this.events.push({ type: 'impact', part, impulse: h.impulse, x: h.x, y: h.y });
      }
    }
    for (const u of this.cargo) {
      if (u.body && u.stepImpulse >= this.cargoSpec.impactMin && this.canEmit(`cargo${u.index}`)) {
        this.events.push({ type: 'impact', part: 'cargo', impulse: u.stepImpulse, x: u.stepX, y: u.stepY });
      }
    }
  }

  // ---------------------------------------------------------------- cargo + rules

  private updateCargo(): void {
    const spec = this.cargoSpec;
    for (const u of this.cargo) {
      const body = u.body;
      if (!body || u.status !== 'ok') continue;
      const p = body.getPosition();
      const r = this.time > SPAWN_SETTLE_SEC ? evaluateDamage(u, spec) : ({ kind: 'none' } as const);
      if (r.kind === 'break') {
        this.removeUnit(u, 'broken');
        this.events.push({ type: 'cargoBreak', index: u.index, x: p.x, y: p.y });
        continue;
      }
      if (r.kind === 'damage') this.events.push({ type: 'cargoDamage', index: u.index, hp: r.hp, x: p.x, y: p.y });
      u.outsideTime = inCargoRegion(this.vehicle.chassis, this.vehicleSpec, p.x, p.y) ? 0 : u.outsideTime + FIXED_DT;
      if (u.outsideTime > spec.lostAfterSec) {
        this.removeUnit(u, 'lost');
        this.events.push({ type: 'cargoLost', index: u.index, x: p.x, y: p.y });
      }
    }
  }

  private removeUnit(u: CargoUnit, status: CargoStatus): void {
    if (u.body) {
      this.frozen[u.index] = this.pose(u.body);
      this.world.destroyBody(u.body);
    }
    u.body = null;
    u.status = status;
  }

  intactCount(): number {
    return this.cargo.filter((u) => u.status === 'ok').length;
  }

  /** 3 = all intact, 2 = one lost, 1 = two lost, 0 = all lost (generalised for any count). */
  private computeStars(): 0 | 1 | 2 | 3 {
    const intact = this.intactCount();
    if (intact === 0) return 0;
    const lost = this.cargo.length - intact;
    return Math.max(1, 3 - lost) as 1 | 2 | 3;
  }

  private fail(reason: FailReason): void {
    this.status = 'failed';
    this.failReason = reason;
    this.stars = 0;
    this.events.push({ type: 'fail', reason });
  }

  private checkRules(): void {
    const c = this.vehicle.chassis.getPosition();
    if (this.intactCount() === 0) return this.fail('cargo');
    if (this.roofTime > ROOF_FAIL_SEC) return this.fail('flipped');
    if (c.y < this.level.minY - FALL_MARGIN) return this.fail('fell');
    if (c.x >= this.level.data.finishX) {
      this.status = 'finished';
      this.stars = this.computeStars();
      this.events.push({ type: 'finish', stars: this.stars, timeSec: this.time });
    }
  }

  // ---------------------------------------------------------------- read-only views

  private pose(b: Body): Pose {
    const p = b.getPosition();
    return { x: p.x, y: p.y, angle: b.getAngle() };
  }

  get bodies(): SimBodies {
    const v = this.vehicle;
    return {
      chassis: this.pose(v.chassis),
      wheels: [this.pose(v.wheels[0]), this.pose(v.wheels[1])],
      cargo: this.cargo.map((u) => (u.body ? this.pose(u.body) : null)),
      terrain: this.level.chains,
      props: this.level.props,
    };
  }

  cargoState(): CargoUnitState[] {
    return this.cargo.map((u) => {
      const p = u.body ? this.pose(u.body) : this.frozen[u.index];
      return { index: u.index, status: u.status, hp: u.hp, maxHp: this.cargoSpec.hp, ...p };
    });
  }

  telemetry(): VehicleTelemetry {
    const v = this.vehicle;
    const ch = v.chassis;
    const p = ch.getPosition();
    const lv = ch.getLinearVelocity();
    const speed = v.forwardSpeed();
    const rearW = -v.wheels[0].getAngularVelocity();
    let slip = 0;
    if (this.wheelTouch[0]) {
      const surf = rearW * v.spec.wheelRadius;
      slip = Math.min(1, Math.abs(surf - speed) / Math.max(Math.abs(surf), Math.abs(speed), 1));
    }
    return {
      x: p.x,
      y: p.y,
      angle: ch.getAngle(),
      speed,
      vx: lv.x,
      vy: lv.y,
      rearWheelAngVel: rearW,
      hold: this.hold,
      airborne: this.airborne,
      airTime: this.airborne ? this.time - this.lastGroundTime : 0,
      wheelSlip: slip,
      suspension: v.suspension(),
      groundY: this.level.groundHeightAt(p.x),
    };
  }
}
