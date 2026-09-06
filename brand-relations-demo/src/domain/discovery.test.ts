import { describe, it, expect } from 'vitest';
import { mockDataSource } from '../data/source';
import { discoverRelations, gravityExplorationRelations } from './discovery';
describe('evidence-aware discovery', () => {
  it('shows fewer connections for a sparse profile and expands when focusing a complete brand', () => {
    const brands = mockDataSource.loadBrands(1);
    const complete = brands[0];
    const sparse = { ...complete, needs: '', intent: '', audience: '', identity: '', constraints: '' };
    const partial = discoverRelations(sparse, mockDataSource.getRelations(sparse, brands));
    const full = discoverRelations(complete, mockDataSource.getRelations(complete, brands));
    expect(partial.length).toBeLessThanOrEqual(2);
    expect(full.length).toBeGreaterThan(partial.length);
    expect(complete.needs).not.toBe('');
    const source = mockDataSource.getRelations(sparse, brands);
    const before = JSON.stringify(source);
    const field = gravityExplorationRelations(source, partial);
    expect(field).toHaveLength(source.length);
    expect(field.length).toBeGreaterThan(partial.length);
    for (const relation of field) {
      const clue = partial.find(item => item.targetBrandId === relation.targetBrandId);
      if (clue) expect(relation).toEqual(clue);
      else expect(relation.exploratory).toBe(true);
      expect(relation.collaborationFit).toBe(source.find(item => item.targetBrandId === relation.targetBrandId)?.collaborationFit);
    }
    expect(JSON.stringify(source)).toBe(before);
  });
});
