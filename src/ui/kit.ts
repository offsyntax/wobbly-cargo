// Small UI toolkit for the Phaser HUD / overlays: metrics, layer bookkeeping, rounded panels, text.
// Everything is positioned in backing px (css px x dpr); hit rects are reported in css px.
import Phaser from 'phaser';
import { safeInsets, viewMetrics, type Insets } from '../render/view';

export const C = {
  ink: 0x1e1b2e,
  inkSoft: 0x4a4560,
  white: 0xffffff,
  cream: 0xf2eee6,
  grey: 0xe1dfea,
  yellow: 0xffc93c,
  green: 0x4cc26b,
  blue: 0x4fb3ff,
  danger: '#D7372E',
  inkCss: '#1E1B2E',
  inkSoftCss: '#4A4560',
  whiteCss: '#FFFFFF',
} as const;

export const FONT_HEAD = "'Lilita One', 'Arial Black', sans-serif";
export const FONT_BODY = "Nunito, system-ui, sans-serif";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UiMetrics {
  /** Backing-store size (px). */
  w: number;
  h: number;
  dpr: number;
  /** Backing px per design unit: min(w, h) / 390, clamped to 1..1.6 css px, times dpr. */
  s: number;
  /** Safe-area insets in backing px. */
  inset: Insets;
  /** Side-by-side layouts when the view is wider than tall. */
  landscape: boolean;
}

export function uiMetrics(): UiMetrics {
  const v = viewMetrics();
  const ins = safeInsets();
  const k = Math.min(1.6, Math.max(1, Math.min(v.cssW, v.cssH) / 390));
  return {
    w: v.pxW,
    h: v.pxH,
    dpr: v.dpr,
    s: k * v.dpr,
    inset: { top: ins.top * v.dpr, right: ins.right * v.dpr, bottom: ins.bottom * v.dpr, left: ins.left * v.dpr },
    landscape: v.cssW > v.cssH * 1.05,
  };
}

/** Backing px rect -> css px rect. */
export function toCss(r: Rect, m: UiMetrics): Rect {
  return { x: r.x / m.dpr, y: r.y / m.dpr, w: r.w / m.dpr, h: r.h / m.dpr };
}

export function union(rs: Rect[]): Rect {
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Tracks the objects of one UI group so they can be rebuilt (layout) or destroyed together. */
export class UiLayer {
  private objs: Phaser.GameObjects.GameObject[] = [];
  constructor(
    readonly scene: Phaser.Scene,
    private readonly main: Phaser.Cameras.Scene2D.Camera,
    private readonly depth: number,
  ) {}

  add<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(o: T): T {
    this.objs.push(o);
    this.main.ignore(o); // drawn by the UI camera only
    o.setDepth(this.depth);
    return o;
  }

  /** Destroy one object (e.g. a text used only for measuring). */
  discard(o: Phaser.GameObjects.GameObject): void {
    const i = this.objs.indexOf(o);
    if (i >= 0) this.objs.splice(i, 1);
    o.destroy();
  }

  clear(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  setVisible(v: boolean): void {
    for (const o of this.objs) (o as Phaser.GameObjects.GameObject & { setVisible(v: boolean): void }).setVisible(v);
  }
}

export interface PanelStyle {
  fill: number;
  radius: number;
  /** Ink outline width (px). */
  stroke: number;
  /** Ink drop shadow offset (px, straight down). 0 = none. */
  shadow: number;
}

/** Rounded rect with ink outline and a solid ink drop shadow (the reference look). */
export function panel(layer: UiLayer, r: Rect, st: PanelStyle): Phaser.GameObjects.Graphics {
  const g = layer.scene.add.graphics();
  if (st.shadow > 0) {
    g.fillStyle(C.ink, 1);
    g.fillRoundedRect(r.x, r.y + st.shadow, r.w, r.h, st.radius);
  }
  g.fillStyle(st.fill, 1);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, st.radius);
  g.lineStyle(st.stroke, C.ink, 1);
  g.strokeRoundedRect(r.x, r.y, r.w, r.h, st.radius);
  return layer.add(g);
}

export interface TextOpts {
  family?: string;
  color?: string;
  weight?: string;
  stroke?: string;
  strokeW?: number;
  originX?: number;
  originY?: number;
  /** Shrink the font until the text is at most this wide (px). */
  maxW?: number;
}

export function label(layer: UiLayer, x: number, y: number, str: string, size: number, o: TextOpts = {}): Phaser.GameObjects.Text {
  const family = o.family ?? FONT_HEAD;
  const make = (sz: number): Phaser.GameObjects.Text =>
    layer.scene.add.text(x, y, str, {
      fontFamily: family,
      fontSize: `${Math.round(sz)}px`,
      fontStyle: o.weight ?? '',
      color: o.color ?? C.inkCss,
      stroke: o.stroke,
      strokeThickness: o.strokeW ?? 0,
      padding: { top: Math.round(size * 0.12), bottom: Math.round(size * 0.12), left: 2, right: 2 },
    });
  let t = make(size);
  if (o.maxW && t.width > o.maxW) {
    const sz = Math.max(8, Math.floor((size * o.maxW) / t.width));
    t.destroy();
    t = make(sz);
  }
  t.setOrigin(o.originX ?? 0.5, o.originY ?? 0.5);
  return layer.add(t);
}

/** Five-pointed star centred at (cx, cy) with outer radius R. */
export function star(layer: UiLayer, cx: number, cy: number, R: number, filled: boolean, strokeW: number): Phaser.GameObjects.Graphics {
  const g = layer.scene.add.graphics();
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? R : R * 0.46;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  g.fillStyle(filled ? C.yellow : C.grey, 1);
  for (let i = 0; i < 10; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % 10]!;
    g.fillTriangle(cx, cy, a.x, a.y, b.x, b.y);
  }
  g.lineStyle(strokeW, C.ink, 1);
  g.strokePoints(pts as Phaser.Math.Vector2[], true);
  return layer.add(g);
}

export type EggState = 'ok' | 'cracked' | 'gone';

/** Egg icon from the atlas, `h` px tall. */
export function eggIcon(layer: UiLayer, cx: number, cy: number, h: number, state: EggState): Phaser.GameObjects.Image {
  const img = layer.scene.add.image(cx, cy, 'atlas', state === 'ok' ? 'egg' : 'egg-cracked');
  img.setDisplaySize((h * 44) / 52, h);
  if (state === 'gone') img.setTint(0x8f8aa3).setAlpha(0.55);
  return layer.add(img);
}

export function setEggIcon(img: Phaser.GameObjects.Image, state: EggState): void {
  img.setFrame(state === 'ok' ? 'egg' : 'egg-cracked');
  if (state === 'gone') img.setTint(0x8f8aa3).setAlpha(0.55);
  else img.clearTint().setAlpha(1);
}
