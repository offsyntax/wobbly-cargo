import Phaser from 'phaser';
import { AudioSystem } from '../audio/AudioSystem';

const FONTS = ["400 24px 'Lilita One'", '700 16px Nunito', '800 16px Nunito'];
const TIMEOUT_MS = 4000;

/** Wait for the bundled @font-face fonts so Phaser text never measures with a fallback. */
async function loadFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all(FONTS.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, TIMEOUT_MS)),
    ]);
  } catch {
    /* fall back to the system fonts named after them in the CSS stacks */
  }
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
  preload(): void {
    window.__WC__.scene = 'Preload';
    this.load.atlas('atlas', 'atlas/atlas.png', 'atlas/atlas.json');
  }
  create(): void {
    let audio: AudioSystem | null;
    try {
      // share Phaser's WebAudio context when it has one
      const ctx = (this.sound as { context?: AudioContext }).context;
      audio = new AudioSystem(ctx);
    } catch {
      audio = null; // no Web Audio: the game stays silent
    }
    this.registry.set('audio', audio);
    void Promise.all([loadFonts(), audio ? audio.load() : Promise.resolve()]).then(() => this.scene.start('Game'));
  }
}
