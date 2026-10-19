// Level registry: every src/levels/*.json is bundled; ids come from the files.
import type { LevelData } from '../sim/level';

const modules = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const LEVELS = new Map<string, LevelData>();
for (const [path, data] of Object.entries(modules)) {
  const level = data as LevelData;
  LEVELS.set(level.id ?? path, level);
}

/** Campaign order. Test levels (`test-*`) are only reachable through `?level=<id>`. */
const CAMPAIGN = ['city-01', 'city-02', 'city-03'].filter((id) => LEVELS.has(id));

export function hasLevel(id: string): boolean {
  return LEVELS.has(id);
}

export function getLevel(id: string): LevelData {
  const l = LEVELS.get(id);
  if (!l) throw new Error(`unknown level "${id}"`);
  return l;
}

/** city-01 if it exists, otherwise test-01 (or whatever level exists). */
export function defaultLevelId(): string {
  return CAMPAIGN[0] ?? (LEVELS.has('test-01') ? 'test-01' : [...LEVELS.keys()][0]!);
}

/** `?level=<id>` if valid, else the default. */
export function initialLevelId(search = window.location.search): string {
  const id = new URLSearchParams(search).get('level');
  return id && LEVELS.has(id) ? id : defaultLevelId();
}

/** city-01 -> city-02 -> city-03 -> city-01. Test levels continue into the campaign. */
export function nextLevelId(id: string): string {
  const i = CAMPAIGN.indexOf(id);
  if (i < 0) return defaultLevelId();
  return CAMPAIGN[(i + 1) % CAMPAIGN.length]!;
}

/** Number shown in the HUD pill ("LEVEL 3"): trailing digits of the id. */
export function levelNumber(id: string): number {
  const m = /(\d+)$/.exec(id);
  return m ? parseInt(m[1]!, 10) : 1;
}
