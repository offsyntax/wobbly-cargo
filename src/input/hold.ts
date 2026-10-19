/** One-finger control (GDD section 4): held = any pointer (touch or mouse), Space or ArrowUp. */
export interface HoldState {
  held: boolean;
}

export interface HoldOptions {
  /** Pointer pressed on UI? Return true when the press hit a UI button (handled there, never counts as hold). */
  uiPointer?: (e: PointerEvent) => boolean;
  /** Any other key (Enter, R...). Not called for auto-repeat. */
  onKey?: (e: KeyboardEvent) => void;
  /** Any pointer/key gesture (audio unlock). */
  onGesture?: () => void;
}

export interface HoldHandle {
  detach(): void;
  /** Pointers/keys that are down now stop counting until they are released and pressed again. */
  reset(): void;
}

export function attachHold(state: HoldState, onTogglePause: () => void, opts: HoldOptions = {}): HoldHandle {
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const stalePointers = new Set<number>();
  const staleKeys = new Set<string>();
  const ui = new Set<number>();
  const update = (): void => {
    state.held = pointers.size > 0 || keys.size > 0;
  };
  const clear = (): void => {
    pointers.clear();
    keys.clear();
    stalePointers.clear();
    staleKeys.clear();
    ui.clear();
    update();
  };
  const reset = (): void => {
    pointers.forEach((id) => stalePointers.add(id));
    keys.forEach((k) => staleKeys.add(k));
    pointers.clear();
    keys.clear();
    update();
  };
  const pDown = (e: PointerEvent): void => {
    opts.onGesture?.();
    if (opts.uiPointer?.(e)) {
      ui.add(e.pointerId);
      return;
    }
    pointers.add(e.pointerId);
    update();
  };
  const pUp = (e: PointerEvent): void => {
    opts.onGesture?.();
    ui.delete(e.pointerId);
    stalePointers.delete(e.pointerId);
    pointers.delete(e.pointerId);
    update();
  };
  const kDown = (e: KeyboardEvent): void => {
    opts.onGesture?.();
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (staleKeys.has(e.code)) return;
      keys.add(e.code);
      update();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') onTogglePause();
    else opts.onKey?.(e);
  };
  const kUp = (e: KeyboardEvent): void => {
    staleKeys.delete(e.code);
    if (keys.delete(e.code)) update();
  };
  window.addEventListener('pointerdown', pDown);
  window.addEventListener('pointerup', pUp);
  window.addEventListener('pointercancel', pUp);
  window.addEventListener('keydown', kDown);
  window.addEventListener('keyup', kUp);
  window.addEventListener('blur', clear);
  return {
    reset,
    detach: () => {
      window.removeEventListener('pointerdown', pDown);
      window.removeEventListener('pointerup', pUp);
      window.removeEventListener('pointercancel', pUp);
      window.removeEventListener('keydown', kDown);
      window.removeEventListener('keyup', kUp);
      window.removeEventListener('blur', clear);
    },
  };
}
