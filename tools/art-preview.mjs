// Contact sheet of every sprite on a light background with labels -> art/preview/preview.png
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const SRC = 'art/src';
const files = readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort();
const CELL = 220, LABEL = 30, COLS = 4;
const rows = Math.max(1, Math.ceil(files.length / COLS));
const W = COLS * CELL, H = rows * (CELL + LABEL);
let body = '';
files.forEach((f, i) => {
  const name = basename(f, '.svg');
  const png = new Resvg(readFileSync(join(SRC, f)), { fitTo: { mode: 'zoom', value: 2 } }).render();
  const k = Math.min(1, (CELL - 40) / png.width, (CELL - 40) / png.height);
  const w = png.width * k, h = png.height * k;
  const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * (CELL + LABEL);
  body += `<rect x="${cx + 8}" y="${cy + 8}" width="${CELL - 16}" height="${CELL + LABEL - 16}" rx="8" fill="#fff" stroke="#c9c5d6"/>`;
  body += `<image x="${cx + (CELL - w) / 2}" y="${cy + 14 + (CELL - 40 - h) / 2}" width="${w}" height="${h}" href="data:image/png;base64,${png.asPng().toString('base64')}"/>`;
  body += `<text x="${cx + CELL / 2}" y="${cy + CELL + 4}" font-family="sans-serif" font-size="16" font-weight="700" fill="#1E1B2E" text-anchor="middle">${name} ${png.width / 2}x${png.height / 2}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#EEF3F8"/>${body}</svg>`;
mkdirSync('art/preview', { recursive: true });
writeFileSync('art/preview/preview.png', new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
console.log(`art/preview/preview.png (${files.length} sprites)`);
