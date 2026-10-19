import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';
import { LOGICAL_W, logicalHeight } from './scenes/viewport';

declare global {
  interface Window {
    __WC__: { ready: boolean; scene: string };
  }
}

window.__WC__ = { ready: false, scene: '' };

function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  return vv ? { w: vv.width, h: vv.height } : { w: window.innerWidth, h: window.innerHeight };
}
function currentHeight(): number {
  const { w, h } = viewportSize();
  return logicalHeight(w, h);
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LOGICAL_W,
  height: currentHeight(),
  backgroundColor: '#9ED8F5',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [BootScene, PreloadScene, GameScene],
});

let timer: number | undefined;
function onViewportChange(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const h = currentHeight();
    if (h !== game.scale.gameSize.height) game.scale.setGameSize(LOGICAL_W, h);
    game.scale.refresh();
  }, 100);
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
window.visualViewport?.addEventListener('resize', onViewportChange);
