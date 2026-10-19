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
