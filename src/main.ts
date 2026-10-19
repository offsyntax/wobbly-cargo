import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';
import { viewMetrics } from './render/view';

declare global {
  interface Window {
    __WC__: { ready: boolean; scene: string; held: boolean; paused: boolean; simSteps: number; hud: { x: number; y: number; w: number; h: number }; view: { top: number; bottom: number }; boxY: number; camLog?: { t: number; sx: number; sy: number; zoom: number; boxY: number; ty: number; steps: number }[] };
  }
}

window.__WC__ = { ready: false, scene: '', held: false, paused: false, simSteps: 0, hud: { x: 0, y: 0, w: 0, h: 0 }, view: { top: 0, bottom: 0 }, boxY: 0 };

// Full-viewport canvas: backing store = CSS size x DPR (capped at 2); CSS stretches it to 100% of #game
// (same size, so it is never upscaled). Scale.NONE + our own resize keeps the backing size exact.
const m0 = viewMetrics();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: m0.pxW,
  height: m0.pxH,
  backgroundColor: '#9ED8F5',
  render: { roundPixels: false },
  scale: { mode: Phaser.Scale.NONE },
  input: { activePointers: 2 },
  scene: [BootScene, PreloadScene, GameScene],
});

let raf = 0;
function applySize(): void {
  const m = viewMetrics();
  if (m.pxW !== game.scale.width || m.pxH !== game.scale.height) game.scale.resize(m.pxW, m.pxH);
}
function onViewportChange(): void {
  applySize(); // same frame as the event; scene re-layouts from the scale 'resize' event
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(applySize); // catch late dvh / visualViewport settling
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
window.visualViewport?.addEventListener('resize', onViewportChange);
const host = document.getElementById('game');
if (host && typeof ResizeObserver !== 'undefined') new ResizeObserver(onViewportChange).observe(host);
