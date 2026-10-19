/** DOM-side viewport measurements (CSS px, DPR, safe-area insets). */
export interface ViewMetrics {
  cssW: number;
  cssH: number;
  dpr: number;
  /** Backing-store size in device px = css * dpr. */
  pxW: number;
  pxH: number;
}

export const MAX_DPR = 2;

export function viewMetrics(): ViewMetrics {
  const host = document.getElementById('game');
  const cssW = Math.max(1, host?.clientWidth || window.innerWidth);
  const cssH = Math.max(1, host?.clientHeight || window.innerHeight);
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  return { cssW, cssH, dpr, pxW: Math.round(cssW * dpr), pxH: Math.round(cssH * dpr) };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Safe-area insets in CSS px, read from the #safe probe (padding: env(safe-area-inset-*)). */
export function safeInsets(): Insets {
  const el = document.getElementById('safe');
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(el);
  const n = (s: string): number => parseFloat(s) || 0;
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}
