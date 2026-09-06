import { sessionVideoArtifacts } from './session-video.ts';
import { SKILLS, type Session } from '../src/collider-types.ts';
import { MATERIAL_CATEGORIES, MATERIAL_PRIORITIES, materialItemMarkdown, type MaterialPlan } from '../src/material-plan.ts';
import type { ProductionProject, ProductionNode } from '../src/production-types.ts';
import { hasCurrentSessionImage, isSessionOrchestratorCurrent, latestSessionImageCall, latestSessionOrchestratorCall, sessionHasProgress, sessionWorkflow, skillLane } from './workflow-stage.ts';
import { currentSessionAutomation, isSessionMediaComplete, mediaProgressLabel, sessionAutomationArtifacts } from './session-automation.ts';

const lanes: ProductionProject['lanes'] = [
  { id: 'strategy', label: '品牌与方案', description: '品牌资料与已讨论的联名方向' },
  { id: 'story', label: '故事与传播', description: '主题、故事和传播表达' },
  { id: 'materials', label: '设计与物料', description: '产品、体验与执行规格' },
  { id: 'media', label: '视觉素材', description: '制作计划和已生成图片' },
  { id: 'video', label: '视频制作', description: '后续分镜与成片' },
  { id: 'review', label: '检查与交付', description: '方案缺口及已保存交付' },
];

function productAnchorMarkdown(session: Session, plan: MaterialPlan): string {
  const anchor = plan.productAnchor;
  const brandName = anchor.brandId === 'both'
    ? session.brands.map(brand => brand.name || `品牌 ${brand.id.toUpperCase()}`).join(' × ')
    : session.brands.find(brand => brand.id === anchor.brandId)?.name || `品牌 ${anchor.brandId.toUpperCase()}`;
  return [`**${plan.deliveryScope === 'focused_deliverables' ? '既有核心 · 本轮限定范围' : '核心产品与体验'}**\n${brandName} · ${anchor.coreProduct}（${anchor.category}）`,
    anchor.rationale, `**合作资产与设计转译**\n${anchor.ipAssets.join('、')}\n${anchor.translation}`].join('\n\n');
}

function materialOverviewMarkdown(session: Session, plan: MaterialPlan): string {
  const categories = Object.entries(MATERIAL_CATEGORIES).map(([id, label]) => ({ label, count: plan.items.filter(item => item.category === id).length }));
  const priorities = Object.entries(MATERIAL_PRIORITIES).map(([id, label]) => ({ label, count: plan.items.filter(item => item.priority === id).length }));
  const counts = (entries: { label: string; count: number }[]) => entries.filter(entry => entry.count > 0).map(entry => `${entry.label} ${entry.count} 项`).join(' · ');
  return ['## 物料候选总览', productAnchorMarkdown(session, plan), plan.scopeNote,
    `共 ${plan.items.length} 项独立物料候选。款式、配色、尺寸与画幅变体保留在对应物料中，未重复计数。`,
    counts(categories), counts(priorities),
    session.autoProduce ? '每件物料可在画布中单独查看设计、用途和执行条件。制作范围、参考图绑定、生成与验收进度会自动加入后续节点，可继续补充标准。'
      : '每件物料可在画布中单独查看设计、用途和执行条件，并继续讨论。优先级是制作建议；候选尚未选定，效果图需另行生成。'].join('\n\n');
}

export function sessionProduction(session: Session): ProductionProject {
  const nodes: ProductionNode[] = [];
  const edges: ProductionProject['edges'] = [];
  const assets: ProductionProject['assets'] = [];
  const hasProgress = sessionHasProgress(session);
  const automation = currentSessionAutomation(session);
  const dispatch = hasProgress ? latestSessionOrchestratorCall(session) : undefined;
  const orchestrating = hasProgress && isSessionOrchestratorCurrent(session);
  if (dispatch) {
    const running = dispatch.status === 'running' && session.status === 'running';
    const paused = dispatch.execution?.state === 'interrupted' || (orchestrating && session.status === 'paused');
    const failed = !paused && dispatch.status === 'error';
    const savedHandoff = session.messages.findLast(message => message.kind === 'notice' && message.agentRole === 'orchestrator'
      && message.revision === session.revision && message.status === 'done' && message.artifact?.section);
    const content = [
      `## 共同简报 · v${session.revision}\n\n**合作双方**\n${session.brands.map(brand => brand.name).join(' × ')}`,
      `**用户目标**\n${session.goal || '尚未填写目标'}`,
      `**当前标准**\n${session.constraints.length ? session.constraints.map(standard => `- ${standard}`).join('\n') : '尚未补充额外标准。'}`,
      `**当前交接状态**\n${paused ? '已暂停；未完成的交接尚未提交。' : failed ? dispatch.detail || '主控交接未完成。' : dispatch.content}`,
      savedHandoff ? `## ${savedHandoff === dispatch ? '已保存的交接要求' : '本版上一份已保存交接'}\n\n${savedHandoff.artifact!.section}` : '',
    ].filter(Boolean).join('\n\n');
    nodes.push({ id: 'workflow-brief', kind: 'brief', lane: 'strategy', title: `共同简报与任务交接 · v${session.revision}`,
      summary: paused ? '主控交接已暂停，用户目标与当前标准已保留。' : failed ? dispatch.detail || '主控交接未完成，可继续重试。' : dispatch.content,
      status: running ? 'running' : paused ? 'planned' : failed ? 'failed' : 'available',
      statusLabel: running ? '主控正在整理简报' : paused ? '交接已暂停' : failed ? '本次交接未完成' : '交接说明已保存',
      content, assetIds: [], sources: [{ label: '用户目标与当前标准' }, { label: `联名总策划${dispatch.model ? ` · ${dispatch.model}` : ''}` }],
      tags: ['主控', `v${session.revision}`], displayOrder: -1 });
  }
  // A retained completed design may survive a copy-only revision. A partial or
  // invalidated design must never revive its previous proposal's candidates.
  const materialPlan = hasProgress && session.completedSkills.includes('design-spec')
    && session.concepts.some(concept => concept.id === session.selectedConceptId)
    && session.proposal?.sections.some(section => section.skill === 'design-spec')
    ? session.proposal.materialPlan : undefined;
  const materialVisuals = session.completedSkills.includes('visual-production') ? session.proposal?.materialVisuals : undefined;
  if (hasProgress) {
    for (const brand of session.brands) {
      if (!brand.description.trim() && !brand.files.some(file => file.text.trim())) continue;
      nodes.push({ id: `brand-${brand.id}`, kind: 'brief', lane: 'strategy', title: brand.name,
        summary: brand.description, status: 'available', statusLabel: '用户提供资料',
        content: [brand.description, ...brand.files.map(file => `### ${file.name}\n${file.text}`)].filter(Boolean).join('\n\n'),
        assetIds: [], sources: brand.files.map(file => ({ label: file.name })), tags: ['品牌资料'] });
    }
  }
  for (const skill of hasProgress ? SKILLS : []) {
    const done = session.completedSkills.includes(skill.id);
    const calls = session.messages.filter(message => message.kind === 'skill' && message.skill === skill.id
      && message.role !== 'system' && (message.revision === session.revision || (done && message.status === 'done')));
    const latestCall = calls.at(-1);
    const validCalls = calls.filter(message => message.status === 'done');
    const latestCalls = validCalls.filter((call, index) => !validCalls.slice(index + 1).some(next => next.role === call.role));
    const active = !orchestrating && session.activeSkill === skill.id && (session.status === 'running' || session.status === 'paused');
    if (!done && !active && !calls.length) continue;

    // Proposal has no revision field. Only stages explicitly retained/completed
    // by the runtime may use its sections/cards; partial stages use current calls.
    const section = done ? session.proposal?.sections.find(section => section.skill === skill.id) : undefined;
    const stageReplies = latestCalls.flatMap(message => {
      const index = session.messages.indexOf(message);
      // Parallel collection and retry notices can land between a stage call
      // and its saved reply. Pair by execution identity, not array adjacency.
      const following = session.messages.slice(index + 1);
      const boundary = following.findIndex(next => next.kind === 'skill' && next.role === message.role && next.skill === message.skill);
      const candidates = boundary < 0 ? following : following.slice(0, boundary);
      const reply = candidates.find(next => next.kind === 'message' && next.role === message.role
        && next.revision === message.revision && (!next.skill || next.skill === message.skill)
        && (!message.execution?.runId || next.execution?.runId === message.execution.runId));
      return reply ? [reply] : [];
    });
    const card = (done ? session.proposal?.cards?.find(card => card.skill === skill.id) : undefined)
      || stageReplies.findLast(reply => reply.artifact?.card)?.artifact?.card;
    const stageContent = stageReplies.map(reply => {
      const label = `${session.brands.find(brand => brand.id === reply.role)?.name || reply.role} · v${reply.revision}`;
      return reply.artifact?.section ? `### ${label}\n\n${reply.artifact.section}` : `阶段公开讨论摘要 · ${label}\n\n${reply.content}`;
    }).join('\n\n---\n\n');
    let content = section?.content || (skill.id === 'collab-ideation' && done
      ? session.concepts.map(concept => `### ${concept.title}${concept.id === session.selectedConceptId ? '（当前方向）' : ''}\n${concept.description}\n\n${concept.contributionA}\n${concept.contributionB}\n\n消费者价值：${concept.consumerValue}`).join('\n\n') : '')
      || stageContent;
    if (skill.id === 'design-spec' && materialPlan) content = [content, materialOverviewMarkdown(session, materialPlan)].filter(Boolean).join('\n\n---\n\n');
    const running = session.status === 'running' && (active || latestCall?.status === 'running');
    const paused = !done && !running && (latestCall?.execution?.state === 'interrupted'
      || (session.status === 'paused' && (active || latestCall?.status === 'running' || latestCall?.status === 'error')));
    const failed = !running && !paused && !done && latestCall?.status === 'error';
    const partial = !done && Boolean(stageContent);
    const mediaPending = skill.id === 'visual-production' && Boolean(automation) && !isSessionMediaComplete(session);
    const mediaRunning = mediaPending && session.status === 'running' && ['generating', 'reviewing'].includes(automation!.phase);
    const needsRevision = skill.id === 'quality-review' && done && session.proposal?.reviewStatus === 'needs_revision';
    nodes.push({ id: skill.id,
      kind: skill.id === 'collab-ideation' ? 'concept' : skill.id === 'campaign-copy' ? 'story' : skill.id === 'quality-review' ? 'review' : skill.id === 'design-spec' ? 'material' : 'document',
      lane: skillLane[skill.id], title: card?.title || skill.name,
      summary: failed && !partial ? latestCall?.detail || '这一阶段未完成，可在对话中重试。' : card?.summary || content.slice(0, 160)
        || (paused ? '本阶段已暂停，尚无已提交成果。' : `正在${skill.name}，结果将在保存后出现在这里。`),
      status: running || mediaRunning ? 'running' : failed && !partial ? 'failed' : paused && !partial ? 'planned' : needsRevision || (mediaPending && automation?.phase === 'partial') ? 'needs_revision' : 'available',
      statusLabel: mediaPending && done ? mediaProgressLabel(session) : running ? `${skill.name}进行中` : failed ? partial ? '部分成果已保存 · 后续调用失败' : '本次调用失败'
        : paused ? partial ? '部分成果已保存 · 已暂停' : '阶段已暂停' : needsRevision ? '需要修订' : done
        ? (skill.id === 'visual-production' ? automation && isSessionMediaComplete(session) ? '范围内图像与验收已完成' : '视觉计划已生成' : skill.id === 'quality-review' ? '见具体检查意见' : '阶段产出已保存') : '阶段讨论已保存',
      ...(content ? { content } : {}), assetIds: [],
      sources: [{ label: `${skill.name}${latestCall?.model ? ` · ${latestCall.model}` : ' · 模型未记录'}` }], tags: [skill.name, `v${session.revision}`] });
  }
  const savedStages = nodes.filter(node => node.kind !== 'brief' && node.content);
  if (materialPlan) {
    for (const item of materialPlan.items) {
      const category = MATERIAL_CATEGORIES[item.category];
      const priority = MATERIAL_PRIORITIES[item.priority];
      const mediaMaterial = automation?.materials.find(material => material.materialId === item.id);
      nodes.push({ id: `material-${item.id}`, kind: 'material', lane: 'materials', title: `${category} · ${item.name}`,
        summary: `${item.role}\n${item.design}`, status: mediaMaterial && mediaMaterial.status !== 'out_of_scope' ? 'available' : 'planned',
        statusLabel: mediaMaterial ? mediaMaterial.status === 'out_of_scope' ? '保留候选 · 不在本轮制作范围' : '设计已保存 · 已进入自动制作' : '物料候选 · 待选定',
        content: [productAnchorMarkdown(session, materialPlan), materialItemMarkdown(item, materialVisuals?.find(visual => visual.materialId === item.id))].join('\n\n---\n\n'),
        assetIds: [], sources: [{ label: '当前设计方案 · 物料候选清单' }], tags: [category, priority, `v${session.revision}`] });
    }
  }
  const hasImage = hasProgress && hasCurrentSessionImage(session);
  const imageCall = hasProgress ? latestSessionImageCall(session) : undefined;
  if (hasImage || imageCall) {
    if (hasImage) {
      const url = session.proposal!.imageUrl!;
      assets.push({ id: 'session-image', name: '已生成概念视觉', kind: 'image', url, downloadUrl: url, mimeType: 'image/png', size: 0 });
    }
    const running = imageCall?.status === 'running';
    const failed = imageCall?.status === 'error' && !hasImage;
    const unknown = failed && imageCall.detail?.includes('状态未知');
    nodes.push({ id: 'generated-image', kind: 'image', lane: 'media', title: '联名概念视觉',
      summary: running ? '图像 Agent 正在生成，保存后会在此显示图片。' : failed ? imageCall.detail || '图像生成失败，尚无可用图片。'
        : hasImage ? '本会话实际生成并保存的图片。' : '图像请求已结束，当前版本尚无已保存图片。',
      status: running ? 'running' : failed ? 'failed' : hasImage ? 'unverified' : 'failed',
      statusLabel: running ? '图片生成中' : unknown ? '生成状态未知' : failed ? '图片生成失败' : hasImage ? '已生成 · 图像待审核' : '图片尚未保存',
      assetIds: hasImage ? ['session-image'] : [], ...(hasImage ? { primaryAssetId: 'session-image' } : {}),
      ...(imageCall?.detail ? { content: imageCall.detail } : {}), sources: [{ label: '本会话图像请求' }], tags: [`v${session.revision}`] });
  }
  if ((session.status === 'completed' && savedStages.length) || hasImage) {
    const url = `/api/sessions/${session.id}/export`;
    assets.push({ id: 'session-export', name: '当前方案与对话记录.md', kind: 'document', url, downloadUrl: url, mimeType: 'text/markdown', size: 0 });
    nodes.push({ id: 'export', kind: 'document', lane: 'review', title: '当前方案与对话记录',
      summary: '导出已保存的阶段内容、当前标准与公开讨论记录。', status: 'available', statusLabel: '当前进度可导出',
      assetIds: ['session-export'], sources: [{ label: '当前保存会话' }] });
  }
  const media = sessionAutomationArtifacts(session);
  nodes.push(...media.nodes);
  assets.push(...media.assets);
  edges.push(...media.edges);
  const video = sessionVideoArtifacts(session);
  nodes.push(...video.nodes); assets.push(...video.assets); edges.push(...video.edges);
  const nodeIds = new Set(nodes.map(node => node.id));
  const connect = (source: string, target: string, label: string) => {
    if (nodeIds.has(source) && nodeIds.has(target)) edges.push({ id: `${source}-to-${target}`, source, target, label });
  };
  connect('brand-a', 'brand-profile', '品牌资料');
  connect('brand-b', 'brand-profile', '品牌资料');
  connect('workflow-brief', 'brand-profile', '共同简报');
  if (dispatch?.skill && dispatch.skill !== 'brand-profile') connect('workflow-brief', dispatch.skill, '当前交接');
  SKILLS.slice(1).forEach((skill, index) => connect(SKILLS[index].id, skill.id, '阶段上下文'));
  for (const item of materialPlan?.items || []) {
    connect('design-spec', `material-${item.id}`, '物料候选');
    for (const dependency of new Set(item.dependencies)) {
      if (dependency !== item.id) connect(`material-${dependency}`, `material-${item.id}`, '设计依赖');
    }
  }
  connect('visual-production', 'generated-image', '根据视觉计划生成');
  connect('brand-profile', 'media-references', '并行采集真实素材');
  for (const material of automation?.materials || []) {
    connect(`material-${material.materialId}`, `media-binding-${material.materialId}`, '绑定实际参考图');
    connect('visual-production', `media-material-${material.materialId}`, '逐件生成');
    connect(`media-review-${material.materialId}`, 'media-evidence', '保存验收证据');
  }
  connect('media-evidence', 'quality-review', '图像与依据进入最终审查');
  const exportSource = hasImage ? 'generated-image' : savedStages.at(-1)?.id;
  if (exportSource) connect(exportSource, 'export', '已保存记录');
  return { id: `session:${session.id}`, title: session.title, brandNames: [session.brands[0].name, session.brands[1].name], summary: session.goal, updatedAt: session.updatedAt,
    nodeCount: nodes.length, assetCount: assets.length, selectionStatus: session.selectedConceptId ? 'selected' : 'unselected', lanes, nodes, edges, assets,
    workflow: sessionWorkflow(session, nodeIds),
    notes: [session.mode === 'demo' ? '这是明确标注的固定流程演示。' : '来自本地品牌对话的真实保存记录。', '画布按当前进度展示；图片只在真实请求开始后出现，生成结果与审查状态分别记录。'] };
}
