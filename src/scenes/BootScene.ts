import Phaser from 'phaser';
import { getPlatform } from '../platform';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    window.__WC__.scene = 'Boot';
    void getPlatform()
      .init()
      .then(() => this.scene.start('Preload'));
  }
}
