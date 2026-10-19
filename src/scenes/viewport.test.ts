import { describe, it, expect } from 'vitest';
import { logicalHeight } from './viewport';

describe('logicalHeight', () => {
  it('390x844 -> 844', () => expect(logicalHeight(390, 844)).toBe(844));
  it('390x664 -> 664', () => expect(logicalHeight(390, 664)).toBe(664));
  it('412x915 -> 866', () => expect(logicalHeight(412, 915)).toBe(866));
  it('600x600 clamps to 520', () => expect(logicalHeight(600, 600)).toBe(520));
  it('1280x720 clamps to 520', () => expect(logicalHeight(1280, 720)).toBe(520));
  it('ultra tall clamps to 900', () => expect(logicalHeight(360, 1000)).toBe(900));
  it('invalid size falls back', () => expect(logicalHeight(0, 0)).toBe(844));
});
