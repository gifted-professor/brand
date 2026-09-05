import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectStage, resolveSessionStage } from '../web/workflow-stage.ts';

function session(overrides = {}) {
  return { id: 'stage-test', status: 'running', revision: 2, messages: [], completedSkills: [], ...overrides };
}
function call(skill, status = 'done', overrides = {}) {
  return { kind: 'skill', role: 'a', revision: 2, skill, status, ...overrides };
}
function project(nodes = [], assets = []) { return { nodes, assets }; }
function node(id, lane, overrides = {}) { return { id, lane, status: 'available', kind: 'document', assetIds: [], ...overrides }; }

test('empty and idle sessions have no selected canvas stage', () => {
  assert.equal(resolveSessionStage(null), null);
  assert.equal(resolveSessionStage(session({ status: 'idle' })), null);
  assert.equal(resolveSessionStage(session({ status: 'paused' })), null);
});

test('active skills select the corresponding stage as work advances', () => {
  const stages = { 'brand-profile': 'strategy', 'collab-ideation': 'strategy', 'design-spec': 'materials',
    'campaign-copy': 'story', 'visual-production': 'media', 'quality-review': 'review' };
  for (const [activeSkill, lane] of Object.entries(stages)) assert.equal(resolveSessionStage(session({ activeSkill })), lane);
});

test('actual image generation takes focus even when the text session is completed', () => {
  const messages = [call('quality-review'), call('visual-production', 'running', { role: 'system' })];
  assert.equal(resolveSessionStage(session({ status: 'completed', messages, completedSkills: ['quality-review'] })), 'media');
  assert.equal(resolveSessionStage(session({ activeSkill: 'quality-review', messages })), 'media');
});

test('saved image and failed image outcomes select media, with a new active stage taking precedence', () => {
  const saved = session({ status: 'completed', completedSkills: ['visual-production', 'quality-review'],
    proposal: { imageUrl: '/api/sessions/stage-test/image?v=2' }, messages: [call('quality-review')] });
  assert.equal(resolveSessionStage(saved), 'media');
  assert.equal(resolveSessionStage({ ...saved, status: 'running', activeSkill: 'campaign-copy' }), 'story');
  assert.equal(resolveSessionStage(session({ status: 'completed', messages: [call('visual-production', 'error', { role: 'system' })] })), 'media');
});

test('invalidated historical calls do not pull focus away from retained current work', () => {
  assert.equal(resolveSessionStage(session({ status: 'paused', revision: 3, completedSkills: ['brand-profile'],
    messages: [call('campaign-copy'), call('visual-production', 'running', { role: 'system' })],
    proposal: { imageUrl: '/api/sessions/stage-test/image?v=2' } })), 'strategy');
  assert.equal(resolveSessionStage(session({ status: 'paused', revision: 3, completedSkills: ['brand-profile', 'collab-ideation', 'design-spec'] })), 'materials');
});

test('completed sessions without images select the latest actual artifact stage', () => {
  assert.equal(resolveSessionStage(session({ status: 'completed', completedSkills: ['brand-profile', 'quality-review'] })), 'review');
  assert.equal(resolveSessionStage(session({ status: 'paused', messages: [call('design-spec')] })), 'materials');
});

test('imported projects prefer running work, then primary real image artifacts, then latest useful records', () => {
  assert.equal(resolveProjectStage(null), null);
  assert.equal(resolveProjectStage(project()), null);
  const nodes = [node('brief', 'strategy'), node('plan', 'media'), node('material', 'materials', { primaryAssetId: 'image', assetIds: ['image'] }), node('review', 'review')];
  const assets = [{ id: 'image', kind: 'image' }];
  assert.equal(resolveProjectStage(project(nodes, assets)), 'materials');
  assert.equal(resolveProjectStage(project([...nodes, node('copy', 'story', { status: 'running' })], assets)), 'story');
  assert.equal(resolveProjectStage(project([node('image', 'media', { kind: 'image', assetIds: ['image'] }), node('review', 'review')], assets)), 'media');
  assert.equal(resolveProjectStage(project([node('design', 'materials'), node('export', 'review')])), 'materials');
});

test('planned or missing image assets do not take focus from useful project output', () => {
  assert.equal(resolveProjectStage(project([node('design', 'materials'), node('future', 'media', { status: 'planned', kind: 'image', primaryAssetId: 'missing', assetIds: ['missing'] })])), 'materials');
});

test('imported primary display order focuses product images ahead of supporting storyboards', () => {
  const product = node('P01', 'materials', { primaryAssetId: 'product', assetIds: ['product'], displayOrder: 0 });
  const storyboard = node('B01', 'video', { primaryAssetId: 'storyboard', assetIds: ['storyboard'], displayOrder: 8 });
  const assets = [{ id: 'product', kind: 'image' }, { id: 'storyboard', kind: 'image' }];
  assert.equal(resolveProjectStage(project([product, storyboard], assets)), 'materials');
  assert.equal(resolveProjectStage(project([storyboard, product], assets)), 'materials');
  assert.equal(resolveProjectStage(project([product, { ...storyboard, status: 'running' }], assets)), 'video');
});

test('primary image ties and unranked images retain source order after explicitly ranked images', () => {
  const product = node('P01', 'materials', { primaryAssetId: 'product', assetIds: ['product'] });
  const storyboard = node('B01', 'video', { primaryAssetId: 'storyboard', assetIds: ['storyboard'] });
  const assets = [{ id: 'product', kind: 'image' }, { id: 'storyboard', kind: 'image' }];
  assert.equal(resolveProjectStage(project([product, storyboard], assets)), 'materials');
  assert.equal(resolveProjectStage(project([{ ...product, displayOrder: 0 }, { ...storyboard, displayOrder: 0 }], assets)), 'materials');
  assert.equal(resolveProjectStage(project([storyboard, { ...product, displayOrder: 0 }], assets)), 'materials');
});
