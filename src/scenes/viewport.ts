export const LOGICAL_W = 390;
export const MIN_H = 520;
export const MAX_H = 900;

/** Logical game height for a viewport of w x h CSS px (width is always LOGICAL_W). */
export function logicalHeight(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 844;
  const v = Math.round((LOGICAL_W * h) / w);
  return Math.min(MAX_H, Math.max(MIN_H, v));
}
