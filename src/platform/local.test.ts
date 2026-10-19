import { describe, expect, it } from 'vitest';
import { LocalPlatform, SAVE_KEY, type KV } from './local';

function stub(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('LocalPlatform', () => {
  it('returns null when nothing saved', async () => {
    expect(await new LocalPlatform(stub()).loadSave()).toBeNull();
  });

  it('round-trips a save', async () => {
    const s = stub();
    const p = new LocalPlatform(s);
    await p.save({ coins: 5, levels: [1, 2] });
    expect(s.map.has(SAVE_KEY)).toBe(true);
    expect(await new LocalPlatform(s).loadSave()).toEqual({ coins: 5, levels: [1, 2] });
  });

  it('falls back to null on corrupt JSON', async () => {
    const s = stub();
    s.map.set(SAVE_KEY, '{not json');
    expect(await new LocalPlatform(s).loadSave()).toBeNull();
  });

  it('survives a throwing storage and missing storage', async () => {
    const bad: KV = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    const p = new LocalPlatform(bad);
    await expect(p.save({ a: 1 })).resolves.toBeUndefined();
    expect(await p.loadSave()).toBeNull();
    expect(await new LocalPlatform(null).loadSave()).toBeNull();
  });

  it('rewarded ad resolves true, audio on', async () => {
    const p = new LocalPlatform(null);
    expect(await p.showRewarded()).toBe(true);
    expect(p.isAudioEnabled()).toBe(true);
  });
});
