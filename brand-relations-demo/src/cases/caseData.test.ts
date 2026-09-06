import { describe, expect, it } from 'vitest';
import { allBrands, drawExampleDeck, memory, referenceCases } from './caseData';

describe('Memory Block example opportunities', () => {
  it('keeps the current brand out of partner packs and avoids repeated members within one batch', () => {
    for (const size of [1, 2, 3]) {
      for (const random of [0, .19, .51, .999999]) {
        const deck = drawExampleDeck(size, () => random);
        const ids = deck.flatMap(item => item.partnerIds);
        expect(ids).not.toContain(memory.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(deck.every(item => item.partnerIds.length === size)).toBe(true);
      }
    }
  });
  it('preserves a difficult manufacturer in the random pool instead of only serving positive matches', () => {
    expect(drawExampleDeck(2, () => .3).flatMap(item => item.partnerIds)).toContain('heavy-form');
    expect(referenceCases.find(item => item.partnerIds.includes('heavy-form'))?.verdict).toBe('需要调整方案');
  });
  it('derives avatar capabilities from offered abilities, never the missing abilities', () => {
    for (const brand of allBrands) {
      expect(brand.character?.parts).toHaveLength(6);
      for (const capability of brand.character!.capabilities) expect(brand.offers).toContain(capability.evidence);
    }
    expect(memory.character?.capabilities.map(capability => capability.id)).not.toContain('manufacturing');
  });
});
