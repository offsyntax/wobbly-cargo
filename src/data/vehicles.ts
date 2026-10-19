// Vehicle tuning data. Units: metres, kg (planck density = kg/m²), N·m, rad/s, seconds.
// Chassis-local coordinates: x forward (vehicle faces +x), y up, origin = chassis pivot.
// Geometry matches the art pivots documented in `art/src/pickup-body.svg`.

export type Pt = [number, number];

export interface VehicleSpec {
  id: string;
  /** Convex chassis polygons (CCW). The roof polygon is separate (roof contact = flip). */
  chassisPolys: Pt[][];
  roofPoly: Pt[];
  /** Bed interior: floor top y, x range, wall top. Cargo spawns here. */
  bed: { minX: number; maxX: number; floorY: number; wallTopY: number };
  /** Cargo counts as "in the bed" while inside this chassis-local box. */
  cargoRegion: { minX: number; maxX: number; minY: number; maxY: number };
  chassisDensity: number;
  chassisFriction: number;
  /** Wheel centres (chassis-local) [rear, front]. */
  wheelAnchors: [Pt, Pt];
  wheelRadius: number;
  wheelDensity: number;
  wheelFriction: number;
  wheelRestitution: number;
  /** WheelJoint spring. */
  suspensionHz: number;
  suspensionDamping: number;
  /** Free travel (m) either way before the bump stop pushes back; also the telemetry 0..1 scale. */
  suspensionTravel: number;
  bumpStopStiffness: number;
  bumpStopDamping: number;
  /** Drive: target wheel speed (rad/s, top speed = motorSpeed × wheelRadius) and torque. */
  motorSpeed: number;
  motorTorque: number;
  /** Monster later: true drives both wheels. */
  driveFront: boolean;
  /** Release: engine-braking torque per wheel while rolling. */
  coastTorque: number;
  /** Release: holding brake per wheel once |speed| < brakeFullSpeed (stops, never reverses). */
  brakeTorque: number;
  brakeFullSpeed: number;
  /** Air: hold = nose-up torque, release = slower nose-forward torque, each with a spin cap. */
  airTorque: number;
  airMaxAngVel: number;
  airReleaseTorque: number;
  airReleaseMaxAngVel: number;
  /** No wheel contact for longer than this = airborne. */
  airborneDelay: number;
  /** Minimum contact impulse (N·s per step) for an `impact` event, per part. */
  impactMin: { chassis: number; wheel: number; roof: number };
  /** Minimum impulse for a `land` event. */
  landMin: number;
}

export const PICKUP: VehicleSpec = {
  id: 'pickup',
  chassisPolys: [
    // lower body / bed floor
    [[-1.6, -0.55], [1.6, -0.55], [1.6, 0], [-1.6, 0]],
    // rear wall (tailgate), interior depth 0.35 m
    [[-1.6, 0], [-1.45, 0], [-1.45, 0.35], [-1.6, 0.35]],
    // cab (back wall doubles as bed front wall)
    [[-0.05, 0], [1.0, 0], [1.0, 0.175], [0.7, 0.5], [-0.05, 0.5]],
    // hood
    [[1.0, 0], [1.6, 0], [1.55, 0.1], [1.0, 0.175]],
  ],
  roofPoly: [[-0.05, 0.45], [0.75, 0.45], [0.68, 0.56], [-0.05, 0.56]],
  bed: { minX: -1.45, maxX: -0.05, floorY: 0, wallTopY: 0.35 },
  cargoRegion: { minX: -1.75, maxX: 0.15, minY: -0.25, maxY: 1.8 },
  chassisDensity: 2.0, // ≈ 5 kg chassis: heavy vs 0.15 kg eggs so they ride, not push
  chassisFriction: 0.5,
  wheelAnchors: [[-1.05, -0.45], [1.05, -0.45]],
  wheelRadius: 0.45,
  wheelDensity: 1.0,
  wheelFriction: 0.95, // grippy: climbs city hills without spinning out
  wheelRestitution: 0.05,
  suspensionHz: 4.0, // soft enough to soak bumps, firm enough not to wallow
  suspensionDamping: 2.0, // planck damps against wheel mass; ~2 ≈ near-critical for the chassis (no egg-launching rebound)
  suspensionTravel: 0.3,
  bumpStopStiffness: 2500,
  bumpStopDamping: 150, // ≈ critical: absorbs bottoming-out instead of bouncing
  motorSpeed: 30, // top speed ≈ 13.5 m/s
  motorTorque: 11, // ≈ 3 m/s² on flat; just under the rear-tyre grip limit
  driveFront: false,
  coastTorque: 3, // release ≈ 2 m/s² decel: brakes for downhills without pitching eggs forward
  brakeTorque: 12,
  brakeFullSpeed: 1.5,
  airTorque: 22,
  airMaxAngVel: 3.0,
  airReleaseTorque: 10,
  airReleaseMaxAngVel: 1.6,
  airborneDelay: 0.1,
  impactMin: { chassis: 0.6, wheel: 1.5, roof: 0.3 },
  landMin: 0.8,
};

export const VEHICLES: Record<string, VehicleSpec> = { pickup: PICKUP };
