import { describe, expect, it } from 'vitest';
import { defaultLevelId, getLevel, hasLevel, initialLevelId, levelNumber, nextLevelId } from './index';

describe('level registry', () => {
  it('loads every json and defaults to city-01 when it exists', () => {
    expect(hasLevel('test-01')).toBe(true);
    expect(defaultLevelId()).toBe(hasLevel('city-01') ? 'city-01' : 'test-01');
    expect(getLevel('test-01').id).toBe('test-01');
  });

  it('?level selects a level, unknown ids fall back', () => {
    expect(initialLevelId('?level=test-01')).toBe('test-01');
    expect(initialLevelId('?level=nope')).toBe(defaultLevelId());
    expect(initialLevelId('')).toBe(defaultLevelId());
  });

  it('campaign order city-01 -> 02 -> 03 -> 01; test levels join the campaign', () => {
    if (hasLevel('city-01') && hasLevel('city-02') && hasLevel('city-03')) {
      expect(nextLevelId('city-01')).toBe('city-02');
      expect(nextLevelId('city-02')).toBe('city-03');
      expect(nextLevelId('city-03')).toBe('city-01');
    }
    expect(nextLevelId('test-01')).toBe(defaultLevelId());
  });

  it('level numbers come from the id', () => {
    expect(levelNumber('city-03')).toBe(3);
    expect(levelNumber('test-01')).toBe(1);
  });
});
