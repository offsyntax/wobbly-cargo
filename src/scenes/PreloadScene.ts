import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
  preload(): void {
    window.__WC__.scene = 'Preload';
    this.load.atlas('atlas', 'atlas/atlas.png', 'atlas/atlas.json');
  }
  create(): void {
    this.scene.start('Game');
  }
}
