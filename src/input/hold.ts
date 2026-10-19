/** One-finger control (GDD section 4): held = any pointer (touch or mouse), Space or ArrowUp. */
export interface HoldState {
  held: boolean;
}

export function attachHold(state: HoldState, onTogglePause: () => void): () => void {
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const update = (): void => {
    state.held = pointers.size > 0 || keys.size > 0;
  };
  const clear = (): void => {
    pointers.clear();
    keys.clear();
    update();
  };
  const pDown = (e: PointerEvent): void => {
    pointers.add(e.pointerId);
    update();
  };
  const pUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    update();
  };
  const kDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      keys.add(e.code);
      update();
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      onTogglePause();
    }
  };
  const kUp = (e: KeyboardEvent): void => {
    if (keys.delete(e.code)) update();
  };
  window.addEventListener('pointerdown', pDown);
  window.addEventListener('pointerup', pUp);
  window.addEventListener('pointercancel', pUp);
  window.addEventListener('keydown', kDown);
  window.addEventListener('keyup', kUp);
  window.addEventListener('blur', clear);
  return () => {
    window.removeEventListener('pointerdown', pDown);
    window.removeEventListener('pointerup', pUp);
    window.removeEventListener('pointercancel', pUp);
    window.removeEventListener('keydown', kDown);
    window.removeEventListener('keyup', kUp);
    window.removeEventListener('blur', clear);
  };
}
