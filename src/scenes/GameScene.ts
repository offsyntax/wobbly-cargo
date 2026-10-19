import Phaser from 'phaser';
import { Box, Vec2, type Body } from 'planck';
import { PPM } from '../sim/constants';
import { FixedStepper, createWorld } from '../sim/world';
import en from '../i18n/en.json';
import { getPlatform } from '../platform';
import { anchor, baseZoom, clamp } from '../render/camera';
import { safeInsets, viewMetrics } from '../render/view';
import { attachHold } from '../input/hold';

const INK = 0x1e1b2e;
const HALF_WIDTH_M = 60; // ground strip spans x -60..+60 m
const GROUND_DEPTH_M = 400; // far deeper than any portrait view shows below the vehicle

export class GameScene extends Phaser.Scene {
  private stepper!: FixedStepper;
  private box!: Body;
  private boxGfx!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private dot!: Phaser.GameObjects.Image;
  private firstFrame = true;
  private userPaused = false;
  private platformPaused = false;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private worldObjs: Phaser.GameObjects.GameObject[] = [];
  private uiObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Game');
  }

  create(): void {
    window.__WC__.scene = 'Game';
    this.firstFrame = true;
    this.userPaused = false;
    this.platformPaused = false;
    this.worldObjs = [];
    this.uiObjs = [];

    // World art is in px at PPM px/m; world y is down, ground top at y = 0, sim y is up.
    const W = HALF_WIDTH_M * 2 * PPM;
    const gx = -HALF_WIDTH_M * PPM;
    const dirt = this.add.rectangle(gx, 0, W, GROUND_DEPTH_M * PPM, 0x9b6a3e).setOrigin(0, 0);
    const grass = this.add.rectangle(gx, 0, W, 0.6 * PPM, 0x6bbf59).setOrigin(0, 0);
    const edge = this.add.rectangle(gx, 0, W, 4, INK).setOrigin(0, 0.5);
    this.boxGfx = this.add.rectangle(0, 0, PPM, PPM, 0xe8443a).setStrokeStyle(4, INK);
    this.worldObjs.push(dirt, grass, edge, this.boxGfx);

    const world = createWorld();
    const ground = world.createBody();
    ground.createFixture(new Box(HALF_WIDTH_M, 1, new Vec2(0, -1), 0));
    this.box = world.createBody({ type: 'dynamic', position: new Vec2(0, 12) });
    this.box.createFixture(new Box(0.5, 0.5), { density: 1, friction: 0.4, restitution: 0.3 });
    this.box.setAngularVelocity(2);
    this.stepper = new FixedStepper(world);

    // HUD lives on its own camera at zoom 1 (backing px); world objects are hidden from it.
    this.title = this.add
      .text(0, 0, en.game.m0, { fontFamily: 'system-ui, sans-serif', color: '#1E1B2E' })
      .setOrigin(0.5, 0);
    this.dot = this.add.image(0, 0, 'atlas', 'test-dot').setOrigin(1, 0);
    this.uiObjs.push(this.title, this.dot);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui');
    this.cameras.main.ignore(this.uiObjs);
    this.uiCam.ignore(this.worldObjs);

    const platform = getPlatform();
    platform.onPause(() => {
      this.platformPaused = true;
      this.syncPause();
    });
    platform.onResume(() => {
      this.platformPaused = false;
      this.syncPause();
    });
    platform.onAudioChange((on) => (this.sound.mute = !on));
    this.sound.mute = !platform.isAudioEnabled();

    const detach = attachHold(window.__WC__, () => {
      this.userPaused = !this.userPaused;
      this.syncPause();
    });

    const onResize = (): void => this.layout();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      detach();
    });
    this.layout();
    this.syncPause();
  }

  private syncPause(): void {
    const p = this.userPaused || this.platformPaused;
    this.stepper.paused = p;
    window.__WC__.paused = p;
  }

  /** Recompute camera zoom/anchor and HUD placement. Never restarts the scene; sim state is untouched. */
  private layout(): void {
    const { cssW, cssH, dpr, pxW, pxH } = viewMetrics();
    this.cameras.main.setSize(pxW, pxH);
    this.uiCam.setSize(pxW, pxH);
    this.uiCam.setZoom(1);
    this.uiCam.setScroll(0, 0);
    this.cameras.main.setZoom((baseZoom(cssW, cssH) * dpr) / PPM);
    this.followBox();

    // HUD: edges plus safe-area insets, scaled by the short side (clamped).
    const s = clamp(Math.min(cssW, cssH) / 390, 0.85, 1.6) * dpr;
    const inset = safeInsets();
    const pad = 16 * s;
    const top = inset.top * dpr + pad;
    this.title.setFontSize(Math.round(24 * s)).setPosition(pxW / 2, top);
    const dotSize = Math.round(32 * s);
    this.dot.setDisplaySize(dotSize, dotSize).setPosition(pxW - inset.right * dpr - pad, top);

    // Expose HUD bounds (CSS px) for e2e.
    const tb = this.title.getBounds();
    const db = this.dot.getBounds();
    const x = Math.min(tb.x, db.x);
    const y = Math.min(tb.y, db.y);
    window.__WC__.hud = {
      x: x / dpr,
      y: y / dpr,
      w: (Math.max(tb.right, db.right) - x) / dpr,
      h: (Math.max(tb.bottom, db.bottom) - y) / dpr,
    };
  }

  /** Place the box at the anchor: screen = (world - scroll - size/2) * zoom + size/2. */
  private followBox(): void {
    const cam = this.cameras.main;
    const { cssW, cssH } = viewMetrics();
    const a = anchor(cssW, cssH);
    const p = this.box.getPosition();
    const wx = p.x * PPM;
    const wy = -p.y * PPM;
    cam.setScroll(
      wx - cam.width / 2 - ((a.x - 0.5) * cam.width) / cam.zoom,
      wy - cam.height / 2 - ((a.y - 0.5) * cam.height) / cam.zoom,
    );
  }

  override update(_time: number, delta: number): void {
    window.__WC__.simSteps += this.stepper.advance(delta / 1000);
    const p = this.box.getPosition();
    this.boxGfx.setPosition(p.x * PPM, -p.y * PPM);
    this.boxGfx.setRotation(-this.box.getAngle());
    this.followBox();

    if (this.firstFrame) {
      this.firstFrame = false;
      window.__WC__.ready = true;
      getPlatform().gameReady();
    }
  }
}
