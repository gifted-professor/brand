import { describe, expect, it } from 'vitest';
import { brandFromProfile, localProfile, validateDocuments, validateProfileResult } from './brandProfile';
import { discoverRelations } from './discovery';
import { mockDataSource } from '../data/source';
const docs = [{ id: 'a', name: 'brand.txt', text: '品牌名称：微光岛' }, { id: 'b', name: 'notes.md', text: '我们希望以后做咖啡，但尚无产品或交付能力。' }];
describe('material based brand profiles', () => {
  it('merges explicit fields without converting unstructured hopes into capabilities', () => {
    const result = localProfile(docs);
    expect(result.fields.name).toBe('微光岛');
    expect(result.fields.offers).toBe('');
    expect(result.profile.documents).toHaveLength(2);
    expect(result.profile.gaps.length).toBeGreaterThan(0);
  });
  it('leaves conflicting subjects unresolved instead of silently picking a brand', () => {
    const result = localProfile([...docs, { id: 'c', name: 'other.txt', text: '品牌名称：另一家' }]);
    expect(result.fields.name).toBe('');
    expect(result.profile.evidence.some(ref => ref.field === 'name')).toBe(false);
  });
  it('requires source quotations and discards unsupported model fields', () => {
    const result = validateProfileResult({ fields: { name: '微光岛', offers: '拥有全国渠道' }, evidence: [{ field: 'name', documentId: 'a', quote: '品牌名称：微光岛' }, { field: 'offers', documentId: 'b', quote: '全国渠道' }], summary: '资料不足', gaps: [{ field: 'offers', material: '目前可交付的产品清单', reason: '区分未来计划和已有产品。' }] }, docs);
    expect(result.fields.name).toBe('微光岛');
    expect(result.fields.offers).toBe('');
    expect(result.profile.gaps[0].material).toBe('目前可交付的产品清单');
  });
  it('allows a named sparse brand and guarantees exploratory partners without inflating scores', () => {
    const brand = brandFromProfile(localProfile(docs));
    const pool = mockDataSource.loadBrands(1);
    const relations = mockDataSource.getRelations(brand, pool).map(item => ({ ...item, collaborationFit: 3, complementarity: 0 }));
    const visible = discoverRelations(brand, relations);
    expect(visible).toHaveLength(2);
    expect(visible.every(item => item.exploratory && item.collaborationFit === 3)).toBe(true);
    expect(discoverRelations(brand, [])).toEqual([]);
    expect(brand.character).toBeDefined();
  });
  it('rejects duplicate sources and oversized batches', () => {
    expect(() => validateDocuments([docs[0], docs[0]])).toThrow();
    expect(() => validateDocuments(Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: 'big.txt', text: 'x'.repeat(24000) })))).toThrow();
    expect(() => brandFromProfile(localProfile([docs[1]]))).toThrow('品牌名称');
  });
});
