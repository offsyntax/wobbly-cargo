// Pickup (and later other vehicles): chassis polygons + roof + 2 wheels on WheelJoints.
// Control (GDD §4): ground hold = throttle; release = coast, strong brake when nearly stopped
// (motor target speed 0, so it never reverses). Air hold = nose-up torque, release = slow
// nose-forward torque. All numbers come from src/data/vehicles.ts.
import { Circle, Polygon, Vec2, WheelJoint, type Body, type Fixture, type World } from 'planck';
import type { VehicleSpec } from '../data/vehicles';
import { CAT_WHEEL } from './constants';

/** Vehicle bodies never collide with each other. */
const VEHICLE_GROUP = -1;

export class Vehicle {
  readonly chassis: Body;
  readonly roof: Fixture;
  /** [rear, front] */
  readonly wheels: [Body, Body];
  readonly joints: [WheelJoint, WheelJoint];

  constructor(
    world: World,
    readonly spec: VehicleSpec,
    x: number,
    y: number,
  ) {
    this.chassis = world.createBody({ type: 'dynamic', position: new Vec2(x, y) });
    const filter = { filterGroupIndex: VEHICLE_GROUP };
    for (const poly of spec.chassisPolys) {
      this.chassis.createFixture(new Polygon(poly.map(([px, py]) => new Vec2(px, py))), {
        density: spec.chassisDensity,
        friction: spec.chassisFriction,
        ...filter,
      });
    }
    this.roof = this.chassis.createFixture(new Polygon(spec.roofPoly.map(([px, py]) => new Vec2(px, py))), {
      density: spec.chassisDensity,
      friction: spec.chassisFriction,
      ...filter,
    });
    const mk = (i: 0 | 1): [Body, WheelJoint] => {
      const [ax, ay] = spec.wheelAnchors[i];
      const pos = new Vec2(x + ax, y + ay);
      const wheel = world.createBody({ type: 'dynamic', position: pos });
      wheel.createFixture(new Circle(spec.wheelRadius), {
        density: spec.wheelDensity,
        friction: spec.wheelFriction,
        restitution: spec.wheelRestitution,
        filterCategoryBits: CAT_WHEEL,
        ...filter,
      });
      const joint = world.createJoint(
        new WheelJoint(
          {
            enableMotor: true,
            maxMotorTorque: 0,
            motorSpeed: 0,
            frequencyHz: spec.suspensionHz,
            dampingRatio: spec.suspensionDamping,
          },
          this.chassis,
          wheel,
          pos,
          new Vec2(0, 1),
        ),
      )!;
      return [wheel, joint];
    };
    const [rear, rj] = mk(0);
    const [front, fj] = mk(1);
    this.wheels = [rear, front];
    this.joints = [rj, fj];
  }

  /** Forward speed along the chassis axis (m/s). */
  forwardSpeed(): number {
    const v = this.chassis.getLinearVelocity();
    const f = this.chassis.getWorldVector(new Vec2(1, 0));
    return v.x * f.x + v.y * f.y;
  }

  /** Apply one step of control. `airborne` comes from the previous step's contact state. */
  applyControl(hold: boolean, airborne: boolean): void {
    const s = this.spec;
    const [rj, fj] = this.joints;
    if (hold) {
      rj.setMotorSpeed(-s.motorSpeed); // clockwise = forward for a vehicle facing +x
      rj.setMaxMotorTorque(s.motorTorque);
      fj.setMotorSpeed(s.driveFront ? -s.motorSpeed : 0);
      fj.setMaxMotorTorque(s.driveFront ? s.motorTorque : 0);
    } else {
      const brake = !airborne && Math.abs(this.forwardSpeed()) < s.brakeFullSpeed;
      const t = brake ? s.brakeTorque : s.coastTorque;
      rj.setMotorSpeed(0);
      rj.setMaxMotorTorque(t);
      fj.setMotorSpeed(0);
      fj.setMaxMotorTorque(t);
    }
    if (airborne) {
      const w = this.chassis.getAngularVelocity();
      if (hold && w < s.airMaxAngVel) this.chassis.applyTorque(s.airTorque, true);
      if (!hold && w > -s.airReleaseMaxAngVel) this.chassis.applyTorque(-s.airReleaseTorque, true);
    }
    this.applyBumpStops();
  }

  /** planck's WheelJoint has no travel limit: push back with a stiff spring beyond ±travel. */
  private applyBumpStops(): void {
    const s = this.spec;
    for (let i = 0; i < 2; i++) {
      const j = this.joints[i];
      const tr = j.getJointTranslation(); // + = wheel pushed up into the chassis
      const over = tr > s.suspensionTravel ? tr - s.suspensionTravel : tr < -s.suspensionTravel ? tr + s.suspensionTravel : 0;
      if (over === 0) continue;
      let f = -(s.bumpStopStiffness * over + s.bumpStopDamping * j.getJointSpeed());
      f = over > 0 ? Math.min(0, f) : Math.max(0, f); // push only, never stick
      const axis = this.chassis.getWorldVector(new Vec2(0, 1));
      const force = new Vec2(axis.x * f, axis.y * f);
      const wheel = this.wheels[i];
      wheel.applyForce(force, wheel.getPosition(), true);
      this.chassis.applyForce(new Vec2(-force.x, -force.y), wheel.getPosition(), true);
    }
  }

  /** 0..1 compression per wheel [rear, front]. */
  suspension(): [number, number] {
    const t = this.spec.suspensionTravel;
    const c = (j: WheelJoint) => Math.min(1, Math.max(0, j.getJointTranslation() / t));
    return [c(this.joints[0]), c(this.joints[1])];
  }

  destroy(world: World): void {
    world.destroyBody(this.wheels[0]);
    world.destroyBody(this.wheels[1]);
    world.destroyBody(this.chassis);
  }
}
