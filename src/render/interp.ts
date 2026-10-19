/** Render interpolation between fixed sim steps. Pure. */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-arc angle lerp (radians); handles unbounded angles. */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function lerpPose(prev: Pose, curr: Pose, alpha: number): Pose {
  const t = Math.min(1, Math.max(0, alpha));
  return { x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t), angle: lerpAngle(prev.angle, curr.angle, t) };
}
