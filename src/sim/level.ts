// Level loading (GDD §7 schema) → static planck bodies + a height query for camera/telemetry.
//
// Terrain: `terrain` is a list of [x, y] points with strictly increasing x. A `null` entry splits
// the terrain into separate chains; the open space between two chains is a gap (a pit you can
// fall into). Example: [[0,0],[20,0],null,[24,0],[60,0]] has a 4 m gap from x 20 to 24.
//
// Smoothing: each chain is a Catmull-Rom spline of y over x (cubic Hermite, tangents
// (y[i+1]−y[i−1]) / (x[i+1]−x[i−1]), one-sided at the ends), sampled TERRAIN_SAMPLES_PER_SEGMENT
// times per segment. x stays monotonic, so the result is a height field.
//
// Props: { type, x, w?, h?, y? } with x = left edge.
//  - ramp:     wedge rising from the ground at x to height h at x+w, vertical drop after it.
//  - bump:     smooth speed bump (half-sine) of width w and height h on the ground.
//  - platform: static slab of width w; top at `y` if given, else ground(x) + h. 0.4 m thick.
import { Chain, Polygon, Vec2, type Body, type World } from 'planck';
import { TERRAIN_SAMPLES_PER_SEGMENT } from './constants';

export type Pt = [number, number];

export interface PropData {
  type: 'ramp' | 'bump' | 'platform';
  x: number;
  w?: number;
  h?: number;
  /** Platform only (optional schema addition): absolute top height. */
  y?: number;
}

export interface LevelData {
  id: string;
  world: string;
  /** [x, y] points; `null` separates chains (gaps). */
  terrain: (Pt | null)[];
  start: Pt;
  finishX: number;
  cargo: string;
  cargoCount: number;
  coins: Pt[];
  props: PropData[];
  parTimeSec: number;
}

export const PROP_DEFAULTS = {
  ramp: { w: 4, h: 1.5 },
  bump: { w: 1.2, h: 0.25 },
  platform: { w: 6, h: 1 },
} as const;

const RAMP_SINK = 0.5; // ramp/bump bodies extend this far below ground to avoid seams
const PLATFORM_THICKNESS = 0.4;
const BUMP_SAMPLES = 10;

/** Split raw terrain into chains of control points. */
export function splitChains(terrain: (Pt | null)[]): Pt[][] {
  const chains: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of terrain) {
    if (p === null) {
      if (cur.length) chains.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) chains.push(cur);
  return chains.filter((c) => c.length >= 2);
}

/** Catmull-Rom (y over x) smoothing with fixed samples per segment. */
export function smoothChain(pts: Pt[], samples = TERRAIN_SAMPLES_PER_SEGMENT): Pt[] {
  const n = pts.length;
  const tangent = (i: number): number => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = x1 - x0;
    const m0 = tangent(i);
    const m1 = tangent(i + 1);
    for (let k = 0; k < samples; k++) {
      const t = k / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const y =
        (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
      out.push([x0 + t * h, y]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

function polylineY(line: Pt[], x: number): number {
  let lo = 0;
  let hi = line.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [ax, ay] = line[lo];
  const [bx, by] = line[hi];
  const t = bx === ax ? 0 : (x - ax) / (bx - ax);
  return ay + (by - ay) * t;
}

/** One static surface for height queries: x range + top height function. */
interface Surface {
  x0: number;
  x1: number;
  top: (x: number) => number;
}

export class LevelGeometry {
  /** Smoothed terrain polylines (world metres), one per chain. */
  readonly chains: Pt[][];
  /** Prop outlines (world metres): closed polygons for ramp/platform, open polyline for bump. */
  readonly props: { type: PropData['type']; points: Pt[] }[] = [];
  readonly minY: number;
  private readonly surfaces: Surface[] = [];

  constructor(readonly data: LevelData) {
    this.chains = splitChains(data.terrain).map((c) => smoothChain(c));
    if (!this.chains.length) throw new Error(`${data.id}: terrain needs >= 2 points`);
    let minY = Infinity;
    for (const c of this.chains) for (const p of c) minY = Math.min(minY, p[1]);
    this.minY = minY;
    for (const p of data.props) this.addProp(p);
  }

  /** Terrain height under x (terrain + props). Gaps interpolate between the chain ends
   *  (camera framing); outside the terrain it clamps to the first/last point. */
  groundHeightAt(x: number): number {
    let y = this.terrainHeightAt(x);
    for (const s of this.surfaces) if (x >= s.x0 && x <= s.x1) y = Math.max(y, s.top(x));
    return y;
  }

  /** True when x is over a gap between chains (or outside the terrain). */
  isGap(x: number): boolean {
    return !this.chains.some((c) => x >= c[0][0] && x <= c[c.length - 1][0]);
  }

  terrainHeightAt(x: number): number {
    const cs = this.chains;
    if (x <= cs[0][0][0]) return cs[0][0][1];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const end = c[c.length - 1];
      if (x <= end[0]) {
        if (x >= c[0][0]) return polylineY(c, x);
        const prev = cs[i - 1][cs[i - 1].length - 1];
        const start = c[0];
        return prev[1] + ((start[1] - prev[1]) * (x - prev[0])) / (start[0] - prev[0]);
      }
    }
    const last = cs[cs.length - 1];
    return last[last.length - 1][1];
  }

  private addProp(p: PropData): void {
    const d = PROP_DEFAULTS[p.type];
    const w = p.w ?? d.w;
    const h = p.h ?? d.h;
    const x0 = p.x;
    const x1 = p.x + w;
    if (p.type === 'ramp') {
      const g0 = this.terrainHeightAt(x0);
      const g1 = this.terrainHeightAt(x1);
      const top = (x: number) => g0 + ((g1 + h - g0) * (x - x0)) / w;
      this.surfaces.push({ x0, x1, top });
      this.props.push({ type: 'ramp', points: [[x0, g0 - RAMP_SINK], [x1, g1 - RAMP_SINK], [x1, g1 + h], [x0, g0]] });
    } else if (p.type === 'bump') {
      const top = (x: number) => this.terrainHeightAt(x) + h * Math.sin((Math.PI * (x - x0)) / w);
      this.surfaces.push({ x0, x1, top });
      const pts: Pt[] = [];
      for (let k = 0; k <= BUMP_SAMPLES; k++) {
        const x = x0 + (w * k) / BUMP_SAMPLES;
        pts.push([x, k === 0 || k === BUMP_SAMPLES ? this.terrainHeightAt(x) - 0.05 : top(x)]);
      }
      this.props.push({ type: 'bump', points: pts });
    } else {
      const yTop = p.y ?? this.terrainHeightAt(x0) + h;
      this.surfaces.push({ x0, x1, top: () => yTop });
      const yb = yTop - PLATFORM_THICKNESS;
      this.props.push({ type: 'platform', points: [[x0, yb], [x1, yb], [x1, yTop], [x0, yTop]] });
    }
  }

  /** Create the static ground body (terrain chains + props). */
  createBodies(world: World, friction: number): Body {
    const ground = world.createBody({ type: 'static' });
    for (const c of this.chains) {
      ground.createFixture(new Chain(c.map(([x, y]) => new Vec2(x, y)), false), { friction });
    }
    for (const p of this.props) {
      const verts = p.points.map(([x, y]) => new Vec2(x, y));
      const shape = p.type === 'bump' ? new Chain(verts, false) : new Polygon(verts);
      ground.createFixture(shape, { friction });
    }
    return ground;
  }
}
