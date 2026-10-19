import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    window.__WC__.scene = 'Boot';
    this.scene.start('Preload');
  }
}
