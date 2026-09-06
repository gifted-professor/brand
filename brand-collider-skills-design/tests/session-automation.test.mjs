import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionProduction } from '../web/session-production.ts';
import { currentSessionAutomation, isSessionMediaComplete, isSessionMediaRunning } from '../web/session-automation.ts';
import { resolveSessionProgressNode, resolveSessionStage } from '../web/workflow-stage.ts';
import { arrangeInfiniteNodes, CANVAS_CARD_WIDTH, CANVAS_CARD_HEIGHT } from '../web/infinite-layout.ts';

const hash = 'a'.repeat(64), pageHash = 'b'.repeat(64), resultHash = 'c'.repeat(64);
function reference(overrides = {}) {
  return { referenceId: 'official-a', brandId: 'a', sourcePageUrl: 'https://brand.example/product', sourcePageFinalUrl: 'https://brand.example/product',
    sourceImageUrl: 'https://brand.example/cup.png', imageFinalUrl: 'https://brand.example/cup.png', sourcePageContentHash: pageHash,
    title: '品牌纸杯原图', publisher: '品牌官网', subject: '纸杯', version: '2026 年常规款', contentHash: hash,
    width: 900, height: 1200, mimeType: 'image/png', retrievedAt: '2026-09-06', sourceClass: 'official',
    inspection: { status: 'verified', sourceClass: 'official', sourceRelationship: 'verified', identityVerified: true, subject: '纸杯', version: '2026 年常规款',
      evidence: '已查看原图并对照网页确认杯型、标识与版本。', limitations: [], imageHash: hash, sourcePageHash: pageHash, inspectedAt: '2026-09-06' },
    imageUrl: '/api/sessions/auto-web/media/references/official-a?v=2', ...overrides };
}
function material(overrides = {}) {
  return { materialId: 'cup', name: '联名纸杯', priority: 'core', status: 'ready',
    binding: { materialId: 'cup', referenceIds: ['official-a'], referenceTasks: [], identityRequired: true, identityReferenceIds: ['official-a'],
      identityRequirements: ['杯身品牌标识准确'], rationale: '以当前品牌杯型和标识为制作依据。', status: 'ready', reason: '', mappingHash: 'map-hash' }, ...overrides };
}
function approvedMaterial(overrides = {}) {
  return material({ status: 'approved', imageUrl: '/api/sessions/auto-web/media/materials/cup?v=2', outputHash: resultHash, requestId: 'request-real-1', model: 'image-model',
    attachments: [{ source: 'file', referenceId: 'official-a', contentHash: hash }],
    submittedReferences: [{ contentHash: 'd'.repeat(64), mimeType: 'image/png', bytes: 1000 }],
    review: { status: 'approved', outputHash: resultHash, evidence: '对照参考图检查杯型、品牌标识与印刷位置，符合绑定要求。', reviewedAt: '2026-09-06' }, ...overrides });
}
function session(phase = 'generating', overrides = {}, mediaOverrides = {}) {
  return { id: 'auto-web', title: 'A × B', goal: '品牌联名', mode: 'live', autoProduce: true, status: 'running', revision: 2,
    brands: [{ id: 'a', name: 'A', description: '品牌 A', files: [] }, { id: 'b', name: 'B', description: '品牌 B', files: [] }],
    constraints: [], messages: [], concepts: [{ id: 'selected', title: '纸杯联名' }], selectedConceptId: 'selected',
    completedSkills: ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production'], activeSkill: 'visual-production',
    proposal: { sections: [{ skill: 'visual-production', content: '视觉计划已保存。' }] },
    createdAt: '2026-09-06', updatedAt: '2026-09-06', automation: { version: 1, sessionId: 'auto-web', revision: 2, updatedAt: '2026-09-06', phase,
      discovery: { a: 'completed', b: 'completed' }, references: [reference()], materials: [material()], limitations: [], concurrency: 4, ...mediaOverrides }, ...overrides };
}
function assertValidEdges(project) {
  const nodeIds = new Set(project.nodes.map(node => node.id));
  const assetIds = new Set(project.assets.map(asset => asset.id));
  assert.ok(project.edges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
  assert.ok(project.nodes.every(node => node.assetIds.every(id => assetIds.has(id))));
}

test('parallel collection shows saved original images and provenance without claiming generated output', () => {
  const project = sessionProduction(session('collecting', { completedSkills: [], activeSkill: 'brand-profile' }, { materials: [] }));
  const original = project.nodes.find(node => node.id === 'media-reference-official-a');
  assert.equal(original.status, 'reference');
  assert.equal(original.lane, 'strategy');
  assert.equal(project.assets.find(asset => asset.id === original.primaryAssetId).url, reference().imageUrl);
  assert.equal(original.sources[0].path, 'https://brand.example/product');
  assert.equal(original.sources[1].sha256, hash);
  assert.match(original.content, /2026 年常规款/);
  assert.equal(project.nodes.some(node => node.id.startsWith('media-material-')), false);
  assert.equal(project.workflow.completedSteps, 0);
  assertValidEdges(project);
});

test('uninspected, rejected and hash-mismatched source images retain honest reference states', () => {
  for (const [input, expected] of [
    [reference({ inspection: undefined }), 'unverified'],
    [reference({ inspection: { ...reference().inspection, status: 'rejected' } }), 'needs_revision'],
    [reference({ contentHash: 'changed' }), 'unverified'],
    [reference({ sourcePageContentHash: 'changed' }), 'unverified'],
  ]) {
    const project = sessionProduction(session('collecting', {}, { references: [input], materials: [] }));
    assert.equal(project.nodes.find(node => node.id === 'media-reference-official-a').status, expected);
    assert.match(project.nodes.find(node => node.id === 'media-references').summary, /0 张通过/);
  }
});

test('per-item bindings connect saved sources to generated images and dependent materials', () => {
  const poster = material({ materialId: 'poster', name: '联名海报', status: 'waiting_review',
    binding: { ...material().binding, materialId: 'poster', referenceTasks: ['cup'], rationale: '主产品图验收后进入海报。' } });
  const project = sessionProduction(session('generating', {}, { materials: [material({ status: 'running' }), poster] }));
  assert.ok(project.edges.some(edge => edge.source === 'media-reference-official-a' && edge.target === 'media-binding-cup'));
  assert.ok(project.edges.some(edge => edge.source === 'media-binding-cup' && edge.target === 'media-material-cup'));
  assert.ok(project.edges.some(edge => edge.source === 'media-material-cup' && edge.target === 'media-material-poster'));
  assert.equal(project.nodes.find(node => node.id === 'media-material-cup').status, 'running');
  assert.match(project.nodes.find(node => node.id === 'media-material-poster').statusLabel, /依赖图验收/);
  assert.equal(project.assets.filter(asset => asset.kind === 'image').length, 1);
  assertValidEdges(project);
});

test('visual step stays at 7/9 while actual images generate and focus follows the running material', () => {
  const current = session('generating', {}, { materials: [material({ status: 'running' })] });
  const project = sessionProduction(current);
  assert.equal(project.workflow.totalSteps, 9);
  assert.equal(project.workflow.completedSteps, 7);
  assert.equal(project.workflow.steps[7].status, 'running');
  assert.equal(project.workflow.steps[8].status, 'pending');
  assert.match(project.workflow.currentAction, /1 \/ 4 个任务运行中/);
  assert.equal(resolveSessionProgressNode(current), 'media-material-cup');
  assert.equal(resolveSessionStage(current), 'media');
  assert.equal(project.workflow.currentNodeId, 'media-material-cup');
  assert.equal(isSessionMediaRunning(current), true);
});

test('completed material retains original and submitted attachment hashes plus matching review evidence', () => {
  const current = session('completed', { status: 'completed', activeSkill: undefined, completedSkills: ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production', 'quality-review'] }, { materials: [approvedMaterial()] });
  const project = sessionProduction(current), image = project.nodes.find(node => node.id === 'media-material-cup');
  assert.equal(image.status, 'available');
  assert.equal(project.assets.find(asset => asset.id === image.primaryAssetId).sha256, resultHash);
  assert.match(image.content, new RegExp(hash));
  assert.match(image.content, new RegExp('d'.repeat(64)));
  assert.match(image.content, /对照参考图检查杯型/);
  assert.equal(project.nodes.find(node => node.id === 'media-review-cup').status, 'available');
  assert.equal(project.assets.find(asset => asset.id === 'media-evidence-file').url, '/api/sessions/auto-web/media/evidence?v=2');
  assert.equal(project.workflow.completedSteps, 9);
  assert.equal(project.workflow.phase, 'finished');
  assert.equal(isSessionMediaComplete(current), true);
  assertValidEdges(project);
});

test('wrong-output approval never marks an image or nine-step workflow complete', () => {
  const current = session('completed', { status: 'completed', completedSkills: ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production', 'quality-review'] },
    { materials: [approvedMaterial({ review: { ...approvedMaterial().review, outputHash: 'obsolete-image' } })] });
  const project = sessionProduction(current);
  assert.equal(isSessionMediaComplete(current), false);
  assert.equal(project.nodes.find(node => node.id === 'media-material-cup').status, 'unverified');
  assert.equal(project.nodes.find(node => node.id === 'media-review-cup').status, 'needs_revision');
  assert.equal(project.workflow.status, 'paused');
  assert.equal(project.workflow.completedSteps, 7);
  assert.notEqual(project.workflow.phase, 'finished');
});

test('approved images with unresolved final review stop at 8/9 and focus the actionable review', () => {
  for (const reviewStatus of ['needs_revision', 'unverified']) {
    const current = session('completed', { status: 'paused', activeSkill: undefined,
      completedSkills: ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production', 'quality-review'],
      proposal: { reviewStatus, sections: [{ skill: 'quality-review', content: '全案审查仍有待确认事项。' }] } }, { materials: [approvedMaterial()] });
    const project = sessionProduction(current);
    assert.equal(isSessionMediaComplete(current), true);
    assert.equal(project.workflow.status, 'paused');
    assert.equal(project.workflow.completedSteps, 8);
    assert.equal(project.workflow.steps[8].status, 'paused');
    assert.equal(project.workflow.currentNodeId, 'quality-review');
    assert.match(project.workflow.currentAction, /全案审查仍有待修订或待确认/);
    assert.equal(resolveSessionStage(current), 'review');
  }
});

test('paused and incomplete runs retain source and output evidence without a running spinner or full completion', () => {
  const current = session('partial', { status: 'paused' }, { materials: [material({ status: 'unknown', reason: '供应商响应中断，需核对实际生成状态。' })], limitations: ['角色立绘来源未验证'] });
  const project = sessionProduction(current);
  assert.equal(isSessionMediaRunning(current), false);
  assert.equal(project.workflow.status, 'paused');
  assert.equal(project.workflow.completedSteps, 7);
  assert.equal(project.nodes.find(node => node.id === 'media-material-cup').status, 'failed');
  assert.match(project.nodes.find(node => node.id === 'media-evidence').content, /角色立绘来源未验证/);
  assert.equal(project.nodes.find(node => node.id === 'media-evidence').status, 'needs_revision');
  assert.equal(resolveSessionProgressNode(current), 'media-material-cup');
  const interrupted = session('generating', { status: 'paused' }, { materials: [material({ status: 'running' })] });
  assert.equal(isSessionMediaRunning(interrupted), false);
  assert.equal(sessionProduction(interrupted).nodes.find(node => node.id === 'media-material-cup').status, 'planned');
});

test('demo, historical and stale snapshots cannot turn into automatic paid-production status', () => {
  for (const changes of [{ autoProduce: undefined }, { autoProduce: false }, { revision: 3 }, { id: 'other-session' }]) {
    const current = session('generating', changes);
    assert.equal(currentSessionAutomation(current), undefined);
    assert.equal(isSessionMediaRunning(current), false);
    const project = sessionProduction(current);
    assert.equal(project.nodes.some(node => node.id.startsWith('media-')), false);
    assert.equal(project.assets.some(asset => asset.id.startsWith('media-')), false);
  }
});

test('out-of-scope optional candidates stay explicit and do not imply an image or failed required delivery', () => {
  const current = session('completed', { status: 'completed' }, { materials: [approvedMaterial(), material({ materialId: 'badge', name: '徽章', priority: 'optional', status: 'out_of_scope', binding: undefined })] });
  const project = sessionProduction(current), optional = project.nodes.find(node => node.id === 'media-material-badge');
  assert.equal(optional.status, 'planned');
  assert.match(optional.statusLabel, /不在本轮制作范围/);
  assert.deepEqual(optional.assetIds, []);
  assert.equal(isSessionMediaComplete(current), true);
  assertValidEdges(project);
});

test('expanded provenance and per-item evidence nodes occupy distinct desktop and mobile world positions', () => {
  const materials = Array.from({ length: 16 }, (_, index) => approvedMaterial({ materialId: `item-${index}`, name: `物料 ${index}`,
    binding: { ...material().binding, materialId: `item-${index}` } }));
  const project = sessionProduction(session('completed', {}, { materials }));
  const positions = arrangeInfiniteNodes(project.nodes);
  for (const [index, node] of project.nodes.entries()) {
    const point = positions[node.id];
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    for (const other of project.nodes.slice(index + 1)) {
      const next = positions[other.id];
      assert.ok(Math.abs(point.x - next.x) >= CANVAS_CARD_WIDTH || Math.abs(point.y - next.y) >= CANVAS_CARD_HEIGHT, `${node.id} overlaps ${other.id}`);
    }
  }
  assertValidEdges(project);
});
