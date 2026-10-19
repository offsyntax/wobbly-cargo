import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
  preload(): void {
    window.__WC__.scene = 'Preload';
    // Atlas / audio loading comes in later slices.
  }
  create(): void {
    this.scene.start('Game');
  }
}
