/** Pure camera rules (GDD section 6). No Phaser imports. Units: CSS px and metres. */

/** Visible world is at least 16 x 9 metres at every aspect: px per metre (CSS px). */
export function baseZoom(viewW: number, viewH: number): number {
  if (!(viewW > 0) || !(viewH > 0)) return 1;
  return Math.min(viewW / 16, viewH / 9);
}

const WIDE = 16 / 9;
const TALL = 9 / 16;

/**
 * Vehicle screen position as fractions of the view.
 * x = 0.32. y = 0.55 for aspect (w/h) >= 16:9, 0.62 for aspect <= 9:16,
 * linearly interpolated on log(aspect) in between (so 1:1 sits exactly midway).
 */
export function anchor(viewW: number, viewH: number): { x: number; y: number } {
  const a = viewW > 0 && viewH > 0 ? viewW / viewH : 1;
  const t = clamp((Math.log(a) - Math.log(TALL)) / (Math.log(WIDE) - Math.log(TALL)), 0, 1);
  return { x: 0.32, y: 0.62 + (0.55 - 0.62) * t };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Speed/air zoom multiplier range (M1 fills in the driver). */
export const ZOOM_MUL_MIN = 0.75;
export const ZOOM_MUL_MAX = 1;
export function clampZoomMul(m: number): number {
  return clamp(m, ZOOM_MUL_MIN, ZOOM_MUL_MAX);
}
// TODO(M1): groundY from terrain; look-ahead offset and speed/air zoom multiplier driver.

export interface FrameInput {
  /** Vehicle y, metres, up-positive. */
  vehicleY: number;
  /** Ground height under the vehicle, metres, up-positive. */
  groundY: number;
  viewW: number;
  viewH: number;
  baseZoom: number;
  /** Vehicle screen y as a fraction of view height from the top. */
  anchorY: number;
  /** Top/bottom margin as a fraction of view height (default 0.12). */
  margin?: number;
}

/**
 * Vertical framing target (GDD section 6). Returns the world y (m, up-positive) at the view centre and a
 * zoom multiplier. Normal anchor framing when the ground fits below the vehicle; otherwise frame
 * ground..vehicle with margins, zooming out to ZOOM_MUL_MIN; past that the vehicle stays visible near the
 * top margin and the ground falls off the bottom.
 */
export function frameVertical(i: FrameInput): { centerY: number; zoomMul: number } {
  const m = i.margin ?? 0.12;
  const viewHm = (mul: number): number => i.viewH / (i.baseZoom * mul);
  const h1 = viewHm(1);
  const height = Math.max(0, i.vehicleY - i.groundY);
  if (height <= (1 - i.anchorY - m) * h1) {
    return { centerY: i.vehicleY + (i.anchorY - 0.5) * h1, zoomMul: 1 };
  }
  const needH = height / (1 - 2 * m);
  const zoomMul = clampZoomMul(i.viewH / (i.baseZoom * needH));
  const h = viewHm(zoomMul);
  if (needH <= h + 1e-9) return { centerY: (i.vehicleY + i.groundY) / 2, zoomMul };
  return { centerY: i.vehicleY + m * h - h / 2, zoomMul };
}

/** Unity-style critically damped spring. Never overshoots `target`; velocity is carried by the caller. */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): { value: number; velocity: number } {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  let vel = (velocity - omega * temp) * e;
  let out = target + (change + temp) * e;
  if (target - current > 0 === out > target) {
    out = target;
    vel = 0;
  }
  return { value: out, velocity: vel };
}

export const SMOOTH_X_S = 0.25;
export const SMOOTH_Y_S = 0.45;
export const SMOOTH_ZOOM_S = 0.8;
/** Vertical dead zone: half band as a fraction of the view height. */
export const DEAD_ZONE_FRAC = 0.1;
export const ZOOM_IN_MARGIN = 0.05;
export const ZOOM_IN_HOLD_S = 0.5;

/** Moves `target` only when `desired` leaves target +- halfBand (then drags it along the band edge). */
export function deadZone(target: number, desired: number, halfBand: number): number {
  if (desired > target + halfBand) return desired - halfBand;
  if (desired < target - halfBand) return desired + halfBand;
  return target;
}

export interface ZoomHold {
  /** Held zoom multiplier target. */
  held: number;
  /** Seconds the needed zoom has stayed >= held + margin. */
  timer: number;
}

/**
 * Zoom hysteresis. Zooming out (needed < held) is immediate; zooming back in only after the needed
 * multiplier has stayed >= held + 0.05 (or the max, if closer) for 0.5 s.
 */
export function stepZoomHold(s: ZoomHold, needed: number, dt: number): ZoomHold {
  if (needed < s.held) return { held: needed, timer: 0 };
  const margin = Math.min(ZOOM_IN_MARGIN, ZOOM_MUL_MAX - s.held);
  if (margin > 0 && needed >= s.held + margin) {
    const timer = s.timer + dt;
    return timer >= ZOOM_IN_HOLD_S ? { held: needed, timer: 0 } : { held: s.held, timer };
  }
  return { held: s.held, timer: 0 };
}

/** View-centre y (m) for framing the vehicle at a fixed zoom multiplier (same rules as frameVertical). */
export function centerAtZoom(i: FrameInput, zoomMul: number): number {
  const m = i.margin ?? 0.12;
  const h = i.viewH / (i.baseZoom * zoomMul);
  const height = Math.max(0, i.vehicleY - i.groundY);
  if (height <= (1 - i.anchorY - m) * h) return i.vehicleY + (i.anchorY - 0.5) * h;
  if (height / (1 - 2 * m) <= h + 1e-9) return (i.vehicleY + i.groundY) / 2;
  return i.vehicleY + m * h - h / 2;
}

export interface RigInput extends FrameInput {
  vehicleX: number;
  /** Vehicle screen x as a fraction of view width. */
  anchorX: number;
}

/** Camera state: spring-followed centre (m, y up) and zoom multiplier. Pure; feed it the INTERPOLATED vehicle. */
export class CameraRig {
  x = 0;
  y = 0;
  zoomMul = 1;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private hold: ZoomHold = { held: 1, timer: 0 };
  /** Dead-zone-filtered y target (m), before the spring. */
  targetY = 0;

  update(dt: number, i: RigInput, snap = false): void {
    const needed = frameVertical(i).zoomMul;
    const viewWm = (mul: number): number => i.viewW / (i.baseZoom * mul);
    if (snap) {
      this.hold = { held: needed, timer: 0 };
      this.zoomMul = needed;
      this.targetY = this.y = centerAtZoom(i, needed);
      this.x = i.vehicleX - (i.anchorX - 0.5) * viewWm(needed);
      this.vx = this.vy = this.vz = 0;
      return;
    }
    const d = clamp(dt, 0, 0.1);
    this.hold = stepZoomHold(this.hold, needed, d);
    const held = this.hold.held;
    const band = (DEAD_ZONE_FRAC * i.viewH) / (i.baseZoom * held);
    this.targetY = deadZone(this.targetY, centerAtZoom(i, held), band);
    const tx = i.vehicleX - (i.anchorX - 0.5) * viewWm(this.zoomMul);
    const sx = smoothDamp(this.x, tx, this.vx, SMOOTH_X_S, d);
    const sy = smoothDamp(this.y, this.targetY, this.vy, SMOOTH_Y_S, d);
    const sz = smoothDamp(this.zoomMul, held, this.vz, SMOOTH_ZOOM_S, d);
    this.x = sx.value;
    this.vx = sx.velocity;
    this.y = sy.value;
    this.vy = sy.velocity;
    this.zoomMul = sz.value;
    this.vz = sz.velocity;
  }
}
