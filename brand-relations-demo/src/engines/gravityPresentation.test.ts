import { describe, it, expect } from 'vitest';
import { gravityPresentationScale } from './gravityPresentation';
import { calculateGravityPositions } from './gravity';
import { resolveLODByDistance, updateVisibleNodes } from './viewport';
import { mockDataSource } from '../data/source';

describe('gravity presentation density', () => {
  it('brings sparse, distant partners into the initial canvas without changing raw placement', () => {
    const positions = [{brandId:'a',x:0,y:1200,radius:1200},{brandId:'b',x:0,y:-1800,radius:1800}];
    const before = structuredClone(positions);
    for (const size of [{width:940,height:650},{width:390,height:590}]) {
      const scale = gravityPresentationScale(positions,size);
      const zoom = size.width < 640 ? .62 : .8;
      expect(1800*scale*zoom).toBeLessThanOrEqual(Math.min(size.width,size.height)*(size.width <= 640 ? .47 : .33));
      expect(scale).toBeGreaterThan(0);
    }
    expect(positions).toEqual(before);
  });
  it('preserves ranking and direction for the full fixture population', () => {
    const brands = mockDataSource.loadBrands(1);
    const focus = brands.find(brand => brand.id === 'memory-block')!;
    const positions = calculateGravityPositions(focus.id,mockDataSource.getRelations(focus,brands));
    const scale = gravityPresentationScale(positions,{width:940,height:650});
    const sorted = [...positions].sort((a,b)=>a.radius-b.radius);
    for (let i=1;i<sorted.length;i++) expect(sorted[i].radius*scale).toBeGreaterThanOrEqual(sorted[i-1].radius*scale);
    for (const p of positions) expect(Math.atan2(p.y*scale,p.x*scale)).toBeCloseTo(Math.atan2(p.y,p.x));
    expect(gravityPresentationScale([],{width:390,height:590})).toBe(1);
  });
});


describe('Scatter within a detail level', () => {
  it('retains a broad depth range within portraits instead of placing them on one ring', () => {
    const brands = mockDataSource.loadBrands(1);
    const focus = brands.find(brand => brand.id === 'memory-block')!;
    const relations = mockDataSource.getRelations(focus, brands);
    const positions = calculateGravityPositions(focus.id, relations);
    const size = { width: 1152, height: 794 };
    const view = { x: 0, y: 0, zoom: .8 };
    const scale = gravityPresentationScale(positions, size);
    const nodes = brands.map(brand => {
      const raw = positions.find(position => position.brandId === brand.id);
      return { brand, isFocus: brand.id === focus.id, fit: relations.find(relation => relation.targetBrandId === brand.id)?.collaborationFit ?? 100,
        position: { brandId: brand.id, x: (raw?.x ?? 0)*scale, y: (raw?.y ?? 0)*scale, radius: (raw?.radius ?? 0)*scale } };
    });
    const levels = resolveLODByDistance(nodes, updateVisibleNodes(nodes, view, size), view, size);
    const radii = nodes.filter(node => levels.get(node.brand.id) === 'portrait').map(node => node.position.radius);
    expect(radii.length).toBeGreaterThan(5);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(size.height * .25);
    expect(new Set(radii.map(radius => Math.round(radius))).size).toBe(radii.length);
  });
});
