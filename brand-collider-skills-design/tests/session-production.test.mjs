import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionProduction } from '../web/session-production.ts';
import { arrangeInfiniteNodes, CANVAS_CARD_HEIGHT, CANVAS_CARD_WIDTH } from '../web/infinite-layout.ts';

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
function dispatch(status, overrides = {}) {
  return { id: 'orchestrator-request', kind: 'notice', role: 'system', agentRole: 'orchestrator', status, revision: 2,
    content: '主控 CLI 正在整理第 2 版简报，准备交给研究 Agent · A。', createdAt: '2026-09-05',
    execution: { transport: 'codex-cli', agentId: 'orchestrator', runId: 'run-1', revision: 2,
      state: status === 'running' ? 'running' : status === 'error' ? 'failed' : 'completed', startedAt: '2026-09-05' }, ...overrides };
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

function materialSession(overrides = {}) {
  const item = (id, name, category, priority, dependencies = [], variants = []) => ({ id, name, category, priority,
    role: `${name}服务于咖啡消费场景`, design: `${name}以角色技能的形状和色彩组织设计`, ipExpression: '把角色招式转译成清晰的图形节奏',
    dependencies, variants, feasibility: '尺寸、工艺和成本需打样确认' });
  return session({ completedSkills: ['design-spec'], selectedConceptId: 'coffee-game', concepts: [{ id: 'coffee-game', title: '角色咖啡体验' }],
    brands: [{ id: 'a', name: 'Manner', description: '咖啡品牌', files: [] }, { id: 'b', name: '游戏 IP', description: '角色与技能风格', files: [] }],
    proposal: { sections: [{ skill: 'design-spec', content: '围绕咖啡产品的已保存设计原则' }], materialPlan: {
      productAnchor: { brandId: 'a', category: '咖啡饮品', coreProduct: '角色特调咖啡', rationale: '让游戏角色特点进入饮品与购买体验', ipAssets: ['角色技能', '角色配色'], translation: '风味层次对应技能节奏，包装保持咖啡品牌辨识度' },
      scopeNote: '先讨论核心饮品与包装，再从传播和周边中选择制作范围。',
      items: [item('coffee', '技能特调咖啡', 'product', 'core'), item('cup', '角色咖啡杯', 'packaging', 'core', ['coffee']),
        item('poster', '联名主海报', 'communication', 'recommended', ['coffee', 'cup'], ['角色 A 版', '角色 B 版', '竖版与横版']),
        item('badge', '角色徽章', 'merchandise', 'optional'), item('counter', '门店取杯台卡', 'experience', 'optional', ['poster'])],
    } }, ...overrides });
}

function materialNodes(project) {
  return project.nodes.filter(node => node.id.startsWith('material-'));
}

test('idle or unstarted sessions have an empty canvas, without export or future placeholders', () => {
  for (const status of ['idle', 'paused']) {
    const project = sessionProduction(session({ status, messages: [{ kind: 'notice', role: 'system', content: '会话已创建', revision: 2 }] }));
    assert.deepEqual(project.nodes, []);
    assert.deepEqual(project.edges, []);
    assert.deepEqual(project.assets, []);
    assert.equal(project.nodeCount, 0); assert.equal(project.assetCount, 0);
    assert.equal(project.workflow, undefined);
  }
});

test('a real first controller dispatch visualizes the brief before any specialist starts', () => {
  const project = sessionProduction(session({ status: 'running', messages: [dispatch('running')] }));
  const brief = project.nodes.find(node => node.id === 'workflow-brief');
  assert.equal(brief.status, 'running');
  assert.match(brief.content, /品牌体验/); assert.match(brief.content, /新标准/);
  assert.doesNotMatch(brief.content, /已保存的交接要求|研究报告已完成/);
  assert.equal(project.nodes.some(node => node.id === 'brand-profile'), false);
  assert.equal(project.workflow.phase, 'orchestrator');
  assert.equal(project.workflow.status, 'running');
  assert.equal(project.workflow.currentNodeId, 'workflow-brief');
  assert.equal(project.workflow.currentStepId, 'profile-a');
  assert.equal(project.workflow.completedSteps, 0); assert.equal(project.workflow.totalSteps, 9);
  assert.ok(project.workflow.steps.every(step => step.status === 'pending' && !step.nodeId));
  assertValidEdges(project);
});

test('failed and interrupted controller calls retain a visible brief without fake research', () => {
  for (const [status, state, expected] of [['error', 'failed', 'failed'], ['paused', 'interrupted', 'paused']]) {
    const entry = dispatch('error', { detail: '连接中断，交接未提交' }); entry.execution.state = state;
    const project = sessionProduction(session({ status, messages: [entry] }));
    const brief = project.nodes.find(node => node.id === 'workflow-brief');
    assert.equal(brief.status, expected === 'failed' ? 'failed' : 'planned');
    assert.equal(project.workflow.status, expected); assert.equal(project.workflow.phase, 'orchestrator');
    assert.equal(project.workflow.currentNodeId, brief.id);
    assert.equal(project.workflow.completedSteps, 0);
    assert.equal(project.nodes.some(node => node.id === 'brand-profile'), false);
    assert.equal(project.assets.length, 0);
  }
});

test('validated controller handoffs become readable content and specialist execution owns subsequent progress', () => {
  const project = sessionProduction(session({ status: 'running', activeSkill: 'brand-profile', messages: [
    dispatch('done', { content: '请核对品牌资源的来源。', artifact: { section: '引用原始资料，列出证据与未知项。' } }),
    { ...imageCall('running'), id: 'research-call', role: 'a', skill: 'brand-profile', content: '研究 Agent · A 正在品牌解读' },
  ] }));
  const brief = project.nodes.find(node => node.id === 'workflow-brief');
  assert.equal(brief.status, 'available'); assert.match(brief.content, /引用原始资料，列出证据与未知项/);
  assert.equal(project.workflow.phase, 'specialist'); assert.equal(project.workflow.currentNodeId, 'brand-profile');
  assert.equal(project.workflow.steps[0].status, 'running'); assert.equal(project.workflow.steps[1].status, 'pending');
  assertValidEdges(project);
});

test('a second researcher interruption preserves the first committed report and its completed step', () => {
  const interrupted = { ...imageCall('error'), role: 'b', skill: 'brand-profile', detail: '本次研究中止',
    execution: { state: 'interrupted' } };
  const project = sessionProduction(session({ status: 'paused', messages: [
    ...call('brand-profile', 2, 'a', '研究已提交', { section: 'A 的真实已保存研究内容' }), interrupted,
  ] }));
  const research = project.nodes.find(node => node.id === 'brand-profile');
  assert.equal(research.status, 'available'); assert.match(research.statusLabel, /部分成果已保存.*已暂停/);
  assert.match(research.content, /A 的真实已保存研究内容/);
  assert.equal(project.workflow.completedSteps, 1);
  assert.equal(project.workflow.steps[0].status, 'completed'); assert.equal(project.workflow.steps[1].status, 'paused');
  assert.equal(project.workflow.currentStepId, 'profile-b');
});

test('a failed second researcher does not replace the successful first report with a failed artifact', () => {
  const project = sessionProduction(session({ status: 'error', messages: [
    ...call('brand-profile', 2, 'a', '研究已提交', { section: 'A 的真实已保存研究内容' }),
    { ...imageCall('error'), role: 'b', skill: 'brand-profile', detail: 'B 连接失败' },
  ] }));
  const research = project.nodes.find(node => node.id === 'brand-profile');
  assert.equal(research.status, 'available'); assert.match(research.statusLabel, /部分成果已保存.*失败/);
  assert.match(research.content, /A 的真实已保存研究内容/);
  assert.equal(project.workflow.status, 'failed'); assert.equal(project.workflow.currentStepId, 'profile-b');
  assert.equal(project.workflow.completedSteps, 1);
});

test('new revision hides obsolete controller handoffs while retained stages count as completed', () => {
  const project = sessionProduction(session({ revision: 3, status: 'running', completedSkills: ['brand-profile'], messages: [
    dispatch('done', { artifact: { section: '上一版已失效的交接' } }),
    dispatch('running', { id: 'new-dispatch', revision: 3, content: '主控正在依据新标准交接创意任务' }),
  ] }));
  assert.doesNotMatch(JSON.stringify(project), /上一版已失效的交接/);
  assert.equal(project.workflow.completedSteps, 2); assert.equal(project.workflow.currentStepId, 'ideation-a');
  assert.equal(project.workflow.currentNodeId, 'workflow-brief');
  assert.equal(project.nodes.find(node => node.id === 'brand-profile').status, 'available');
});

test('selection and final handoff expose bounded progress without treating future work as completed', () => {
  const awaiting = sessionProduction(session({ status: 'awaiting_selection', completedSkills: ['brand-profile', 'collab-ideation'] }));
  assert.equal(awaiting.workflow.status, 'awaiting_selection'); assert.equal(awaiting.workflow.phase, 'selection');
  assert.equal(awaiting.workflow.completedSteps, 4); assert.equal(awaiting.workflow.totalSteps, 9);
  assert.equal(awaiting.workflow.currentStepId, 'ideation-b');
  assert.ok(awaiting.workflow.steps.slice(4).every(step => step.status === 'pending'));
  const completed = sessionProduction(session({ status: 'completed', selectedConceptId: 'concept-1',
    completedSkills: ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production', 'quality-review'] }));
  assert.equal(completed.workflow.completedSteps, 9); assert.equal(completed.workflow.totalSteps, 9);
  assert.equal(completed.workflow.phase, 'finished'); assert.equal(completed.workflow.status, 'completed');
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

test('completed design exposes distinct product, packaging, communication and merchandise candidates with a shared product anchor', () => {
  const project = sessionProduction(materialSession());
  const candidates = materialNodes(project);
  assert.equal(candidates.length, 5);
  for (const [id, category, priority] of [['coffee', '主营产品', '核心项'], ['cup', '包装与随附', '核心项'], ['poster', '传播物料', '推荐项'], ['badge', '延伸周边', '可选项'], ['counter', '场景与体验', '可选项']]) {
    const node = project.nodes.find(node => node.id === `material-${id}`);
    assert.equal(node.kind, 'material'); assert.equal(node.lane, 'materials');
    assert.ok(node.title.startsWith(category)); assert.ok(node.tags.includes(category)); assert.ok(node.tags.includes(priority));
    assert.equal(node.status, 'planned'); assert.match(node.statusLabel, /候选.*待选定/);
    assert.match(node.content, /Manner · 角色特调咖啡/);
    assert.match(node.content, /用途与消费者价值/); assert.match(node.content, /合作资产与设计转译/); assert.match(node.content, /执行条件/);
    assert.match(node.content, /打样确认/); assert.deepEqual(node.assetIds, []);
    assert.equal(node.primaryAssetId, undefined);
  }
  assertValidEdges(project);
});

test('joint product anchors display both partner names and preserve non-IP design assets', () => {
  const base = materialSession({ brands: [
    { id: 'a', name: '首饰工作室', description: '几何首饰设计', files: [] },
    { id: 'b', name: '陶艺工坊', description: '陶瓷与釉面工艺', files: [] },
  ] });
  base.proposal.materialPlan = {
    productAnchor: { brandId: 'both', category: '首饰', coreProduct: '陶瓷吊坠', rationale: '共同开发佩戴产品。',
      ipAssets: ['几何首饰造型', '陶瓷釉面工艺'], translation: '将几何镶座与釉面陶瓷结合成吊坠。' },
    scopeNote: '先选主产品，包装在后续范围中讨论。',
    items: [{ id: 'pendant', name: '陶瓷吊坠', category: 'product', priority: 'core', role: '日常佩戴',
      design: '几何镶座包覆陶瓷主体，展示釉面的色彩与质感。', ipExpression: '首饰造型与陶瓷工艺共同形成外观。',
      dependencies: [], variants: [], feasibility: '尺寸、材质及制作工艺待确认。' }],
  };
  const project = sessionProduction(base);
  const overview = project.nodes.find(node => node.id === 'design-spec');
  const pendant = project.nodes.find(node => node.id === 'material-pendant');
  for (const node of [overview, pendant]) {
    assert.match(node.content, /首饰工作室 × 陶艺工坊 · 陶瓷吊坠/);
    assert.match(node.content, /合作资产与设计转译/);
    assert.match(node.content, /几何首饰造型、陶瓷釉面工艺/);
    assert.doesNotMatch(node.content, /品牌 BOTH|IP 资产与转译|IP 特征转译/);
  }
  assert.equal(materialNodes(project).length, 1);
  assertValidEdges(project);
});

test('a service-only material plan stays a core experience without fabricated physical candidates', () => {
  const base = materialSession();
  base.proposal.materialPlan = {
    productAnchor: { brandId: 'both', category: '数字导览服务', coreProduct: '声音导览', rationale: '以内容和听音服务共同组织导览体验。',
      ipAssets: ['展览内容', '音频播放与导览服务'], translation: '将展览主题分为可点选的听音内容和路线。' },
    scopeNote: '本案是线上服务，不增加实体包装与周边。',
    items: [{ id: 'guide', name: '声音导览', category: 'experience', priority: 'core', role: '帮助观众理解展览主题',
      design: '导览界面展示分段音频和游览路线。', ipExpression: '展览内容与听音服务共同形成可用的导览路径。',
      dependencies: [], variants: [], feasibility: '内容来源、开发与服务资源待确认。' }],
  };
  const project = sessionProduction(base), candidates = materialNodes(project);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].tags.slice(0, 2), ['场景与体验', '核心项']);
  assert.match(candidates[0].content, /导览界面展示分段音频和游览路线/);
  assert.equal(project.assets.length, 0);
  assertValidEdges(project);
});

test('focused poster delivery shows only requested items and labels the product as existing context', () => {
  const base = materialSession();
  const plan = base.proposal.materialPlan;
  plan.deliveryScope = 'focused_deliverables';
  plan.scopeNote = '用户只需要两张不同用途的数字海报，沿用既有产品。';
  plan.items = ['首发介绍', '点单说明'].map((name, index) => ({ ...plan.items[2],
    id: `poster-${index}`, name, dependencies: [], variants: [] }));
  const project = sessionProduction(base), candidates = materialNodes(project);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(node => node.tags[0]), ['传播物料', '传播物料']);
  assert.ok(candidates.every(node => node.content.includes('既有核心 · 本轮限定范围')));
  assert.equal(project.nodes.some(node => node.id === 'material-coffee'), false);
  assert.equal(project.assets.length, 0);
  assertValidEdges(project);
});

test('design overview counts candidates without duplicating their full specifications or variants', () => {
  const project = sessionProduction(materialSession());
  const overview = project.nodes.find(node => node.id === 'design-spec').content;
  assert.match(overview, /围绕咖啡产品的已保存设计原则/);
  assert.match(overview, /共 5 项独立物料候选/);
  assert.match(overview, /主营产品 1 项.*包装与随附 1 项.*传播物料 1 项/);
  assert.match(overview, /核心项 2 项.*推荐项 1 项.*可选项 2 项/);
  assert.match(overview, /先讨论核心饮品与包装/);
  assert.doesNotMatch(overview, /联名主海报服务于|角色 A 版|尺寸、工艺和成本需打样确认/);
  const poster = project.nodes.find(node => node.id === 'material-poster');
  assert.match(poster.content, /角色 A 版；角色 B 版；竖版与横版/);
  assert.equal(materialNodes(project).length, 5);
  assert.equal(project.nodes.some(node => node.kind === 'image'), false);
  assert.equal(project.assets.some(asset => asset.kind === 'image'), false);
});

test('material dependency edges connect actual candidate nodes and do not create missing material placeholders', () => {
  const base = materialSession();
  base.proposal.materialPlan.items[2].dependencies.push('cup', 'not-in-plan', 'poster');
  const project = sessionProduction(base);
  assert.ok(project.edges.some(edge => edge.source === 'design-spec' && edge.target === 'material-coffee' && edge.label === '物料候选'));
  assert.ok(project.edges.some(edge => edge.source === 'material-coffee' && edge.target === 'material-cup' && edge.label === '设计依赖'));
  assert.equal(project.edges.filter(edge => edge.source === 'material-cup' && edge.target === 'material-poster').length, 1);
  assert.equal(project.edges.some(edge => edge.source === edge.target), false);
  assert.equal(project.nodes.some(node => node.id === 'material-not-in-plan'), false);
  assertValidEdges(project);
});

test('invalidated, partial and unselected designs never resurrect old material plans', () => {
  for (const overrides of [
    { completedSkills: ['brand-profile'] },
    { completedSkills: ['brand-profile'], status: 'running', activeSkill: 'design-spec' },
    { selectedConceptId: undefined }, { selectedConceptId: 'removed-direction' },
    { status: 'idle' },
  ]) {
    const project = sessionProduction(materialSession(overrides));
    assert.deepEqual(materialNodes(project), []);
    assert.doesNotMatch(JSON.stringify(project), /角色特调咖啡|技能特调咖啡|物料候选总览/);
    assertValidEdges(project);
  }
});

test('a retained design survives copy-only revisions while obsolete visual prompts stay hidden', () => {
  const base = materialSession({ revision: 3, messages: call('design-spec', 2, 'b', '有效且保留的产品设计') });
  base.proposal.materialVisuals = [{ materialId: 'poster', prompt: '旧版发布文案与旧海报视觉提示词' }];
  const project = sessionProduction(base);
  assert.equal(materialNodes(project).length, 5);
  assert.doesNotMatch(JSON.stringify(project), /旧版发布文案与旧海报视觉提示词/);
  assert.ok(project.nodes.find(node => node.id === 'material-poster').tags.includes('v3'));
});

test('completed single-item visual prompts remain plans and attach only to their matching material', () => {
  const base = materialSession({ completedSkills: ['design-spec', 'visual-production'] });
  base.proposal.materialVisuals = [{ materialId: 'poster', prompt: '咖啡产品为主角的海报单件效果图' }, { materialId: 'obsolete', prompt: '过期物料的视觉提示词' }];
  const project = sessionProduction(base);
  const poster = project.nodes.find(node => node.id === 'material-poster');
  assert.match(poster.content, /单件效果图提示词 · 待生成/);
  assert.match(poster.content, /咖啡产品为主角的海报单件效果图/);
  assert.equal(poster.status, 'planned'); assert.deepEqual(poster.assetIds, []);
  assert.doesNotMatch(project.nodes.find(node => node.id === 'material-cup').content, /咖啡产品为主角的海报单件效果图/);
  assert.doesNotMatch(JSON.stringify(project), /过期物料的视觉提示词/);
  assert.equal(project.assets.some(asset => asset.kind === 'image'), false);
  assert.equal(project.nodes.some(node => node.kind === 'image'), false);
});

test('historical sessions without a structured material plan retain their saved design report', () => {
  const project = sessionProduction(materialSession({ proposal: { sections: [{ skill: 'design-spec', content: '历史自由文本设计方案' }] } }));
  assert.match(project.nodes.find(node => node.id === 'design-spec').content, /历史自由文本设计方案/);
  assert.deepEqual(materialNodes(project), []);
  assert.doesNotMatch(JSON.stringify(project), /物料候选总览/);
  assertValidEdges(project);
});

test('thirty material candidates fit the existing canvas grid with no overlapping cards or invented assets', () => {
  const base = materialSession();
  const examples = base.proposal.materialPlan.items;
  base.proposal.materialPlan.items = Array.from({ length: 30 }, (_, index) => ({ ...examples[index % examples.length], id: `item-${index + 1}`, name: `独立物料 ${index + 1}`, dependencies: [] }));
  const project = sessionProduction(base);
  const candidates = materialNodes(project);
  const positions = arrangeInfiniteNodes(project.nodes);
  assert.equal(candidates.length, 30);
  assert.equal(Object.keys(positions).length, project.nodes.length);
  const designNodes = project.nodes.filter(node => node.lane === 'materials');
  for (const [index, node] of designNodes.entries()) {
    const point = positions[node.id];
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    for (const other of designNodes.slice(index + 1)) {
      const next = positions[other.id];
      assert.ok(Math.abs(point.x - next.x) >= CANVAS_CARD_WIDTH || Math.abs(point.y - next.y) >= CANVAS_CARD_HEIGHT, `${node.id} overlaps ${other.id}`);
    }
  }
  assert.equal(project.assets.length, 0);
  assertValidEdges(project);
});

test('parallel media and retry notices do not hide saved research before proposal assembly', () => {
  const [stage, reply] = call('brand-profile', 2, 'a', '真实品牌研究摘要', { section: '实际已保存的品牌研究内容' });
  stage.execution = { runId: 'research-run' };
  reply.execution = { runId: 'research-run' };
  const project = sessionProduction(session({ completedSkills: ['brand-profile'], messages: [stage,
    { kind: 'notice', role: 'system', revision: 2, content: '本步骤自动恢复一次' },
    { kind: 'skill', role: 'system', skill: 'brand-profile', revision: 2, status: 'running', content: '并行素材核对' }, reply] }));
  const node = project.nodes.find(node => node.id === 'brand-profile');
  assert.match(node.content, /实际已保存的品牌研究内容/);
  assert.doesNotMatch(node.summary, /结果将在保存后/);
});

test('a reply from another execution cannot be attached to a completed stage', () => {
  const [stage, reply] = call('brand-profile', 2, 'a', '不属于此执行的内容', { section: '错误关联内容' });
  stage.execution = { runId: 'first-run' }; reply.execution = { runId: 'other-run' };
  const project = sessionProduction(session({ messages: [stage, reply] }));
  assert.doesNotMatch(project.nodes.find(node => node.id === 'brand-profile').content || '', /错误关联内容/);
});
