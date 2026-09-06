import { describe, expect, it } from 'vitest';
import { generateMockBrands } from '../data/mockBrands';
import { mockDataSource } from '../data/source';
import { RELATION_WEIGHTS, VIEW_CONFIG } from '../config';
import { calculateMockRelation } from './relation';
import { calculateGravityPositions, fitToDistance } from './gravity';
import { zoomAt } from './viewport';
import { RELATION_TYPES } from '../domain/types';

const brands = generateMockBrands();
const brand = (id: string) => brands.find(item => item.id === id)!;
const relation = (a: string, b: string) => calculateMockRelation(brand(a), brand(b));

describe('Mock snapshot and relation contracts', () => {
  it('provides 40 fictional snapshots plus two complete public demo profiles', () => {
    expect(brands).toHaveLength(42);
    expect(brands.filter(item => item.fictional)).toHaveLength(40);
    expect(new Set(brands.map(item => item.id)).size).toBe(42);
    for (const item of brands) {
      for (const key of ['id', 'name', 'summary', 'offers', 'needs', 'intent', 'audience', 'identity', 'constraints'] as const) expect(item[key].length).toBeGreaterThan(0);
      expect(Number.isFinite(item.characterSeed)).toBe(true);
    }
    expect(generateMockBrands(3)).toEqual(generateMockBrands(3));
    expect(generateMockBrands(2).map(item => item.intent)).not.toEqual(brands.map(item => item.intent));
  });
  it('makes 奶龙 the strongest data-driven match for 库迪咖啡 with usable public contact details', () => {
    const cotti = brand('cotti-coffee');
    const ranked = [...mockDataSource.getRelations(cotti, brands)].sort((a, b) => b.collaborationFit - a.collaborationFit);
    expect(ranked[0].targetBrandId).toBe('nailong');
    expect(ranked[0].collaborationFit).toBeGreaterThanOrEqual(85);
    expect(ranked[0].possibleOutcome).toContain('主题饮品');
    expect(cotti.contact?.email).toBe('MKT@COTTICOFFEE.COM');
    expect(brand('nailong').contact?.email).toBe('dqyx@dqyx.net');
  });
  it('is deterministic for every pair, bounded, and weights sum to one', () => {
    expect(Object.values(RELATION_WEIGHTS).reduce((a, b) => a + b)).toBeCloseTo(1);
    for (const source of brands) for (const target of brands.filter(item => item.id !== source.id)) {
      const result = calculateMockRelation(source, target);
      expect(result).toEqual(calculateMockRelation({ ...source }, { ...target }));
      expect(result.collaborationFit).toBe(calculateMockRelation(target, source).collaborationFit);
      for (const value of [result.collaborationFit, result.intentFit, result.complementarity, result.audienceExpansion, result.chemistry, result.feasibility]) {
        expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100);
      }
      expect(RELATION_TYPES).toContain(result.relationType);
      expect(result.reason.length).toBeGreaterThan(20);
      expect(result.possibleOutcome.length).toBeGreaterThan(8);
      expect(result.possibleOutcome).toMatch(/[\u4e00-\u9fff]/);
    }
  });
  it('TEST 01: similar design studios are peers, not the strongest fit', () => {
    const peer = relation('memory-block', 'still-studio');
    expect(peer.relationType).toBe('Peer / Same Tribe');
    expect(peer.collaborationFit).toBeLessThan(72);
    expect(peer.complementarity).toBeLessThan(40);
  });
  it('TEST 02: aligned manufacturing collaboration is near and stronger than a peer', () => {
    const manufacturer = relation('memory-block', 'form-works');
    expect(manufacturer.collaborationFit).toBeGreaterThanOrEqual(72);
    expect(manufacturer.collaborationFit - relation('memory-block', 'still-studio').collaborationFit).toBeGreaterThan(15);
  });
  it('TEST 03: traditional craft × AI has productive tension', () => {
    const result = relation('clay-county', 'latent-lab');
    expect(result.relationType).toBe('Productive Tension');
    expect(result.collaborationFit).toBeGreaterThanOrEqual(72);
  });
  it('TEST 04: complementarity cannot make mismatched intent a strong fit', () => {
    const unaligned = relation('memory-block', 'bulk-union');
    expect(unaligned.complementarity).toBeGreaterThan(65);
    expect(unaligned.intentFit).toBeLessThan(25);
    expect(unaligned.collaborationFit).toBeLessThan(50);
    const sameCapabilities = { ...brand('form-works'), intent: brand('bulk-union').intent };
    expect(calculateMockRelation(brand('memory-block'), sameCapabilities).collaborationFit).toBeLessThan(relation('memory-block', 'form-works').collaborationFit - 20);
  });
  it('TEST 05: studio × large brand is not penalized for size or geography', () => {
    const original = relation('memory-block', 'circuit-house');
    expect(original.collaborationFit).toBeGreaterThanOrEqual(72);
    const changed = { ...brand('circuit-house'), category: 'Tiny studio', constraints: 'Located in another continent. Team of two.' };
    expect(calculateMockRelation(brand('memory-block'), changed).collaborationFit).toBe(original.collaborationFit);
  });
  it('TEST 06: no clear collaboration goes to far field', () => {
    expect(relation('memory-block', 'clear-ledger').collaborationFit).toBeLessThan(50);
    expect(relation('memory-block', 'clear-ledger').relationType).toBe('Weak Fit');
  });
  it('explicit production constraints reduce feasibility; seed only changes relation when briefs change', () => {
    expect(relation('memory-block', 'bulk-union').feasibility).toBe(20);
    expect(calculateMockRelation(brand('memory-block'), { ...brand('form-works'), characterSeed: 77 })).toEqual(relation('memory-block', 'form-works'));
  });
});

describe('Gravity layout', () => {
  it('distance is strictly decreasing with fit and the field is substantially larger', () => {
    for (let fit = 0; fit < 100; fit++) expect(fitToDistance(fit)).toBeGreaterThan(fitToDistance(fit + 1));
    expect(fitToDistance(0)).toBe(1800);
    expect(fitToDistance(50)).toBeGreaterThan(700);
  });
  it('is stable regardless of relation order for all focus brands', () => {
    for (const focus of brands) {
      const relations = mockDataSource.getRelations(focus, brands);
      const positions = calculateGravityPositions(focus.id, relations);
      expect(positions).toHaveLength(brands.length - 1);
      expect(positions).toEqual(calculateGravityPositions(focus.id, [...relations].reverse()));
      for (const position of positions) expect(Math.hypot(position.x, position.y)).toBeCloseTo(position.radius);
      const scores = new Map(relations.map(relation => [relation.targetBrandId, relation.collaborationFit]));
      const byDistance = [...positions].sort((a, b) => a.radius - b.radius);
      for (let i = 1; i < byDistance.length; i++) {
        expect(scores.get(byDistance[i - 1].brandId)!).toBeGreaterThanOrEqual(scores.get(byDistance[i].brandId)!);
        expect(byDistance[i].radius).toBeGreaterThan(byDistance[i - 1].radius);
      }
    }
  });
  it('spreads identical scores across continuous radii without changing relation data', () => {
    const relations = mockDataSource.getRelations(brands[0], brands).map(relation => ({ ...relation, collaborationFit: 25 }));
    const before = JSON.stringify(relations);
    const positions = calculateGravityPositions(brands[0].id, relations);
    const radii = positions.map(position => position.radius).sort((a, b) => a - b);
    expect(new Set(radii.map(radius => radius.toFixed(3))).size).toBe(relations.length);
    expect(radii[0] / radii.at(-1)!).toBeLessThan(.5);
    expect(positions).toEqual(calculateGravityPositions(brands[0].id, [...relations].reverse()));
    expect(JSON.stringify(relations)).toBe(before);
  });
  it('spreads the strong-fit cluster toward the center instead of leaving a large empty annulus', () => {
    const relations = mockDataSource.getRelations(brands[0], brands);
    const positions = calculateGravityPositions(brands[0].id, relations);
    const radii = positions.map(position => position.radius).sort((a, b) => a - b);
    expect(radii[0] / radii[Math.floor(radii.length * .65)]).toBeLessThan(.35);
    expect(calculateGravityPositions('empty', [])).toEqual([]);
    const single = calculateGravityPositions('one', [relations[0]]);
    expect(single[0].radius).toBe(fitToDistance(relations[0].collaborationFit));
  });
  it('contains positions only, with no rendering LOD, and reorganizes with focus', () => {
    const first = calculateGravityPositions(brands[0].id, mockDataSource.getRelations(brands[0], brands));
    const second = calculateGravityPositions(brands[1].id, mockDataSource.getRelations(brands[1], brands));
    expect(first.every(item => !('lod' in item))).toBe(true);
    expect(first.find(item => item.brandId === 'latent-lab')).not.toEqual(second.find(item => item.brandId === 'latent-lab'));
  });
  it('avoids severe overlaps across every focus in five regenerated worlds', () => {
    for (let seed = 1; seed <= 5; seed++) for (const focus of generateMockBrands(seed)) {
      const world = generateMockBrands(seed);
      const positions = calculateGravityPositions(focus.id, mockDataSource.getRelations(focus, world));
      for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j];
        expect(Math.abs(a.x - b.x) >= 150 || Math.abs(a.y - b.y) >= 125, `Seed ${seed}, ${focus.name}: ${a.brandId}/${b.brandId}`).toBe(true);
      }
    }
  });
});

describe('Viewport', () => {
  it('zooms around a fixed world point, including at zoom bounds', () => {
    const view = { x: 120, y: -45, zoom: 0.9 };
    for (const factor of [0.001, 0.8, 1.2, 100]) {
      const next = zoomAt(view, factor, 240, -170);
      expect((240 - next.x) / next.zoom).toBeCloseTo((240 - view.x) / view.zoom);
      expect((-170 - next.y) / next.zoom).toBeCloseTo((-170 - view.y) / view.zoom);
      expect(next.zoom).toBeGreaterThanOrEqual(VIEW_CONFIG.minZoom);
      expect(next.zoom).toBeLessThanOrEqual(VIEW_CONFIG.maxZoom);
    }
  });
});
