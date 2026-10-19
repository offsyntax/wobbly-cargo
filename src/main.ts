import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';

declare global {
  interface Window {
    __WC__: { ready: boolean; scene: string };
  }
}

window.__WC__ = { ready: false, scene: '' };

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 390,
  height: 844,
  backgroundColor: '#9ED8F5',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [BootScene, PreloadScene, GameScene],
});
