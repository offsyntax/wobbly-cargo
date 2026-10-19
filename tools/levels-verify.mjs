// Validates src/levels/*.json against the GDD section 7 schema.
// TODO(M1): run the headless level bot (simple policy) and require >= 2 stars.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/levels';
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const errors = [];
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

for (const f of files) {
  let l;
  try { l = JSON.parse(readFileSync(join(DIR, f), 'utf8')); } catch { errors.push(`${f}: invalid JSON`); continue; }
  const bad = (m) => errors.push(`${f}: ${m}`);
  if (typeof l.id !== 'string' || `${l.id}.json` !== f) bad('id must match file name');
  if (typeof l.world !== 'string') bad('world must be a string');
  if (!Array.isArray(l.terrain) || l.terrain.length < 2 || !l.terrain.every(isPt)) bad('terrain must be >= 2 [x,y] points');
  else if (l.terrain.some((p, i) => i && p[0] <= l.terrain[i - 1][0])) bad('terrain x must strictly increase');
  if (!isPt(l.start)) bad('start must be [x,y]');
  if (!Number.isFinite(l.finishX)) bad('finishX must be a number');
  if (typeof l.cargo !== 'string') bad('cargo must be a string');
  if (!Number.isInteger(l.cargoCount) || l.cargoCount < 1) bad('cargoCount must be an integer >= 1');
  if (!Array.isArray(l.coins) || !l.coins.every(isPt)) bad('coins must be [x,y] points');
  if (!Array.isArray(l.props) || !l.props.every((p) => ['ramp', 'bump', 'platform'].includes(p?.type) && Number.isFinite(p.x))) bad('props must have type ramp|bump|platform and numeric x');
  if (!(l.parTimeSec > 0)) bad('parTimeSec must be > 0');
}
console.log(`${files.length} levels`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
