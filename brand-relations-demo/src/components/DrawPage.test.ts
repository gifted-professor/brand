import { describe, expect, it } from 'vitest';
import { shuffleBrands } from './DrawPage';
import { mockDataSource } from '../data/source';

describe('Independent draw mode', () => {
  it('never draws the owner, never repeats a brand in a hand, and preserves the pool', () => {
    const brands = mockDataSource.loadBrands(1);
    const before = brands.map(brand => brand.id);
    for (let round = 0; round < 30; round++) {
      const hand = shuffleBrands(brands, brands[0].id);
      expect(hand).toHaveLength(3);
      expect(new Set(hand.map(brand => brand.id)).size).toBe(3);
      expect(hand.some(brand => brand.id === brands[0].id)).toBe(false);
    }
    expect(brands.map(brand => brand.id)).toEqual(before);
  });
  it('handles empty and undersized pools without empty slots', () => {
    const brands = mockDataSource.loadBrands(1).slice(0, 2);
    expect(shuffleBrands([], 'missing')).toEqual([]);
    expect(shuffleBrands(brands.slice(0, 1), brands[0].id)).toEqual([]);
    expect(shuffleBrands(brands, brands[0].id)).toEqual([brands[1]]);
  });
  it('keeps a featured match in the hand while randomizing the other two cards', () => {
    const brands = mockDataSource.loadBrands(1);
    for (let round = 0; round < 20; round++) expect(shuffleBrands(brands, 'cotti-coffee', 'nailong').some(brand => brand.id === 'nailong')).toBe(true);
  });
});
