// In-game HUD on the UI camera: pause button, level pill, progress bar + flag, cargo meter, first-time hint.
import Phaser from 'phaser';
import { S, fmt } from '../i18n';
import {
  C,
  FONT_BODY,
  eggIcon,
  label,
  panel,
  setEggIcon,
  toCss,
  union,
  UiLayer,
  type EggState,
  type Rect,
  type UiMetrics,
} from './kit';

export interface HudInfo {
  levelNumber: number;
  cargoCount: number;
}

export class Hud {
  private readonly layer: UiLayer;
  private hintObjs: Phaser.GameObjects.GameObject[] = [];
  private eggs: Phaser.GameObjects.Image[] = [];
  private eggStates: EggState[] = [];
  private barFill: Phaser.GameObjects.Graphics | null = null;
  private bar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private progress = -1;
  private hintAlpha = 1;
  /** Pause button (css px, at least 44 x 44). */
  pauseRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Union of all HUD pieces (css px), for tests. */
  bounds: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: Phaser.Scene, main: Phaser.Cameras.Scene2D.Camera) {
    this.layer = new UiLayer(scene, main, 100);
  }

  /** (Re)build for the current size. Never touches game state. */
  build(m: UiMetrics, info: HudInfo, showHint: boolean): void {
    const L = this.layer;
    L.clear();
    this.hintObjs = [];
    this.eggs = [];
    this.eggStates = [];
    this.barFill = null;
    this.progress = -1;
    const u = m.s;
    const pad = 16 * u;
    const left = m.inset.left + pad;
    const right = m.w - m.inset.right - pad;
    const top = m.inset.top + pad;
    const rects: Rect[] = [];

    // pause button
    const pb: Rect = { x: left, y: top, w: 48 * u, h: 48 * u };
    panel(L, pb, { fill: C.white, radius: 12 * u, stroke: 3 * u, shadow: 4 * u });
    const bars = L.scene.add.graphics();
    bars.fillStyle(C.ink, 1);
    for (const dx of [-7, 3]) bars.fillRoundedRect(pb.x + pb.w / 2 + dx * u, pb.y + pb.h / 2 - 10 * u, 4 * u, 20 * u, 1.5 * u);
    L.add(bars);
    rects.push(pb);
    this.pauseRect = toCss(pb, m);

    // level pill (top centre)
    const text = fmt(S.hud.level, { n: info.levelNumber });
    const probe = label(L, 0, 0, text, 24 * u);
    const tw = probe.width;
    L.discard(probe);
    const pw = Math.max(120 * u, tw + 44 * u);
    const pill: Rect = { x: m.w / 2 - pw / 2, y: top + 2 * u, w: pw, h: 44 * u };
    panel(L, pill, { fill: C.yellow, radius: 22 * u, stroke: 3 * u, shadow: 4 * u });
    label(L, m.w / 2, pill.y + pill.h / 2, text, 24 * u);
    rects.push(pill);

    // progress bar + flag
    const rowY = top + 48 * u + 14 * u;
    const flagH = 34 * u;
    const flagW = (flagH * 58) / 106;
    const avail = right - left;
    const barW = Math.min(avail - flagW - 10 * u, 440 * u);
    const total = barW + 10 * u + flagW;
    const bx = m.w / 2 - total / 2;
    this.bar = { x: bx, y: rowY, w: barW, h: 20 * u };
    panel(L, this.bar, { fill: C.white, radius: 10 * u, stroke: 3 * u, shadow: 0 });
    this.barFill = L.add(L.scene.add.graphics());
    const flag = L.scene.add.image(bx + barW + 10 * u, rowY + 10 * u + flagH * 0.18, 'atlas', 'flag');
    flag.setDisplaySize(flagW, flagH).setOrigin(0, 0.5);
    L.add(flag);
    rects.push({ x: bx, y: rowY, w: total, h: Math.max(20 * u, flagH * 1.0) });

    // cargo meter: left under the bar in portrait, top-right in landscape
    const cText = S.hud.cargo;
    const cProbe = label(L, 0, 0, cText, 16 * u);
    const ctw = cProbe.width;
    L.discard(cProbe);
    const eggH = 24 * u;
    const eggGap = 28 * u;
    const cw = 14 * u + ctw + 10 * u + info.cargoCount * eggGap + 6 * u;
    const ch = 40 * u;
    const cx = m.landscape ? right - cw : left;
    const cy = m.landscape ? top + 4 * u : rowY + 20 * u + 14 * u;
    panel(L, { x: cx, y: cy, w: cw, h: ch }, { fill: C.white, radius: 14 * u, stroke: 3 * u, shadow: 4 * u });
    label(L, cx + 14 * u + ctw / 2, cy + ch / 2, cText, 16 * u, { color: C.inkSoftCss });
    for (let i = 0; i < info.cargoCount; i++) {
      const ex = cx + 14 * u + ctw + 10 * u + eggGap * (i + 0.5);
      this.eggs.push(eggIcon(L, ex, cy + ch / 2, eggH, 'ok'));
      this.eggStates.push('ok');
    }
    rects.push({ x: cx, y: cy, w: cw, h: ch + 4 * u });

    // first-time hint, bottom middle: never over the vehicle (it drives at ~32% x, 55-62% y)
    if (showHint) {
      const pillH = 34 * u;
      const sub = S.hud.orSpace;
      const sp = label(L, 0, 0, sub, 16 * u, { family: FONT_BODY, weight: '800' });
      const spw = sp.width + 32 * u;
      L.discard(sp);
      const pyy = m.h - m.inset.bottom - 24 * u - pillH;
      const hp: Rect = { x: m.w / 2 - spw / 2, y: pyy, w: spw, h: pillH };
      const bg = panel(L, hp, { fill: C.cream, radius: pillH / 2, stroke: 3 * u, shadow: 0 });
      const st = label(L, m.w / 2, pyy + pillH / 2, sub, 16 * u, { family: FONT_BODY, weight: '800', color: C.inkSoftCss });
      const title = label(L, m.w / 2, pyy - 10 * u, S.hud.holdToDrive, 44 * u, {
        color: C.whiteCss,
        stroke: C.inkCss,
        strokeW: 8 * u,
        originY: 1,
        maxW: m.w - 2 * pad,
      });
      this.hintObjs = [bg, st, title];
      const tb = title.getBounds();
      rects.push(hp, { x: tb.x, y: tb.y, w: tb.width, h: tb.height });
    }
    this.setHintAlpha(this.hintAlpha);
    this.bounds = toCss(union(rects), m);
  }

  setHintAlpha(a: number): void {
    this.hintAlpha = a;
    for (const o of this.hintObjs) (o as Phaser.GameObjects.GameObject & { setAlpha(a: number): void }).setAlpha(a);
  }

  hasHint(): boolean {
    return this.hintObjs.length > 0;
  }

  /** Per-frame values. */
  update(progress: number, eggs: EggState[]): void {
    const p = Math.min(1, Math.max(0, progress));
    if (this.barFill && Math.abs(p - this.progress) > 0.002) {
      this.progress = p;
      const b = this.bar;
      const g = this.barFill;
      g.clear();
      const w = Math.max(0, (b.w - 6) * p);
      if (w > 0) {
        g.fillStyle(C.blue, 1);
        g.fillRoundedRect(b.x + 3, b.y + 3, Math.max(w, b.h - 6), b.h - 6, (b.h - 6) / 2);
      }
    }
    for (let i = 0; i < this.eggs.length; i++) {
      const st = eggs[i] ?? 'gone';
      if (this.eggStates[i] !== st) {
        this.eggStates[i] = st;
        setEggIcon(this.eggs[i]!, st);
      }
    }
  }

  setVisible(v: boolean): void {
    this.layer.setVisible(v);
  }
}
