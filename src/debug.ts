// Debug / e2e surface: `window.__WC__`. Read by Playwright; nothing in the game reads it back except `held`
// (the input module writes it) .
export interface DebugRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GameState = 'play' | 'fail' | 'complete' | 'paused';

export interface WcDebug {
  ready: boolean;
  scene: string;
  held: boolean;
  /** User or platform pause (sim frozen). */
  paused: boolean;
  simSteps: number;
  /** World y range (m) visible on screen. */
  view: { top: number; bottom: number };
  level: string;
  state: GameState;
  vehicleX: number;
  vehicleY: number;
  cargoLeft: number;
  /** Union of the HUD pieces in css px. */
  hud: DebugRect;
  /** Card of the open overlay in css px, or null. */
  overlay: DebugRect | null;
  /** Buttons of the open overlay in css px. */
  buttons: DebugRect[];
  camLog?: { t: number; sx: number; sy: number; zoom: number; vehicleY: number; ty: number; steps: number }[];
}

declare global {
  interface Window {
    __WC__: WcDebug;
  }
}

export function initDebug(): WcDebug {
  return {
    ready: false,
    scene: '',
    held: false,
    paused: false,
    simSteps: 0,
    view: { top: 0, bottom: 0 },
    level: '',
    state: 'play',
    vehicleX: 0,
    vehicleY: 0,
    cargoLeft: 0,
    hud: { x: 0, y: 0, w: 0, h: 0 },
    overlay: null,
    buttons: [],
  };
}
