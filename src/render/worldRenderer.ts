// Draws the static level (terrain, props, coins) and the parallax backdrop in code (GDD section 6).
// World art is in px at PPM px/m with y down; sim y is up. Strokes are in world px so they scale with the
// sprites (4 px = the art outline at 40 px/m).
import Phaser from 'phaser';
import type { LevelGeometry, Pt } from '../sim/level';
import { PPM } from '../sim/constants';

export const INK = 0x1e1b2e;
export const DIRT = 0x9b6a3e;
export const GRASS = 0x6bbf59;
export const SKYLINE = 0xc3e6f7;
export const SKYLINE_WINDOW = 0xd9eefa;
export const HILLS = 0xa6db8c;
export const COIN = 0xffc93c;
export const SKY_CSS = '#9ED8F5';

const OUTLINE = 4;
const DEEP = 100; // m below the lowest terrain point
const END_EXTEND = 60; // m of flat ground past each end of the level

const px = (m: number): number => m * PPM;
const py = (m: number): number => -m * PPM;

/** Dirt under `top` down to `bottom(i)`, grass band along the top, ink outline over top + side edges. */
function drawSolid(
  g: Phaser.GameObjects.Graphics,
  top: Pt[],
  bottom: (i: number) => number,
  grassDepth: number,
): void {
  const n = top.length;
  g.fillStyle(DIRT, 1);
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = top[i]!;
    const [x1, y1] = top[i + 1]!;
    g.fillTriangle(px(x0), py(y0), px(x1), py(y1), px(x1), py(bottom(i + 1)));
    g.fillTriangle(px(x0), py(y0), px(x1), py(bottom(i + 1)), px(x0), py(bottom(i)));
  }
  g.fillStyle(GRASS, 1);
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = top[i]!;
    const [x1, y1] = top[i + 1]!;
    const b0 = Math.max(y0 - grassDepth, bottom(i));
    const b1 = Math.max(y1 - grassDepth, bottom(i + 1));
    g.fillTriangle(px(x0), py(y0), px(x1), py(y1), px(x1), py(b1));
    g.fillTriangle(px(x0), py(y0), px(x1), py(b1), px(x0), py(b0));
  }
  const line: { x: number; y: number }[] = [{ x: px(top[0]![0]), y: py(bottom(0)) }];
  for (const [x, y] of top) line.push({ x: px(x), y: py(y) });
  line.push({ x: px(top[n - 1]![0]), y: py(bottom(n - 1)) });
  g.lineStyle(OUTLINE, INK, 1);
  g.strokePoints(line as Phaser.Math.Vector2[], false);
  // round the joins: a dot on every vertex of the surface
  g.fillStyle(INK, 1);
  for (const [x, y] of top) g.fillCircle(px(x), py(y), OUTLINE / 2);
}

/** Terrain, props and coins as static Graphics. Gaps between chains stay empty. */
export function drawLevel(scene: Phaser.Scene, level: LevelGeometry, coins: Pt[]): Phaser.GameObjects.Graphics[] {
  const bottom = level.minY - DEEP;
  const terrain = scene.add.graphics().setDepth(0);
  const chains = level.chains;
  chains.forEach((c, ci) => {
    let pts: Pt[] = c;
    if (ci === 0) pts = [[c[0]![0] - END_EXTEND, c[0]![1]], ...pts];
    if (ci === chains.length - 1) {
      const last = c[c.length - 1]!;
      pts = [...pts, [last[0] + END_EXTEND, last[1]]];
    }
    drawSolid(terrain, pts, () => bottom, 0.5);
  });

  const props = scene.add.graphics().setDepth(1);
  for (const p of level.props) {
    const pts = p.points;
    if (p.type === 'bump') {
      drawSolid(props, pts, (i) => level.terrainHeightAt(pts[i]![0]) - 0.4, 0.25);
    } else if (p.type === 'ramp') {
      // [x0, g0-sink] [x1, g1-sink] [x1, g1+h] [x0, g0]
      drawSolid(props, [pts[3]!, pts[2]!], (i) => (i === 0 ? pts[0]![1] : pts[1]![1]), 0.35);
    } else {
      drawSolid(props, [pts[3]!, pts[2]!], () => pts[0]![1], 0.18);
    }
  }

  const coinGfx = scene.add.graphics().setDepth(2);
  for (const [x, y] of coins) {
    coinGfx.fillStyle(COIN, 1);
    coinGfx.fillCircle(px(x), py(y), 0.25 * PPM);
    coinGfx.lineStyle(3, INK, 1);
    coinGfx.strokeCircle(px(x), py(y), 0.25 * PPM);
  }
  return [terrain, props, coinGfx];
}

function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const SKY_FACTOR = 0.2;
const HILL_FACTOR = 0.45;
const SKY_PITCH = 3.4; // m per building cell
const HILL_STEP = 0.6; // m per hill sample

function hillHeight(x: number): number {
  return 1.3 + 0.7 * Math.sin(x * 0.23) + 0.45 * Math.sin(x * 0.61 + 1.7) + 0.2 * Math.sin(x * 1.3 + 0.4);
}

/**
 * Skyline (x0.2) and far hills (x0.45), redrawn each frame in screen-centred metres. The Graphics has
 * scrollFactor 0 and sits at the camera midpoint, so local px = metres from the view centre x PPM and the
 * camera zoom scales it exactly like the world. Layers tile by hashing cell indices, so they never end.
 */
export class Parallax {
  readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(-10);
  }

  /** camX/camY: view centre (m). halfW/halfH: half the visible size (m). */
  draw(midX: number, midY: number, camX: number, camY: number, halfW: number, halfH: number): void {
    const g = this.gfx;
    g.setPosition(midX, midY);
    g.clear();
    const bottomM = -halfH - 3;

    // skyline
    const sx = SKY_FACTOR * camX;
    const sy = -SKY_FACTOR * camY;
    const first = Math.floor((sx - halfW) / SKY_PITCH) - 1;
    const last = Math.ceil((sx + halfW) / SKY_PITCH) + 1;
    for (let i = first; i <= last; i++) {
      const h = 2 + 4.5 * hash(i);
      const x0 = i * SKY_PITCH - sx;
      g.fillStyle(SKYLINE, 1);
      g.fillRect(px(x0), py(sy + h), px(SKY_PITCH + 0.02), px(sy + h - bottomM));
      g.fillStyle(SKYLINE_WINDOW, 1);
      const rows = Math.floor((h - 0.8) / 1.5);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          if (hash(i * 7 + r * 3 + c) < 0.35) continue;
          g.fillRect(px(x0 + 0.7 + c * 1.2), py(sy + h - 0.6 - r * 1.5), px(0.5), px(0.6));
        }
      }
    }

    // far hills
    const hx = HILL_FACTOR * camX;
    const hy = -HILL_FACTOR * camY;
    const hFirst = Math.floor((hx - halfW) / HILL_STEP) - 1;
    const hLast = Math.ceil((hx + halfW) / HILL_STEP) + 1;
    g.fillStyle(HILLS, 1);
    for (let i = hFirst; i < hLast; i++) {
      const xa = i * HILL_STEP;
      const xb = xa + HILL_STEP;
      const ya = hy + hillHeight(xa);
      const yb = hy + hillHeight(xb);
      g.fillTriangle(px(xa - hx), py(ya), px(xb - hx), py(yb), px(xb - hx), py(bottomM));
      g.fillTriangle(px(xa - hx), py(ya), px(xb - hx), py(bottomM), px(xa - hx), py(bottomM));
    }
  }
}
