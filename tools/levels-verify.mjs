// Level check (run via tsx so it can import the TypeScript sim):
//   1. validates every src/levels/*.json against the GDD §7 schema;
//   2. drives each level headless with the bot policy below and reports the result.
// Exit code 1 if a schema check fails, any non-test level gets < 2 stars, or test-01 gets < 2.
//
// Bot policy (simple, deterministic):
//   on the ground: hold while forward speed < BOT_MAX_SPEED, else release (coast/brake);
//   in the air:    hold while the nose is below BOT_AIR_NOSE_UP (hold rotates nose up),
//                  release once above it (release rotates nose forward) -> lands roughly level.
// Capped at BOT_MAX_TIME seconds of sim time.
//
// Flags: --skip-test  skip levels whose id starts with "test-".
//        --verbose    print every non-impact event.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameSim } from '../src/sim/game.ts';

const BOT_MAX_SPEED = 7; // m/s
const BOT_AIR_NOSE_UP = 0.2; // rad
const BOT_MAX_TIME = 120; // s

const DIR = 'src/levels';
const args = new Set(process.argv.slice(2));
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const errors = [];
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

function validate(f, l) {
  const bad = (m) => errors.push(`${f}: ${m}`);
  if (typeof l.id !== 'string' || `${l.id}.json` !== f) bad('id must match file name');
  if (typeof l.world !== 'string') bad('world must be a string');
  // terrain: [x,y] points, `null` separates chains (gaps); x strictly increases throughout.
  const pts = Array.isArray(l.terrain) ? l.terrain.filter((p) => p !== null) : [];
  if (!Array.isArray(l.terrain) || pts.length < 2 || !pts.every(isPt)) bad('terrain must be >= 2 [x,y] points (null = gap)');
  else if (pts.some((p, i) => i && p[0] <= pts[i - 1][0])) bad('terrain x must strictly increase');
  else {
    let run = 0;
    for (const p of [...l.terrain, null]) {
      if (p !== null) run++;
      else {
        if (run === 1) bad('each terrain chain needs >= 2 points');
        run = 0;
      }
    }
  }
  if (!isPt(l.start)) bad('start must be [x,y]');
  if (!Number.isFinite(l.finishX)) bad('finishX must be a number');
  if (typeof l.cargo !== 'string') bad('cargo must be a string');
  if (!Number.isInteger(l.cargoCount) || l.cargoCount < 1) bad('cargoCount must be an integer >= 1');
  if (!Array.isArray(l.coins) || !l.coins.every(isPt)) bad('coins must be [x,y] points');
  if (!Array.isArray(l.props) || !l.props.every((p) => ['ramp', 'bump', 'platform'].includes(p?.type) && Number.isFinite(p.x))) bad('props must have type ramp|bump|platform and numeric x');
  if (!(l.parTimeSec > 0)) bad('parTimeSec must be > 0');
}

function normAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The documented bot policy: one decision per fixed step. */
export function botHold(t) {
  if (t.airborne) return normAngle(t.angle) < BOT_AIR_NOSE_UP;
  return t.speed < BOT_MAX_SPEED;
}

function run(level) {
  const sim = new GameSim(level);
  const log = [];
  while (sim.status === 'running' && sim.time < BOT_MAX_TIME) {
    sim.step({ hold: botHold(sim.telemetry()) });
    for (const e of sim.drainEvents()) {
      if (e.type !== 'impact' && e.type !== 'land') log.push(`  ${sim.time.toFixed(2)}s ${JSON.stringify(e)}`);
    }
  }
  return { sim, log };
}

const results = [];
for (const f of files) {
  let l;
  try {
    l = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  } catch {
    errors.push(`${f}: invalid JSON`);
    continue;
  }
  const before = errors.length;
  validate(f, l);
  if (errors.length > before) continue;
  const isTest = l.id.startsWith('test-');
  if (isTest && args.has('--skip-test')) continue;
  const { sim, log } = run(l);
  const finished = sim.status === 'finished';
  const reason = sim.status === 'failed' ? sim.failReason : sim.status === 'running' ? 'timeout' : '-';
  const required = !isTest || l.id === 'test-01';
  const ok = finished && sim.stars >= 2;
  results.push({ id: l.id, finished, stars: finished ? sim.stars : 0, time: sim.time, reason, required, ok });
  if (args.has('--verbose')) console.log(`${l.id}\n${log.join('\n')}`);
  if (required && !ok) errors.push(`${l.id}: bot got ${finished ? sim.stars : 0} stars (${reason}), needs >= 2`);
}

console.log(`bot policy: ground hold while speed < ${BOT_MAX_SPEED} m/s; air hold while nose < ${BOT_AIR_NOSE_UP} rad; cap ${BOT_MAX_TIME} s`);
console.log('level        finished  stars  time     fail');
for (const r of results) {
  console.log(
    `${r.id.padEnd(12)} ${(r.finished ? 'yes' : 'no').padEnd(9)} ${String(r.stars).padEnd(6)} ${r.time.toFixed(1).padStart(6)}s  ${r.reason}${r.required ? '' : '  (not required)'}`,
  );
}
console.log(`${files.length} levels`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
