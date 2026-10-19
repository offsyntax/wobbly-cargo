// Fail / Complete / Pause overlays on the UI camera. Portrait = one stacked column, landscape = the
// content on the left and the buttons on the right. Rebuilt on every layout (resize); holds no game state.
import Phaser from 'phaser';
import { S, fmt } from '../i18n';
import type { FailReason } from '../sim/types';
import { C, FONT_BODY, eggIcon, label, panel, star, toCss, UiLayer, type EggState, type Rect, type UiMetrics } from './kit';

export type OverlayKind = 'fail' | 'complete' | 'pause';

export interface OverlayData {
  failReason?: FailReason;
  /** 0..1 progress along the level when failing. */
  progress?: number;
  eggs?: EggState[];
  stars?: 0 | 1 | 2 | 3;
  timeSec?: number;
  cargoSafe?: number;
  cargoTotal?: number;
}

export interface OverlayActions {
  retry(): void;
  next(): void;
  resume(): void;
  restart(): void;
}

export interface OverlayButton {
  /** css px. */
  rect: Rect;
  press(): void;
}

type ButtonStyle = 'yellow' | 'green' | 'white';

type Item =
  | { t: 'title'; text: string; color: string; size: number }
  | { t: 'sub'; text: string }
  | { t: 'eggs'; states: EggState[] }
  | { t: 'stars'; n: number }
  | { t: 'row'; label: string; value: string }
  | { t: 'button'; text: string; style: ButtonStyle; press: () => void; h: number }
  | { t: 'gap'; h: number };

const HEIGHT: Record<string, number> = { sub: 24, eggs: 40, stars: 80, row: 40 };
const itemH = (it: Item): number => (it.t === 'title' ? it.size * 1.15 : it.t === 'button' || it.t === 'gap' ? it.h : HEIGHT[it.t]!);
const colH = (col: Item[]): number => col.reduce((a, it) => a + itemH(it), 0);

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export class Overlay {
  private readonly layer: UiLayer;
  private kind: OverlayKind | null = null;
  private m: UiMetrics | null = null;
  private data: OverlayData = {};
  buttons: OverlayButton[] = [];
  /** Card bounds incl. shadow (css px), null while hidden. */
  bounds: Rect | null = null;

  constructor(
    scene: Phaser.Scene,
    main: Phaser.Cameras.Scene2D.Camera,
    private readonly actions: OverlayActions,
  ) {
    this.layer = new UiLayer(scene, main, 200);
  }

  get visible(): boolean {
    return this.kind !== null;
  }

  show(kind: OverlayKind, data: OverlayData, m: UiMetrics): void {
    this.kind = kind;
    this.data = data;
    this.build(m);
  }

  hide(): void {
    this.kind = null;
    this.layer.clear();
    this.buttons = [];
    this.bounds = null;
  }

  /** Rebuild after a resize. */
  layout(m: UiMetrics): void {
    if (this.kind) this.build(m);
  }

  private content(kind: OverlayKind, landscape: boolean): { cols: Item[][]; widths: number[] } {
    const d = this.data;
    const a = this.actions;
    if (kind === 'pause') {
      return {
        cols: [
          [
            { t: 'title', text: S.pause.title, color: C.inkCss, size: 44 },
            { t: 'gap', h: 18 },
            { t: 'button', text: S.pause.resume, style: 'green', press: a.resume, h: 64 },
            { t: 'gap', h: 12 },
            { t: 'button', text: S.pause.restart, style: 'white', press: a.restart, h: 52 },
          ],
        ],
        widths: [280],
      };
    }
    if (kind === 'fail') {
      const reason = d.failReason ?? 'cargo';
      const left: Item[] = [
        { t: 'title', text: S.fail[reason], color: C.danger, size: 46 },
        { t: 'gap', h: 6 },
        { t: 'sub', text: fmt(S.fail.progress, { pct: Math.round((d.progress ?? 0) * 100) }) },
        { t: 'gap', h: 14 },
        { t: 'eggs', states: d.eggs ?? [] },
      ];
      const btn: Item = { t: 'button', text: S.fail.retry, style: 'yellow', press: a.retry, h: 68 };
      return landscape ? { cols: [left, [btn]], widths: [300, 240] } : { cols: [[...left, { t: 'gap', h: 18 }, btn]], widths: [292] };
    }
    const left: Item[] = [
      { t: 'title', text: S.complete.title, color: C.inkCss, size: 40 },
      { t: 'gap', h: 10 },
      { t: 'stars', n: d.stars ?? 0 },
      { t: 'gap', h: 12 },
      { t: 'row', label: S.complete.time, value: formatTime(d.timeSec ?? 0) },
      { t: 'gap', h: 6 },
      { t: 'row', label: S.complete.cargo, value: fmt(S.complete.cargoValue, { n: d.cargoSafe ?? 0, total: d.cargoTotal ?? 0 }) },
    ];
    const next: Item = { t: 'button', text: S.complete.next, style: 'green', press: a.next, h: 68 };
    const retry: Item = { t: 'button', text: S.complete.retry, style: 'white', press: a.retry, h: 52 };
    return landscape
      ? { cols: [left, [next, { t: 'gap', h: 12 }, retry]], widths: [300, 240] }
      : { cols: [[...left, { t: 'gap', h: 18 }, next, { t: 'gap', h: 12 }, retry]], widths: [292] };
  }

  private build(m: UiMetrics): void {
    const kind = this.kind!;
    this.m = m;
    const L = this.layer;
    L.clear();
    this.buttons = [];
    const { cols, widths } = this.content(kind, m.landscape);
    const PAD = 26;
    const GAP = 28;
    const contentW = widths.reduce((a, b) => a + b, 0) + GAP * (cols.length - 1);
    const contentH = Math.max(...cols.map(colH));
    const W = contentW + PAD * 2;
    const H = contentH + PAD * 2;

    const margin = 16 * m.s;
    const availW = m.w - m.inset.left - m.inset.right - 2 * margin;
    const availH = m.h - m.inset.top - m.inset.bottom - 2 * margin;
    const u = m.s * Math.min(1, availW / (W * m.s), availH / (H * m.s));

    // scrim over the game
    const scrim = L.scene.add.graphics();
    scrim.fillStyle(C.ink, 0.5);
    scrim.fillRect(0, 0, m.w, m.h);
    L.add(scrim);

    const card: Rect = {
      x: m.inset.left + (m.w - m.inset.left - m.inset.right) / 2 - (W * u) / 2,
      y: m.inset.top + (m.h - m.inset.top - m.inset.bottom) / 2 - (H * u) / 2 - 4 * u,
      w: W * u,
      h: H * u,
    };
    panel(L, card, { fill: C.white, radius: 28 * u, stroke: 4 * u, shadow: 8 * u });
    this.bounds = toCss({ x: card.x, y: card.y, w: card.w, h: card.h + 8 * u }, m);

    let x = card.x + PAD * u;
    cols.forEach((col, ci) => {
      const w = widths[ci]! * u;
      // columns are centred vertically against the tallest one
      let y = card.y + PAD * u + ((contentH - colH(col)) / 2) * u;
      for (const it of col) {
        this.drawItem(it, x, y, w, u);
        y += itemH(it) * u;
      }
      x += w + GAP * u;
    });
  }

  private drawItem(it: Item, x: number, y: number, w: number, u: number): void {
    const L = this.layer;
    const cx = x + w / 2;
    const h = itemH(it) * u;
    switch (it.t) {
      case 'title':
        label(L, cx, y + h / 2, it.text, it.size * u, { color: it.color, maxW: w });
        break;
      case 'sub':
        label(L, cx, y + h / 2, it.text, 17 * u, { family: FONT_BODY, weight: '800', color: C.inkSoftCss, maxW: w });
        break;
      case 'eggs': {
        const n = it.states.length;
        const step = 48 * u;
        it.states.forEach((st, i) => eggIcon(L, cx + (i - (n - 1) / 2) * step, y + h / 2, 38 * u, st));
        break;
      }
      case 'stars': {
        for (let i = 0; i < 3; i++) {
          const big = i === 1;
          star(L, cx + (i - 1) * 68 * u, y + h / 2 + (big ? -2 : 6) * u, (big ? 34 : 26) * u, i < it.n, 4 * u);
        }
        break;
      }
      case 'row': {
        const r: Rect = { x, y: y + 1 * u, w, h: h - 2 * u };
        const g = L.scene.add.graphics();
        g.fillStyle(0xf2f0f7, 1);
        g.fillRoundedRect(r.x, r.y, r.w, r.h, 14 * u);
        L.add(g);
        label(L, r.x + 14 * u, y + h / 2, it.label, 17 * u, { family: FONT_BODY, weight: '800', originX: 0 });
        label(L, r.x + r.w - 14 * u, y + h / 2, it.value, 17 * u, { family: FONT_BODY, weight: '800', originX: 1 });
        break;
      }
      case 'button': {
        const r: Rect = { x, y, w, h };
        const fill = it.style === 'yellow' ? C.yellow : it.style === 'green' ? C.green : C.white;
        panel(L, r, { fill, radius: 20 * u, stroke: 4 * u, shadow: 6 * u });
        label(L, cx, y + h / 2, it.text, 30 * u, { maxW: w - 24 * u });
        this.buttons.push({ rect: toCss(r, this.m!), press: it.press });
        break;
      }
      case 'gap':
        break;
    }
  }
}
