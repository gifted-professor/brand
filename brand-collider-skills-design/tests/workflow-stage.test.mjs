import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectStage, resolveSessionProgressNode, resolveSessionStage, sessionWorkflow } from '../web/workflow-stage.ts';
import { sessionProduction } from '../web/session-production.ts';

function session(overrides = {}) {
  return { id: 'stage-test', status: 'running', revision: 2, messages: [], completedSkills: [], ...overrides };
}
function call(skill, status = 'done', overrides = {}) {
  return { kind: 'skill', role: 'a', revision: 2, skill, status, ...overrides };
}
function project(nodes = [], assets = []) { return { nodes, assets }; }
function node(id, lane, overrides = {}) { return { id, lane, status: 'available', kind: 'document', assetIds: [], ...overrides }; }

function assertProgressArtifact(overrides, expected) {
  const current = session({ title: 'A × B', mode: 'live', goal: '联名', constraints: [], concepts: [],
    brands: [{ id: 'a', name: 'A', description: '品牌 A', files: [] }, { id: 'b', name: 'B', description: '品牌 B', files: [] }],
    ...overrides });
  const id = resolveSessionProgressNode(current);
  assert.equal(id, expected);
  if (id) {
    assert.ok(sessionProduction(current).nodes.some(item => item.id === id), `${id} must exist in the current production canvas`);
    assert.notEqual(id, 'export');
  }
}

test('returning to completed ideation selects the creative result rather than earlier research', () => {
  const completed = { status: 'awaiting_selection', completedSkills: ['brand-profile', 'collab-ideation'],
    messages: [call('brand-profile'), call('collab-ideation')] };
  assertProgressArtifact(completed, 'collab-ideation');
  assertProgressArtifact({ ...completed, status: 'completed' }, 'collab-ideation');
  assertProgressArtifact({ ...completed, status: 'paused', messages: [] }, 'collab-ideation');
});

test('returning to actual image work selects the image artifact instead of the visual plan or export', () => {
  const completed = { status: 'completed', completedSkills: ['visual-production', 'quality-review'],
    proposal: { imageUrl: '/api/sessions/stage-test/image?v=2', sections: [] },
    messages: [call('visual-production'), call('quality-review'), call('visual-production', 'done', { role: 'system' })] };
  assertProgressArtifact(completed, 'generated-image');
  assertProgressArtifact({ ...completed, status: 'running', activeSkill: 'campaign-copy' }, 'campaign-copy');
  assertProgressArtifact({ ...completed, status: 'running', activeSkill: 'quality-review', messages: [call('visual-production', 'running', { role: 'system' })] }, 'generated-image');
  assertProgressArtifact({ status: 'completed', completedSkills: ['visual-production'], messages: [call('visual-production')] }, 'visual-production');
});

test('failed work remains the progress target and only actual image requests create image targets', () => {
  assertProgressArtifact({ status: 'error', messages: [call('visual-production', 'error', { role: 'system' })] }, 'generated-image');
  assertProgressArtifact({ status: 'error', messages: [call('visual-production', 'error')] }, 'visual-production');
  const failedDesign = { status: 'error', completedSkills: ['visual-production'],
    proposal: { imageUrl: '/api/sessions/stage-test/image?v=2', sections: [] }, messages: [call('design-spec', 'error')] };
  assertProgressArtifact(failedDesign, 'design-spec');
  assert.equal(resolveSessionStage(session(failedDesign)), 'materials');
});

test('invalidated progress targets fall back to retained current work, with no session override for imports', () => {
  assertProgressArtifact({ status: 'paused', revision: 3, completedSkills: ['brand-profile'],
    proposal: { imageUrl: '/api/sessions/stage-test/image?v=2', sections: [] },
    messages: [call('campaign-copy'), call('visual-production', 'running', { role: 'system' })] }, 'brand-profile');
  assert.equal(resolveSessionProgressNode(null), null);
  assertProgressArtifact({ status: 'idle', completedSkills: ['collab-ideation'] }, null);
  assertProgressArtifact({ status: 'paused' }, null);
  assertProgressArtifact({ status: 'running' }, null);
  const imported = project([node('storyboard', 'video', { displayOrder: 9, primaryAssetId: 'storyboard' }),
    node('hero', 'materials', { displayOrder: 0, primaryAssetId: 'hero' })], [{ id: 'storyboard', kind: 'image' }, { id: 'hero', kind: 'image' }]);
  assert.equal(resolveProjectStage(imported), 'materials');
});

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


test('nine-step progress shows parallel research and follows the remaining active sibling', () => {
  const current = session({ brands: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], activeSkill: 'brand-profile',
    messages: [call('brand-profile', 'running', { content: 'A 正在研究' }), call('brand-profile', 'running', { role: 'b', content: 'B 正在研究' })] });
  let workflow = sessionWorkflow(current, new Set(['brand-profile']));
  assert.equal(workflow.totalSteps, 9);
  assert.deepEqual(workflow.steps.filter(step => step.status === 'running').map(step => step.id), ['profile-a', 'profile-b']);
  assert.match(workflow.currentAction, /并行/);
  current.messages[1].status = 'done';
  workflow = sessionWorkflow(current, new Set(['brand-profile']));
  assert.equal(workflow.currentStepId, 'profile-a');
  assert.equal(workflow.currentAction, 'A 正在研究');
  assert.equal(workflow.completedSteps, 1);
  current.messages[0].status = 'error'; current.status = 'error'; current.error = 'A 研究未完成';
  assert.equal(sessionWorkflow(current, new Set(['brand-profile'])).currentAction, 'A 研究未完成');
});
