import { describe, expect, it } from 'vitest';
import { generateMockBrands } from '../data/mockBrands';
import { mockDataSource } from '../data/source';
import type { LOD, SceneNode } from '../domain/types';
import { calculateGravityPositions } from './gravity';
import { resolveLODByDistance, calculateViewportLOD, constrainViewport, getNodeScreenPosition, getViewportBounds, updateVisibleNodes } from './viewport';

const view = { x: 0, y: 0, zoom: 0.8 };
const size = { width: 1171, height: 938 };
const center = { x: size.width / 2, y: size.height / 2 };
const lodRank: Record<LOD, number> = { full: 0, blurred: 1, simple: 1, portrait: 2, signature: 3, marker: 4, dormant: 5 };

describe('Viewport-driven LOD', () => {
  it('converts between world bounds and screen coordinates', () => {
    const camera = { x: 120, y: -80, zoom: 1.2 };
    const bounds = getViewportBounds(camera, size);
    const topLeft = getNodeScreenPosition({ x: bounds.left, y: bounds.top }, camera, size);
    expect(topLeft.x).toBeCloseTo(0); expect(topLeft.y).toBeCloseTo(0);
    const bottomRight = getNodeScreenPosition({ x: bounds.right, y: bounds.bottom }, camera, size);
    expect(bottomRight.x).toBeCloseTo(size.width); expect(bottomRight.y).toBeCloseTo(size.height);
  });
  it('downgrades high-fit nodes and even the focus when they leave the viewport', () => {
    for (const isFocus of [true, false]) {
      expect(calculateViewportLOD(center, 95, view, size, isFocus)).toBe('full');
      expect(calculateViewportLOD({ x: 5, y: 300 }, 95, view, size, isFocus)).toBe('marker');
      expect(calculateViewportLOD({ x: -100, y: 300 }, 95, view, size, isFocus)).toBe('marker');
      expect(calculateViewportLOD({ x: -300, y: 300 }, 95, view, size, isFocus)).toBe('dormant');
    }
  });
  it('wakes a low-fit node when exploring its region, without modifying its gravity position', () => {
    const position = { x: 1400, y: 200 };
    expect(calculateViewportLOD(getNodeScreenPosition(position, view, size), 22, view, size)).toBe('dormant');
    const camera = { ...view, x: -position.x * view.zoom, y: -position.y * view.zoom };
    expect(calculateViewportLOD(getNodeScreenPosition(position, camera, size), 22, camera, size)).toBe('full');
    const zoomed = { x: -position.x * 1.2, y: -position.y * 1.2, zoom: 1.2 };
    expect(calculateViewportLOD(getNodeScreenPosition(position, zoomed, size), 22, zoomed, size)).toBe('full');
    expect(position).toEqual({ x: 1400, y: 200 });
  });
  it('keeps distance-based artwork consistent even when controls overlap it', () => {
    const occludedSize = { ...size, occlusions: [{ left: center.x - 30, right: center.x + 30, top: center.y - 30, bottom: center.y + 30 }] };
    expect(calculateViewportLOD(center, 95, view, occludedSize)).toBe('full');
    expect(calculateViewportLOD(center, 95, view, size)).toBe('full');
  });
  it('zooming out limits detail even when all brands fit on screen', () => {
    for (const fit of [0, 22, 50, 72, 95, 100]) {
      expect(calculateViewportLOD(center, fit, { ...view, zoom: 0.35 }, size)).toBe('marker');
      const detailed = calculateViewportLOD(center, fit, { ...view, zoom: 1.2 }, size);
      expect(lodRank[detailed]).toBeLessThan(2);
    }
  });
  it('opens a partial world, then trades old detail for newly visible nodes', () => {
    const brands = generateMockBrands();
    const relations = mockDataSource.getRelations(brands[0], brands);
    const positions = calculateGravityPositions(brands[0].id, relations);
    const nodes: SceneNode[] = brands.map(brand => ({ brand,
      position: positions.find(position => position.brandId === brand.id) ?? { brandId: brand.id, x: 0, y: 0, radius: 0 },
      fit: relations.find(relation => relation.targetBrandId === brand.id)?.collaborationFit ?? 100,
      isFocus: brand.id === brands[0].id,
    }));
    const before = JSON.stringify(nodes);
    const initial = updateVisibleNodes(nodes, view, size);
    const primary = [...initial.values()].filter(lod => lod === 'full' || lod === 'portrait');
    expect(primary.length).toBeGreaterThan(1);
    expect([...initial.values()]).toContain('portrait');
    expect(primary.length).toBeLessThan(nodes.length);
    expect([...initial.values()].filter(lod => lod === 'full').length).toBeLessThanOrEqual(15);
    expect([...initial.values()]).toContain('dormant');
    expect([...initial.values()].every(lod => ['full', 'portrait', 'marker', 'dormant'].includes(lod))).toBe(true);
    const farNode = nodes.find(node => initial.get(node.brand.id) === 'dormant')!;
    const explored = updateVisibleNodes(nodes, { ...view, x: -farNode.position.x * view.zoom, y: -farNode.position.y * view.zoom }, size);
    expect(['portrait', 'full']).toContain(explored.get(farNode.brand.id));
    expect(lodRank[explored.get(brands[0].id)!]).toBeGreaterThan(lodRank[initial.get(brands[0].id)!]);
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('exposes every intermediate stage in both zoom directions regardless of fit or focus', () => {
    const stages = [[0.35, 'marker'], [0.48, 'portrait'], [1.2, 'full']] as const;
    for (const fit of [0, 30, 100]) for (const focus of [false, true]) {
      for (const [zoom, expected] of [...stages, ...[...stages].reverse()]) {
        expect(calculateViewportLOD(center, fit, { ...view, zoom }, size, focus)).toBe(expected);
      }
    }
  });
  it('keeps low detail in sparse worlds and never mutates source nodes', () => {
    const brand = generateMockBrands()[0];
    const nodes: SceneNode[] = [{ brand, isFocus: true, fit: 100, position: {brandId: brand.id, x: 0, y: 0, radius: 0} }];
    expect(updateVisibleNodes(nodes, {...view, zoom: 0.48}, size).get(brand.id)).toBe('portrait');
    expect(updateVisibleNodes(nodes, {...view, zoom: 0.66}, size).get(brand.id)).toBe('portrait');
    expect(nodes[0].fit).toBe(100);
  });
  it('allows unbounded exploration beyond the original virtual world', () => {
    expect(constrainViewport({ ...view, x: 800, y: -600 }, size)).toEqual({ ...view, x: 800, y: -600 });
    const constrained = constrainViewport({ ...view, x: 99999, y: -99999 }, size);
    expect(constrained).toEqual({ ...view, x: 99999, y: -99999 });
  });
});

describe('Readable LOD distances', () => {
  it('reveals intermediate portraits across the field and clips at viewport edges', () => {
    expect(calculateViewportLOD(center,80,view,size)).toBe('full');
    expect(calculateViewportLOD({x:size.width*.85,y:center.y},80,view,size)).toBe('portrait');
    expect(calculateViewportLOD({x:45,y:center.y},80,view,size)).toBe('marker');
    expect(calculateViewportLOD({x:center.x,y:size.height-40},80,{...view,zoom:1.2},size)).toBe('full');
  });
});


describe('Radial LOD consistency', () => {
  it('gives every angle the same stage at equal camera distance on a rectangular canvas', () => {
    for (const [radius, expected] of [[100, 'full'], [290, 'portrait'], [410, 'portrait'], [480, 'marker']] as const) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const screen = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
        expect(calculateViewportLOD(screen, 25, view, size)).toBe(expected);
      }
    }
  });
  it('keeps crowded peers at the same distance in the same stage without selection or ID bias', () => {
    const nodes = generateMockBrands().slice(0, 12).map((brand, i) => {
      const angle = i * Math.PI / 6;
      return { brand, isFocus: false, fit: i * 8, position: { brandId: brand.id, x: Math.cos(angle) * 360, y: Math.sin(angle) * 360, radius: 360 } };
    });
    const before = JSON.stringify(nodes);
    expect(new Set(updateVisibleNodes(nodes, view, size).values())).toEqual(new Set(['portrait']));
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('reveals marker, head, then body when approaching a node without changing zoom', () => {
    const position = { x: 650, y: 0 };
    const levels = [0, -200, -520].map(x => {
      const camera = { ...view, x };
      return calculateViewportLOD(getNodeScreenPosition(position, camera, size), 25, camera, size);
    });
    expect(levels).toEqual(['marker', 'portrait', 'full']);
  });
});


describe('Crowded radial bands', () => {
  it('shrinks a whole band at equal distances, independently of node order', () => {
    const nodes = generateMockBrands().slice(0, 5).map((brand, i) => {
      const angle = i * .1;
      return { brand, fit: 80, isFocus: i === 0, position: { brandId: brand.id, x: i ? Math.cos(angle) * 180 : 0, y: i ? Math.sin(angle) * 180 : 0, radius: i ? 180 : 0 } };
    });
    const levels = updateVisibleNodes(nodes, view, size);
    const before = JSON.stringify(nodes);
    const resolved = resolveLODByDistance(nodes, levels, view, size);
    expect(new Set(nodes.slice(1).map(node => resolved.get(node.brand.id))).size).toBe(1);
    expect(resolved.get(nodes[0].brand.id)).toBe('full');
    expect(resolveLODByDistance([...nodes].reverse(), levels, view, size)).toEqual(resolved);
    expect(JSON.stringify(nodes)).toBe(before);
    expect(new Set(levels.values())).toEqual(new Set(['full']));
  });
  it('retains all three stages with readable spacing around a dense camera focus', () => {
    const nodes = generateMockBrands().slice(0, 4).map((brand, i) => ({ brand, fit: 100-i*10, isFocus: i===0, position: {brandId: brand.id, x: 0, y: [0, 220, 400, 700][i], radius: [0, 220, 400, 700][i]} }));
    const resolved=resolveLODByDistance(nodes,updateVisibleNodes(nodes,view,size),view,size);
    expect(nodes.map(node=>resolved.get(node.brand.id))).toEqual(['full','portrait','portrait','marker']);
  });
});
