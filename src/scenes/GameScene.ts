import Phaser from 'phaser';
import { Box, Vec2, type Body } from 'planck';
import { PPM } from '../sim/constants';
import { FixedStepper, createWorld } from '../sim/world';
import en from '../i18n/en.json';
import { getPlatform } from '../platform';

const W = 390;
const GROUND_H = 144;
const INK = 0x1e1b2e;

export class GameScene extends Phaser.Scene {
  private stepper!: FixedStepper;
  private box!: Body;
  private boxGfx!: Phaser.GameObjects.Rectangle;
  private firstFrame = true;
  private H = 844;

  constructor() {
    super('Game');
  }

  create(): void {
    window.__WC__.scene = 'Game';
    this.H = this.scale.height;
    const H = this.H;
    const GROUND_TOP = H - GROUND_H;

    const onResize = (): void => {
      if (this.scale.height !== this.H) this.scene.restart();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    this.firstFrame = true;

    // Ground: dirt body, grass strip, ink outline.
    this.add.rectangle(0, GROUND_TOP, W, H - GROUND_TOP, 0x9b6a3e).setOrigin(0, 0);
    this.add.rectangle(0, GROUND_TOP, W, 24, 0x6bbf59).setOrigin(0, 0);
    this.add.rectangle(0, GROUND_TOP, W, 4, INK).setOrigin(0, 0.5);

    this.add
      .text(W / 2, 60, en.game.m0, { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#1E1B2E' })
      .setOrigin(0.5);

    // Sim: y-up meters, screen y-down pixels. World x=0 at screen left.
    const world = createWorld();
    const groundY = (H - GROUND_TOP) / PPM; // ground top in meters above screen bottom
    const ground = world.createBody();
    ground.createFixture(new Box(W / PPM, 1, new Vec2(W / 2 / PPM, groundY - 1), 0));
    this.box = world.createBody({ type: 'dynamic', position: new Vec2(W / 2 / PPM, 12) });
    this.box.createFixture(new Box(0.5, 0.5), { density: 1, friction: 0.4, restitution: 0.3 });
    this.box.setAngularVelocity(2);
    this.stepper = new FixedStepper(world);

    this.boxGfx = this.add.rectangle(0, 0, PPM, PPM, 0xe8443a).setStrokeStyle(4, INK);

    this.add.image(W - 40, 60, 'atlas', 'test-dot').setDisplaySize(32, 32);

    const platform = getPlatform();
    platform.onPause(() => (this.stepper.paused = true));
    platform.onResume(() => (this.stepper.paused = false));
    platform.onAudioChange((on) => (this.sound.mute = !on));
    this.sound.mute = !platform.isAudioEnabled();
  }

  override update(_time: number, delta: number): void {
    this.stepper.advance(delta / 1000);
    const p = this.box.getPosition();
    this.boxGfx.setPosition(p.x * PPM, this.H - p.y * PPM);
    this.boxGfx.setRotation(-this.box.getAngle());

    if (this.firstFrame) {
      this.firstFrame = false;
      window.__WC__.ready = true;
      getPlatform().gameReady();
    }
  }
}
