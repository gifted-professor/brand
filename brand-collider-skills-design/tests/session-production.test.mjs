import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionProduction } from '../web/session-production.ts';

function call(skill, revision, role, content, artifact) {
  return [
    { id: `${skill}-${revision}-${role}`, kind: 'skill', skill, revision, role, status: 'done', content: '使用 Skill', model: 'actual-model', createdAt: '2026-09-05' },
    { id: `${skill}-${revision}-${role}-reply`, kind: 'message', revision, role, content, ...(artifact ? { artifact } : {}), createdAt: '2026-09-05' },
  ];
}
function imageCall(status, overrides = {}) {
  return { id: 'image-request', kind: 'skill', role: 'system', skill: 'visual-production', status, revision: 2,
    content: '用户已手动发起概念图生成', createdAt: '2026-09-05', ...overrides };
}
function session(overrides = {}) {
  return { id: 'local-test', title: 'A × B', goal: '品牌体验', mode: 'live', status: 'paused', revision: 2,
    brands: [{ id: 'a', name: 'A', description: '品牌 A', files: [] }, { id: 'b', name: 'B', description: '品牌 B', files: [] }],
    constraints: ['新标准'], messages: [], concepts: [], completedSkills: [], createdAt: '2026-09-05', updatedAt: '2026-09-05', ...overrides };
}

function assertValidEdges(project) {
  const ids = new Set(project.nodes.map(node => node.id));
  assert.ok(project.edges.every(edge => ids.has(edge.source) && ids.has(edge.target)), 'every edge must connect visible nodes');
}

test('idle or unstarted sessions have an empty canvas, without export or future placeholders', () => {
  for (const status of ['idle', 'paused']) {
    const project = sessionProduction(session({ status, messages: [{ kind: 'notice', role: 'system', content: '会话已创建', revision: 2 }] }));
    assert.deepEqual(project.nodes, []);
    assert.deepEqual(project.edges, []);
    assert.deepEqual(project.assets, []);
    assert.equal(project.nodeCount, 0); assert.equal(project.assetCount, 0);
  }
});

test('starting research adds only supplied brand data and the active stage', () => {
  const project = sessionProduction(session({ status: 'running', activeSkill: 'brand-profile',
    brands: [{ id: 'a', name: 'A', description: '', files: [{ name: 'brand.md', text: '实际提供的资料' }] }, { id: 'b', name: 'B', description: '', files: [] }] }));
  assert.deepEqual(project.nodes.map(node => node.id), ['brand-a', 'brand-profile']);
  assert.match(project.nodes[0].content, /实际提供的资料/);
  assert.equal(project.nodes[1].status, 'running');
  assert.equal(project.assets.length, 0);
  assertValidEdges(project);
});

test('production canvas does not resurrect invalidated old copy, design or visual plans after new standards', () => {
  const project = sessionProduction(session({ completedSkills: ['brand-profile'], messages: [
    ...call('brand-profile', 1, 'a', '仍有效的品牌定位'), ...call('campaign-copy', 1, 'a', '失效旧文案'),
    ...call('design-spec', 1, 'b', '失效旧设计'), ...call('visual-production', 1, 'b', '失效旧画面'),
  ], proposal: { sections: [{ skill: 'campaign-copy', content: '失效旧文案' }, { skill: 'design-spec', content: '失效旧设计' }],
    cards: [{ skill: 'campaign-copy', title: '过期标题', summary: '过期摘要' }], imageUrl: '/api/sessions/local-test/image?v=1' } }));
  assert.doesNotMatch(JSON.stringify(project), /失效旧文案|失效旧设计|失效旧画面|过期标题|过期摘要/);
  assert.match(project.nodes.find(node => node.id === 'brand-profile').content, /仍有效的品牌定位/);
  assert.equal(project.assets.some(asset => asset.kind === 'image' || asset.kind === 'video'), false);
  assert.equal(project.nodes.some(node => node.id === 'campaign-copy'), false);
  assertValidEdges(project);
});

test('partial current stage only exposes current public dialogue, with original revision attribution', () => {
  const project = sessionProduction(session({ status: 'running', activeSkill: 'design-spec', messages: [
    ...call('design-spec', 1, 'a', '旧版产品'), ...call('design-spec', 1, 'b', '旧版汇总'),
    ...call('design-spec', 2, 'a', '当前新标准的产品提案'),
  ], proposal: { sections: [{ skill: 'design-spec', content: '旧版产品' }], cards: [{ skill: 'design-spec', title: '旧版设计标题', summary: '旧版摘要' }] } }));
  const node = project.nodes.find(node => node.id === 'design-spec');
  assert.doesNotMatch(JSON.stringify(node), /旧版产品|旧版汇总|旧版设计标题|旧版摘要/);
  assert.match(node.content, /当前新标准的产品提案/); assert.match(node.content, /A · v2/);
  assert.equal(node.status, 'running');
  // Early saved reports must not make the future review stage appear populated.
  assert.equal(project.nodes.some(node => node.id === 'export'), false);
});

test('validated research artifacts appear as reports before the second researcher finishes', () => {
  const project = sessionProduction(session({ status: 'running', activeSkill: 'brand-profile', messages: [
    ...call('brand-profile', 1, 'a', '旧报告摘要', { section: '已失效的历史报告' }),
    ...call('brand-profile', 2, 'a', '已完成研究，请看画布', { section: '## 品牌资产研究\n\n实际来源与完整结论',
      card: { skill: 'brand-profile', title: 'A 品牌研究', summary: '品牌资产与证据', points: [] } }),
  ] }));
  const node = project.nodes.find(node => node.id === 'brand-profile');
  assert.equal(node.title, 'A 品牌研究');
  assert.equal(node.summary, '品牌资产与证据');
  assert.match(node.content, /实际来源与完整结论/);
  assert.match(node.content, /A · v2/);
  assert.doesNotMatch(node.content, /已完成研究，请看画布|已失效的历史报告/);
  assert.equal(node.status, 'running');
  assert.equal(project.nodes.some(item => item.id === 'collab-ideation'), false);
});

test('retained completed stages use the latest public contribution per role rather than every historical revision', () => {
  const project = sessionProduction(session({ revision: 3, completedSkills: ['brand-profile'], messages: [
    ...call('brand-profile', 1, 'a', '最早品牌观点'), ...call('brand-profile', 1, 'b', '保留的 B 品牌观点'),
    ...call('brand-profile', 2, 'a', '保留的 A 最新观点'),
  ] }));
  const node = project.nodes.find(node => node.id === 'brand-profile');
  assert.doesNotMatch(node.content, /最早品牌观点/);
  assert.match(node.content, /保留的 B 品牌观点/); assert.match(node.content, /B · v1/);
  assert.match(node.content, /保留的 A 最新观点/); assert.match(node.content, /A · v2/);
  assert.equal(node.status, 'available');
});

test('visual planning does not imply an actual image request or image asset', () => {
  const project = sessionProduction(session({ status: 'running', activeSkill: 'visual-production', messages: [
    { ...imageCall('running'), role: 'b', content: '正在规划视觉提示词' },
  ] }));
  assert.equal(project.nodes.find(node => node.id === 'visual-production').status, 'running');
  assert.equal(project.nodes.some(node => node.kind === 'image'), false);
  assert.equal(project.assets.some(asset => asset.kind === 'image'), false);
});

test('an actual image request progresses from running placeholder to saved image with a stable node ID', () => {
  const base = session({ status: 'completed', completedSkills: ['visual-production'],
    proposal: { sections: [{ skill: 'visual-production', content: '已保存的视觉计划' }] } });
  const running = sessionProduction({ ...base, messages: [imageCall('running')] });
  const placeholder = running.nodes.find(node => node.id === 'generated-image');
  assert.equal(placeholder.status, 'running');
  assert.deepEqual(placeholder.assetIds, []);
  assert.equal(running.assets.some(asset => asset.kind === 'image'), false);
  assert.equal(running.nodes.find(node => node.id === 'visual-production').status, 'available');
  const saved = sessionProduction({ ...base, messages: [imageCall('done')],
    proposal: { ...base.proposal, imageUrl: '/api/sessions/local-test/image?v=2' } });
  const image = saved.nodes.find(node => node.id === placeholder.id);
  assert.equal(image.status, 'unverified');
  assert.equal(image.primaryAssetId, 'session-image');
  assert.equal(saved.assets.filter(asset => asset.kind === 'image').length, 1);
  assertValidEdges(running); assertValidEdges(saved);
});

test('failed and unknown image outcomes remain visible without claiming an asset exists', () => {
  for (const [detail, label] of [['图像请求失败（provider_error）。未自动重试。', '图片生成失败'], ['图像请求状态未知（timeout）。未自动重试。', '生成状态未知']]) {
    const project = sessionProduction(session({ status: 'completed', messages: [imageCall('error', { detail })] }));
    const image = project.nodes.find(node => node.id === 'generated-image');
    assert.equal(image.status, 'failed'); assert.equal(image.statusLabel, label);
    assert.equal(image.summary, detail); assert.deepEqual(image.assetIds, []);
    assert.equal(project.assets.length, 0);
  }
});

test('old-revision image requests and stale saved images are absent after a revision change', () => {
  const project = sessionProduction(session({ revision: 3, completedSkills: ['brand-profile'], messages: [imageCall('running')],
    proposal: { sections: [], imageUrl: '/api/sessions/local-test/image?v=2' } }));
  assert.equal(project.nodes.some(node => node.kind === 'image'), false);
  assert.equal(project.assets.some(asset => asset.kind === 'image'), false);
});

test('a failed text stage is not described as completed or still running', () => {
  const project = sessionProduction(session({ status: 'error', messages: [
    { ...imageCall('error', { detail: '品牌资料研究请求失败' }), role: 'a', skill: 'brand-profile' },
  ] }));
  const node = project.nodes.find(node => node.id === 'brand-profile');
  assert.equal(node.status, 'failed');
  assert.equal(node.statusLabel, '本次调用失败');
  assert.equal(project.nodes.some(item => item.id === 'export'), false);
});
