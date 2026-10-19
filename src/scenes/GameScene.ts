import Phaser from 'phaser';
import { Box, Vec2, type Body } from 'planck';
import { PPM } from '../sim/constants';
import { FixedStepper, createWorld } from '../sim/world';
import en from '../i18n/en.json';
import { getPlatform } from '../platform';
import { CameraRig, anchor, baseZoom, clamp } from '../render/camera';
import { lerpPose, type Pose } from '../render/interp';
import { safeInsets, viewMetrics } from '../render/view';
import { attachHold } from '../input/hold';

const INK = 0x1e1b2e;
const HALF_WIDTH_M = 60; // ground strip spans x -60..+60 m
const DROP_HEIGHT_M = 6; // box centre above the ground top at start
const GROUND_Y_M = 0; // M1: terrain height under the vehicle
const GROUND_DEPTH_M = 400; // far deeper than any portrait view shows below the vehicle

export class GameScene extends Phaser.Scene {
  private stepper!: FixedStepper;
  private box!: Body;
  private boxGfx!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private dot!: Phaser.GameObjects.Image;
  private firstFrame = true;
  private rig = new CameraRig();
  private prevPose: Pose = { x: 0, y: 0, angle: 0 };
  private currPose: Pose = { x: 0, y: 0, angle: 0 };
  private camLogOn = new URLSearchParams(window.location.search).get('camlog') === '1';
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
    this.box = world.createBody({ type: 'dynamic', position: new Vec2(0, DROP_HEIGHT_M) });
    this.box.createFixture(new Box(0.5, 0.5), { density: 1, friction: 0.4, restitution: 0.3 });
    this.box.setAngularVelocity(2);
    this.stepper = new FixedStepper(world);
    this.currPose = this.pose();
    this.prevPose = this.currPose;
    this.rig = new CameraRig();
    this.boxGfx.setPosition(this.currPose.x * PPM, -this.currPose.y * PPM);

    // HUD lives on its own camera at zoom 1 (backing px); world objects are hidden from it.
    this.title = this.add
      .text(0, 0, en.game.m0, { fontFamily: 'system-ui, sans-serif', color: '#1E1B2E' })
      .setOrigin(0.5, 0);
    this.dot = this.add.image(0, 0, 'atlas', 'test-dot').setOrigin(1, 0);
    this.uiObjs.push(this.title, this.dot);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui');
    this.cameras.main.roundPixels = false; // sub-pixel world rendering: no shimmer
    this.uiCam.roundPixels = true; // HUD stays crisp
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
    this.followBox(0, this.currPose, true);

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

  private pose(): Pose {
    const p = this.box.getPosition();
    return { x: p.x, y: p.y, angle: this.box.getAngle() };
  }

  /** Frame the interpolated box (GDD section 6): spring-damped, dead zone, zoom hysteresis. snap = no smoothing. */
  private followBox(dt: number, p: Pose, snap = false): void {
    const cam = this.cameras.main;
    const { cssW, cssH, dpr } = viewMetrics();
    const a = anchor(cssW, cssH);
    const bz = baseZoom(cssW, cssH);
    this.rig.update(
      dt,
      {
        vehicleX: p.x,
        vehicleY: p.y,
        groundY: GROUND_Y_M,
        viewW: cssW,
        viewH: cssH,
        baseZoom: bz,
        anchorX: a.x,
        anchorY: a.y,
        margin: 0.12,
      },
      snap,
    );
    cam.setZoom((bz * this.rig.zoomMul * dpr) / PPM);
    // screen = (world - scroll - size/2) * zoom + size/2; scroll is the top-left of the view at zoom 1 offsets
    cam.setScroll(this.rig.x * PPM - cam.width / 2, -this.rig.y * PPM - cam.height / 2);
    const halfH = cam.height / cam.zoom / PPM / 2;
    window.__WC__.boxY = p.y;
    window.__WC__.view = { top: this.rig.y + halfH, bottom: this.rig.y - halfH };
  }

  override update(time: number, delta: number): void {
    const stepped = this.stepper.advance(delta / 1000, () => {
      this.prevPose = this.currPose;
      this.currPose = this.pose();
    });
    window.__WC__.simSteps += stepped;
    const p = lerpPose(this.prevPose, this.currPose, this.stepper.alpha);
    this.boxGfx.setPosition(p.x * PPM, -p.y * PPM);
    this.boxGfx.setRotation(-p.angle);
    this.followBox(delta / 1000, p, this.firstFrame);

    if (this.camLogOn) {
      const cam = this.cameras.main;
      const log = (window.__WC__.camLog ??= []);
      if (log.length < 4000) {
        log.push({ t: time, sx: cam.scrollX / PPM, sy: cam.scrollY / PPM, zoom: cam.zoom, boxY: p.y, ty: this.rig.targetY, steps: window.__WC__.simSteps });
      }
    }

    if (this.firstFrame) {
      this.firstFrame = false;
      window.__WC__.ready = true;
      getPlatform().gameReady();
    }
  }
}
