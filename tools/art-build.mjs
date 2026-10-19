// Rasterize art/src/*.svg at @2x, then shelf-pack into public/atlas/atlas.png + atlas.json (Phaser JSON hash).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const SRC = 'art/src';
const OUT = 'public/atlas';
const SCALE = 3;
const PAD = 2;
const MAX = 2048;

const files = readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort();
const sprites = files.map((f) => {
  const png = new Resvg(readFileSync(join(SRC, f)), { fitTo: { mode: 'zoom', value: SCALE } }).render();
  return { name: basename(f, '.svg'), w: png.width, h: png.height, buf: png.asPng() };
});

// Shelf packer: tallest first, fill rows left to right.
const order = [...sprites].sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
let x = PAD, y = PAD, rowH = 0, usedW = 0;
for (const s of order) {
  if (x + s.w + PAD > MAX) { x = PAD; y += rowH + PAD; rowH = 0; }
  s.x = x; s.y = y;
  x += s.w + PAD; rowH = Math.max(rowH, s.h); usedW = Math.max(usedW, x);
}
const usedH = y + rowH + PAD;
const pot = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
const W = pot(Math.max(usedW, 4)), H = pot(Math.max(usedH, 4));
if (W > MAX || H > MAX) throw new Error(`atlas ${W}x${H} exceeds ${MAX}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(order.map((s) => ({ input: s.buf, left: s.x, top: s.y })))
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'atlas.png'));

const frames = {};
for (const s of sprites) {
  frames[s.name] = {
    frame: { x: s.x, y: s.y, w: s.w, h: s.h },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: s.w, h: s.h },
    sourceSize: { w: s.w, h: s.h },
  };
}
writeFileSync(join(OUT, 'atlas.json'), JSON.stringify({
  frames,
  meta: { app: 'wobbly-cargo art-build', image: 'atlas.png', format: 'RGBA8888', size: { w: W, h: H }, scale: String(SCALE) },
}, null, 2) + '\n');
console.log(`atlas ${W}x${H}, ${sprites.length} sprite(s)`);
