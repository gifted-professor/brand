import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_LAYERS, arrangeInfiniteNodes, canvasLayerOrigin, nodeLayer, reconcileInfinitePositions } from '../web/infinite-layout.ts';

function node(id, lane, overrides = {}) {
  return { id, lane, kind: 'document', ...overrides };
}

test('agent layers distinguish research from ideation and cover every work category', () => {
  const examples = [
    [node('brand-a', 'strategy', { kind: 'brief' }), 'research'],
    [node('research-report', 'strategy'), 'research'],
    [node('direction-a', 'strategy', { kind: 'concept' }), 'ideation'],
    [node('collab-ideation', 'strategy'), 'ideation'],
    [node('concept-I5', 'strategy'), 'ideation'],
    [node('specification', 'materials'), 'design'],
    [node('campaign-copy', 'story'), 'copy'],
    [node('visual-production', 'media'), 'image'],
    [node('generated-image', 'media', { kind: 'image' }), 'image'],
    [node('generated-video', 'media', { kind: 'video' }), 'video'],
    [node('narration', 'media', { kind: 'audio' }), 'video'],
    [node('storyboard', 'video'), 'video'],
    [node('quality-review', 'review', { kind: 'review' }), 'review'],
    [node('export', 'review'), 'review'],
  ];
  for (const [item, expected] of examples) assert.equal(nodeLayer(item), expected, item.id);
  assert.equal(new Set(CANVAS_LAYERS.map(layer => layer.id)).size, 7);
  assert.ok(CANVAS_LAYERS.every(layer => layer.label && layer.agent && layer.description));
});

test('asset names and image previews do not change the owning agent layer', () => {
  assert.equal(nodeLayer(node('product', 'materials', { kind: 'image', title: '研究报告 主视觉 视频', primaryAssetId: 'image' })), 'design');
  assert.equal(nodeLayer(node('storyboard', 'video', { kind: 'image' })), 'video');
  assert.equal(nodeLayer(node('research', 'strategy', { title: '创意视频文案生图', primaryAssetId: 'visual' })), 'research');
});

test('growing one layer never moves the coordinates of other agent work', () => {
  const retained = [node('idea', 'strategy', { kind: 'concept' }), node('copy', 'story'), node('visual', 'media'), node('review', 'review')];
  const before = arrangeInfiniteNodes([node('research', 'strategy'), ...retained]);
  const additions = Array.from({ length: 60 }, (_, index) => node(`research-${index}`, 'strategy'));
  const after = arrangeInfiniteNodes([node('research', 'strategy'), ...additions, ...retained]);
  for (const item of retained) assert.deepEqual(after[item.id], before[item.id]);
});

test('hiding layers can reuse world positions without packing visible layers together', () => {
  const nodes = [node('research', 'strategy'), node('idea', 'strategy', { kind: 'concept' }), node('design', 'materials'), node('image', 'media')];
  const full = arrangeInfiniteNodes(nodes);
  const visible = nodes.filter(item => ['design', 'image'].includes(nodeLayer(item)));
  const visibleLayout = arrangeInfiniteNodes(visible);
  for (const item of visible) assert.deepEqual(visibleLayout[item.id], full[item.id]);
  assert.deepEqual(full.design, canvasLayerOrigin('design'));
  assert.ok(full.image.x > full.design.x);
});

test('large layers retain unique finite coordinates on the same infinite plane', () => {
  const lanes = ['strategy', 'strategy', 'materials', 'story', 'media', 'video', 'review'];
  const nodes = CANVAS_LAYERS.flatMap((layer, layerIndex) => Array.from({ length: 31 }, (_, index) =>
    node(`${layer.id}-${index}`, lanes[layerIndex], layer.id === 'ideation' ? { kind: 'concept' } : {})));
  const positions = Object.values(arrangeInfiniteNodes(nodes));
  assert.equal(positions.length, nodes.length);
  assert.equal(new Set(positions.map(point => `${point.x},${point.y}`)).size, nodes.length);
  assert.ok(positions.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test('explicit source order puts primary outputs first and preserves ties without mutating input', () => {
  const nodes = Object.freeze([
    Object.freeze(node('unranked-a', 'media')),
    Object.freeze(node('supporting', 'media', { displayOrder: 9 })),
    Object.freeze(node('primary-a', 'media', { displayOrder: 0 })),
    Object.freeze(node('primary-b', 'media', { displayOrder: 0 })),
    Object.freeze(node('unranked-b', 'media', { displayOrder: NaN })),
    Object.freeze(node('unranked-c', 'media', { displayOrder: Infinity })),
  ]);
  const positions = arrangeInfiniteNodes(nodes);
  const visualOrder = Object.keys(positions).sort((a, b) => positions[a].y - positions[b].y || positions[a].x - positions[b].x);
  assert.deepEqual(visualOrder, ['primary-a', 'primary-b', 'supporting', 'unranked-a', 'unranked-b', 'unranked-c']);
  assert.deepEqual(nodes.map(item => item.id), ['unranked-a', 'supporting', 'primary-a', 'primary-b', 'unranked-b', 'unranked-c']);
  assert.deepEqual(arrangeInfiniteNodes(nodes), positions);
  assert.deepEqual(arrangeInfiniteNodes([]), {});
});

test('new low-order results do not move artifacts already placed on the canvas', () => {
  const originalNodes = [node('old-a', 'media', { displayOrder: 5 }), node('old-b', 'media', { displayOrder: 6 })];
  const existing = Object.freeze(arrangeInfiniteNodes(originalNodes));
  const nextNodes = [node('new-primary', 'media', { displayOrder: 0 }), ...originalNodes];
  const next = reconcileInfinitePositions(existing, nextNodes);
  assert.deepEqual(next['old-a'], existing['old-a']);
  assert.deepEqual(next['old-b'], existing['old-b']);
  assert.ok(next['new-primary'].x > existing['old-b'].x);
  assert.equal(Object.hasOwn(existing, 'new-primary'), false);
  assert.deepEqual(reconcileInfinitePositions({}, nextNodes), arrangeInfiniteNodes(nextNodes));
});

test('new artifacts avoid arbitrary dragged rectangles, including work from other layers', () => {
  const origin = canvasLayerOrigin('image');
  const existing = { draggedResearch: { x: origin.x + 150, y: origin.y + 100 } };
  const next = reconcileInfinitePositions(existing, [node('image', 'media')]);
  // The dragged card spans the first two grid cells, so the third is free.
  assert.deepEqual(next.image, { x: origin.x + 664, y: origin.y });
  assert.deepEqual(next.draggedResearch, existing.draggedResearch);
  const returning = reconcileInfinitePositions(next, [node('draggedResearch', 'strategy'), node('image', 'media')]);
  assert.strictEqual(returning, next);
});

test('unchanged or temporarily absent artifacts retain layout identity and reserved positions', () => {
  const nodes = [node('research', 'strategy'), node('idea', 'strategy', { kind: 'concept' })];
  const existing = arrangeInfiniteNodes(nodes);
  assert.strictEqual(reconcileInfinitePositions(existing, nodes), existing);
  assert.strictEqual(reconcileInfinitePositions(existing, []), existing);
  const next = reconcileInfinitePositions(existing, [node('new-report', 'strategy')]);
  assert.deepEqual(next.research, existing.research);
  assert.notDeepEqual(next['new-report'], existing.research);
  assert.strictEqual(reconcileInfinitePositions(next, [...nodes, node('new-report', 'strategy')]), next);
});

test('invalid positions are replaced without disturbing valid positions', () => {
  const existing = { valid: { x: -1300, y: 120 }, invalid: { x: NaN, y: 0 } };
  const next = reconcileInfinitePositions(existing, [node('invalid', 'media'), node('valid', 'strategy')]);
  assert.deepEqual(next.valid, existing.valid);
  assert.deepEqual(next.invalid, canvasLayerOrigin('image'));
  assert.ok(Number.isNaN(existing.invalid.x));
});
