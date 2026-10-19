// Playable level: GameSim on a fixed step, interpolated sprites, world camera (GDD §6), HUD, overlays, audio.
import Phaser from 'phaser';
import type { AudioSystem } from '../audio/AudioSystem';
import type { GameState } from '../debug';
import { attachHold, type HoldHandle } from '../input/hold';
import { defaultLevelId, getLevel, hasLevel, initialLevelId, levelNumber, nextLevelId } from '../levels';
import { getPlatform } from '../platform';
import { CameraRig, anchor, baseZoom, clamp } from '../render/camera';
import { lerpPose, type Pose } from '../render/interp';
import { viewMetrics } from '../render/view';
import { Parallax, drawLevel } from '../render/worldRenderer';
import { PPM } from '../sim/constants';
import { GameSim, type CargoUnitState } from '../sim/game';
import type { SimEvent } from '../sim/types';
import { FixedStepper } from '../sim/world';
import { Hud } from '../ui/Hud';
import { uiMetrics, type EggState, type Rect } from '../ui/kit';
import { Overlay } from '../ui/Overlay';

// Sprite sizes in metres (art px / 40, see art/src/*.svg).
const BODY_SIZE: [number, number] = [3.4, 1.3];
const WHEEL_SIZE = 1.0;
const EGG_SIZE: [number, number] = [0.55, 0.65];
const SPLAT_SIZE: [number, number] = [1.3, 0.55];
const FLAG_SIZE: [number, number] = [1.45, 2.65];

const LOOK_AHEAD = 0.15; // fraction of view width at top speed
const SPEED_ZOOM = 0.15; // zoom out by this much at top speed (x1.0 -> x0.85)
const LOOK_TAU = 0.6; // s
const FAIL_DELAY = 0.8; // s of sim after the fail event before the overlay
const COMPLETE_DELAY = 0.6;
const HINT_FADE_PER_S = 4;

interface Snap {
  chassis: Pose;
  wheels: [Pose, Pose];
  eggs: CargoUnitState[];
}

export class GameScene extends Phaser.Scene {
  private audio: AudioSystem | null = null;
  private sim!: GameSim;
  private stepper!: FixedStepper;
  private levelId = '';
  private state: GameState = 'play';
  private platformPaused = false;
  private endTimer = 0;
  private finishTime = 0;

  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private hud!: Hud;
  private overlay!: Overlay;
  private input2!: HoldHandle;
  private hintDone = false;
  private hintAlpha = 1;

  private worldObjs: Phaser.GameObjects.GameObject[] = [];
  private parallax!: Parallax;
  private bodyImg!: Phaser.GameObjects.Image;
  private wheelImgs: Phaser.GameObjects.Image[] = [];
  private eggImgs: Phaser.GameObjects.Image[] = [];
  private splats: Phaser.GameObjects.Image[] = [];

  private prev!: Snap;
  private curr!: Snap;
  private rig = new CameraRig();
  private look = 0;
  private camSnap = true;
  private firstFrame = true;
  private camLogOn = new URLSearchParams(window.location.search).get('camlog') === '1';

  constructor() {
    super('Game');
  }

  create(): void {
    const wc = window.__WC__;
    wc.scene = 'Game';
    this.audio = (this.registry.get('audio') as AudioSystem | null | undefined) ?? null;
    this.firstFrame = true;
    this.hintDone = false;
    this.hintAlpha = 1;
    this.platformPaused = false;

    this.cameras.main.roundPixels = false; // sub-pixel world rendering: no shimmer
    const m = viewMetrics();
    this.uiCam = this.cameras.add(0, 0, m.pxW, m.pxH, false, 'ui');
    this.uiCam.roundPixels = true; // HUD stays crisp
    this.hud = new Hud(this, this.cameras.main);
    this.overlay = new Overlay(this, this.cameras.main, {
      retry: () => this.restart(),
      restart: () => this.restart(),
      next: () => this.startLevel(nextLevelId(this.levelId)),
      resume: () => this.togglePause(),
    });

    const platform = getPlatform();
    platform.onPause(() => {
      this.platformPaused = true;
      this.syncPause();
    });
    platform.onResume(() => {
      this.platformPaused = false;
      this.syncPause();
    });
    platform.onAudioChange((on) => this.audio?.setMuted(!on));
    this.audio?.setMuted(!platform.isAudioEnabled());

    this.input2 = attachHold(wc, () => this.togglePause(), {
      uiPointer: (e) => this.uiPointer(e),
      onKey: (e) => this.onKey(e),
      onGesture: () => this.audio?.unlock(),
    });

    const onResize = (): void => this.layout();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.input2.detach();
    });

    this.startLevel(initialLevelId());
  }

  // ------------------------------------------------------------------ level lifecycle

  private startLevel(id: string): void {
    if (!hasLevel(id)) id = defaultLevelId();
    for (const o of this.worldObjs) o.destroy();
    this.worldObjs = [];
    this.wheelImgs = [];
    this.eggImgs = [];
    this.splats = [];

    this.levelId = id;
    const data = getLevel(id);
    this.sim = new GameSim(data);
    this.stepper = new FixedStepper(() => this.sim.step({ hold: this.state === 'play' && window.__WC__.held }));
    this.buildWorld();
    this.curr = this.snapshot();
    this.prev = this.curr;
    this.rig = new CameraRig();
    this.look = 0;
    this.camSnap = true;
    this.endTimer = 0;
    this.finishTime = 0;

    this.overlay.hide();
    this.setState('play');
    this.audio?.setMenuMode(false);
    this.input2.reset();
    window.__WC__.level = id;
    this.layout();
    this.updateSprites(this.curr, this.curr);
  }

  private restart(): void {
    this.startLevel(this.levelId);
  }

  private addWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldObjs.push(o);
    this.uiCam.ignore(o); // world objects are drawn by the main camera only
    return o;
  }

  private buildWorld(): void {
    const sim = this.sim;
    const data = sim.level.data;
    this.parallax = new Parallax(this);
    this.addWorld(this.parallax.gfx);
    for (const g of drawLevel(this, sim.level, data.coins)) this.addWorld(g);

    const gy = sim.level.groundHeightAt(data.finishX);
    this.addWorld(
      this.add
        .image(data.finishX * PPM, -gy * PPM, 'atlas', 'flag')
        .setOrigin(8 / 58, 104 / 106)
        .setDisplaySize(FLAG_SIZE[0] * PPM, FLAG_SIZE[1] * PPM)
        .setDepth(3),
    );

    this.bodyImg = this.addWorld(
      this.add.image(0, 0, 'atlas', 'pickup-body').setDisplaySize(BODY_SIZE[0] * PPM, BODY_SIZE[1] * PPM).setDepth(10),
    );
    for (let i = 0; i < sim.cargo.length; i++) {
      this.eggImgs.push(
        this.addWorld(this.add.image(0, 0, 'atlas', 'egg').setDisplaySize(EGG_SIZE[0] * PPM, EGG_SIZE[1] * PPM).setDepth(11)),
      );
    }
    for (let i = 0; i < 2; i++) {
      this.wheelImgs.push(
        this.addWorld(this.add.image(0, 0, 'atlas', 'wheel').setDisplaySize(WHEEL_SIZE * PPM, WHEEL_SIZE * PPM).setDepth(12)),
      );
    }
  }

  // ------------------------------------------------------------------ state / input

  private setState(s: GameState): void {
    this.state = s;
    window.__WC__.state = s;
    this.syncPause();
  }

  private get paused(): boolean {
    return this.state === 'paused' || this.platformPaused;
  }

  private syncPause(): void {
    if (!this.stepper) return;
    this.stepper.paused = this.paused || this.state !== 'play';
    window.__WC__.paused = this.paused;
    this.audio?.setPaused(this.paused);
  }

  private togglePause(): void {
    if (this.state === 'play' && this.sim.status === 'running') {
      this.setState('paused');
      this.input2.reset();
      this.overlay.show('pause', {}, uiMetrics());
      this.publishUi();
    } else if (this.state === 'paused') {
      this.overlay.hide();
      this.publishUi();
      this.setState('play');
      this.input2.reset(); // a finger still down must lift and press again
    }
  }

  private uiPointer(e: PointerEvent): boolean {
    const hit = (r: Rect): boolean => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h;
    if (this.overlay.visible) {
      this.overlay.buttons.find((b) => hit(b.rect))?.press();
      return true; // the scrim swallows every press
    }
    if (hit(this.hud.pauseRect)) {
      this.togglePause();
      return true;
    }
    return false;
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.state;
    if (e.code === 'KeyR' && (s === 'fail' || s === 'complete' || s === 'paused')) this.restart();
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (s === 'fail') this.restart();
      else if (s === 'complete') this.startLevel(nextLevelId(this.levelId));
      else if (s === 'paused') this.togglePause();
    }
  }

  private showResult(): void {
    const sim = this.sim;
    const eggs = this.eggStates(sim.cargoState());
    const ui = uiMetrics();
    if (sim.status === 'finished') {
      this.setState('complete');
      this.overlay.show(
        'complete',
        { stars: sim.stars, timeSec: this.finishTime, cargoSafe: sim.intactCount(), cargoTotal: sim.cargo.length, eggs },
        ui,
      );
    } else {
      const d = sim.level.data;
      const progress = clamp((this.curr.chassis.x - d.start[0]) / (d.finishX - d.start[0]), 0, 1);
      this.setState('fail');
      this.overlay.show('fail', { failReason: sim.failReason ?? 'cargo', progress, eggs }, ui);
    }
    this.input2.reset();
    this.audio?.stopEngine();
    this.audio?.setMenuMode(true);
    this.publishUi();
  }

  // ------------------------------------------------------------------ layout

  /** Recompute camera size and rebuild the HUD / overlay. Never restarts the run; sim state is untouched. */
  private layout(): void {
    const { pxW, pxH } = viewMetrics();
    this.cameras.main.setSize(pxW, pxH);
    this.uiCam.setSize(pxW, pxH);
    this.uiCam.setZoom(1);
    this.uiCam.setScroll(0, 0);
    const ui = uiMetrics();
    const d = this.sim.level.data;
    this.hud.build(ui, { levelNumber: levelNumber(this.levelId), cargoCount: d.cargoCount }, !this.hintDone);
    this.overlay.layout(ui);
    this.publishUi();
    this.camSnap = true;
  }

  private publishUi(): void {
    const wc = window.__WC__;
    wc.hud = this.hud.bounds;
    wc.overlay = this.overlay.bounds;
    wc.buttons = this.overlay.buttons.map((b) => b.rect);
  }

  // ------------------------------------------------------------------ per frame

  private snapshot(): Snap {
    const b = this.sim.bodies;
    return { chassis: b.chassis, wheels: b.wheels, eggs: this.sim.cargoState() };
  }

  private eggStates(cs: CargoUnitState[]): EggState[] {
    return cs.map((c) => (c.status === 'lost' ? 'gone' : c.status === 'broken' || c.hp < c.maxHp ? 'cracked' : 'ok'));
  }

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'cargoBreak') this.addSplat(e.x);
      else if (e.type === 'finish') this.finishTime = e.timeSec;
    }
    this.audio?.onEvents(events);
  }

  private addSplat(x: number): void {
    const lvl = this.sim.level;
    if (lvl.isGap(x)) return;
    const y = lvl.groundHeightAt(x);
    this.splats.push(
      this.addWorld(
        this.add
          .image(x * PPM, -y * PPM, 'atlas', 'egg-splat')
          .setOrigin(0.5, 0.91)
          .setDisplaySize(SPLAT_SIZE[0] * PPM, SPLAT_SIZE[1] * PPM)
          .setDepth(5),
      ),
    );
  }

  private updateSprites(a: Snap, b: Snap, alpha = 1): void {
    const at = (p: Pose, q: Pose, img: Phaser.GameObjects.Image): Pose => {
      const r = lerpPose(p, q, alpha);
      img.setPosition(r.x * PPM, -r.y * PPM).setRotation(-r.angle);
      return r;
    };
    at(a.chassis, b.chassis, this.bodyImg);
    at(a.wheels[0], b.wheels[0], this.wheelImgs[0]!);
    at(a.wheels[1], b.wheels[1], this.wheelImgs[1]!);
    b.eggs.forEach((e, i) => {
      const img = this.eggImgs[i]!;
      const visible = e.status === 'ok';
      img.setVisible(visible);
      if (!visible) return;
      const r = lerpPose(a.eggs[i]!, e, alpha);
      img.setPosition(r.x * PPM, -r.y * PPM).setRotation(-r.angle);
      img.setFrame(e.hp < e.maxHp ? 'egg-cracked' : 'egg');
    });
  }

  /** Spring camera + velocity look-ahead + speed zoom (GDD §6). snap = jump, no smoothing. */
  private followVehicle(dt: number, p: Pose): void {
    const cam = this.cameras.main;
    const { cssW, cssH, dpr } = viewMetrics();
    const a = anchor(cssW, cssH);
    const spec = this.sim.vehicleSpec;
    const top = spec.motorSpeed * spec.wheelRadius;
    const speed = this.sim.telemetry().speed;
    const target = clamp(speed / top, 0, 1);
    this.look = this.camSnap ? target : this.look + (target - this.look) * (1 - Math.exp(-Math.min(dt, 0.1) / LOOK_TAU));
    const bz = baseZoom(cssW, cssH) * (1 - SPEED_ZOOM * this.look);
    this.rig.update(
      dt,
      {
        vehicleX: p.x,
        vehicleY: p.y,
        groundY: this.sim.level.groundHeightAt(p.x),
        viewW: cssW,
        viewH: cssH,
        baseZoom: bz,
        anchorX: a.x - LOOK_AHEAD * this.look,
        anchorY: a.y,
        margin: 0.12,
      },
      this.camSnap,
    );
    this.camSnap = false;
    cam.setZoom((bz * this.rig.zoomMul * dpr) / PPM);
    // the view centre in world px is scroll + size / 2 (zoom is about the camera midpoint)
    cam.setScroll(this.rig.x * PPM - cam.width / 2, -this.rig.y * PPM - cam.height / 2);
    const halfW = cam.width / cam.zoom / PPM / 2;
    const halfH = cam.height / cam.zoom / PPM / 2;
    this.parallax.draw(cam.width / 2, cam.height / 2, this.rig.x, this.rig.y, halfW, halfH);
    window.__WC__.view = { top: this.rig.y + halfH, bottom: this.rig.y - halfH };
  }

  override update(time: number, delta: number): void {
    const wc = window.__WC__;
    const dt = delta / 1000;

    if (this.state === 'play' && !this.paused) {
      const stepped = this.stepper.advance(dt, () => {
        this.prev = this.curr;
        this.curr = this.snapshot();
      });
      wc.simSteps += stepped;
      this.handleEvents(this.sim.drainEvents());
      if (this.sim.status !== 'running') {
        this.endTimer += dt;
        if (this.endTimer >= (this.sim.status === 'finished' ? COMPLETE_DELAY : FAIL_DELAY)) this.showResult();
      } else if (wc.held && !this.hintDone) {
        // first hold: the hint fades out and never comes back this session
        this.hintAlpha = Math.max(0, this.hintAlpha - HINT_FADE_PER_S * dt);
        this.hud.setHintAlpha(this.hintAlpha);
        if (this.hintAlpha <= 0) this.hintDone = true;
      }
      if (this.state === 'play') this.audio?.update(this.sim.telemetry(), dt);
    }

    const alpha = this.stepper.alpha;
    this.updateSprites(this.prev, this.curr, alpha);
    const p = lerpPose(this.prev.chassis, this.curr.chassis, alpha);
    this.followVehicle(dt, p);

    const c = this.curr;
    this.hud.update(
      clamp((c.chassis.x - this.sim.level.data.start[0]) / (this.sim.level.data.finishX - this.sim.level.data.start[0]), 0, 1),
      this.eggStates(c.eggs),
    );
    wc.vehicleX = c.chassis.x;
    wc.vehicleY = c.chassis.y;
    wc.cargoLeft = this.sim.intactCount();

    if (this.camLogOn) {
      const cam = this.cameras.main;
      const log = (wc.camLog ??= []);
      if (log.length < 4000) {
        log.push({ t: time, sx: cam.scrollX / PPM, sy: cam.scrollY / PPM, zoom: cam.zoom, vehicleY: p.y, ty: this.rig.targetY, steps: wc.simSteps });
      }
    }

    if (this.firstFrame) {
      this.firstFrame = false;
      wc.ready = true;
      getPlatform().gameReady();
    }
  }
}
