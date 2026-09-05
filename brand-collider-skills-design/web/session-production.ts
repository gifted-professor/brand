import { SKILLS, type Session } from '../src/collider-types.ts';
import type { ProductionProject, ProductionNode } from '../src/production-types.ts';
import { hasCurrentSessionImage, latestSessionImageCall, sessionHasProgress, skillLane } from './workflow-stage.ts';

const lanes: ProductionProject['lanes'] = [
  { id: 'strategy', label: '品牌与方案', description: '品牌资料与已讨论的联名方向' },
  { id: 'story', label: '故事与传播', description: '主题、故事和传播表达' },
  { id: 'materials', label: '设计与物料', description: '产品、体验与执行规格' },
  { id: 'media', label: '视觉素材', description: '制作计划和已生成图片' },
  { id: 'video', label: '视频制作', description: '后续分镜与成片' },
  { id: 'review', label: '检查与交付', description: '方案缺口及已保存交付' },
];

export function sessionProduction(session: Session): ProductionProject {
  const nodes: ProductionNode[] = [];
  const edges: ProductionProject['edges'] = [];
  const assets: ProductionProject['assets'] = [];
  const hasProgress = sessionHasProgress(session);
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
    const active = session.activeSkill === skill.id && (session.status === 'running' || session.status === 'paused');
    if (!done && !active && !calls.length) continue;

    // Proposal has no revision field. Only stages explicitly retained/completed
    // by the runtime may use its sections/cards; partial stages use current calls.
    const section = done ? session.proposal?.sections.find(section => section.skill === skill.id) : undefined;
    const stageReplies = latestCalls.flatMap(message => {
      const index = session.messages.indexOf(message);
      const next = session.messages[index + 1];
      return next?.kind === 'message' && next.role === message.role && next.revision === message.revision
        ? [next] : [];
    });
    const card = (done ? session.proposal?.cards?.find(card => card.skill === skill.id) : undefined)
      || stageReplies.findLast(reply => reply.artifact?.card)?.artifact?.card;
    const stageContent = stageReplies.map(reply => {
      const label = `${session.brands.find(brand => brand.id === reply.role)?.name || reply.role} · v${reply.revision}`;
      return reply.artifact?.section ? `### ${label}\n\n${reply.artifact.section}` : `阶段公开讨论摘要 · ${label}\n\n${reply.content}`;
    }).join('\n\n---\n\n');
    const content = section?.content || (skill.id === 'collab-ideation' && done
      ? session.concepts.map(concept => `### ${concept.title}${concept.id === session.selectedConceptId ? '（当前方向）' : ''}\n${concept.description}\n\n${concept.contributionA}\n${concept.contributionB}\n\n消费者价值：${concept.consumerValue}`).join('\n\n') : '')
      || stageContent;
    const running = active || latestCall?.status === 'running';
    const failed = !running && !done && latestCall?.status === 'error';
    const needsRevision = skill.id === 'quality-review' && done && session.proposal?.reviewStatus === 'needs_revision';
    nodes.push({ id: skill.id,
      kind: skill.id === 'collab-ideation' ? 'concept' : skill.id === 'campaign-copy' ? 'story' : skill.id === 'quality-review' ? 'review' : skill.id === 'design-spec' ? 'material' : 'document',
      lane: skillLane[skill.id], title: card?.title || skill.name,
      summary: failed ? latestCall?.detail || '这一阶段未完成，可在对话中重试。' : card?.summary || content.slice(0, 160) || `正在${skill.name}，结果将在保存后出现在这里。`,
      status: running ? 'running' : failed ? 'failed' : needsRevision ? 'needs_revision' : 'available',
      statusLabel: running ? `${skill.name}进行中` : failed ? '本次调用失败' : needsRevision ? '需要修订' : done
        ? (skill.id === 'visual-production' ? '视觉计划已生成' : skill.id === 'quality-review' ? '见具体检查意见' : '阶段产出已保存') : '阶段讨论已保存',
      ...(content ? { content } : {}), assetIds: [],
      sources: [{ label: `${skill.name}${latestCall?.model ? ` · ${latestCall.model}` : ' · 模型未记录'}` }], tags: [skill.name, `v${session.revision}`] });
  }
  const savedStages = nodes.filter(node => node.kind !== 'brief' && node.content);
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
  const nodeIds = new Set(nodes.map(node => node.id));
  const connect = (source: string, target: string, label: string) => {
    if (nodeIds.has(source) && nodeIds.has(target)) edges.push({ id: `${source}-to-${target}`, source, target, label });
  };
  connect('brand-a', 'brand-profile', '品牌资料');
  connect('brand-b', 'brand-profile', '品牌资料');
  SKILLS.slice(1).forEach((skill, index) => connect(SKILLS[index].id, skill.id, '阶段上下文'));
  connect('visual-production', 'generated-image', '根据视觉计划生成');
  const exportSource = hasImage ? 'generated-image' : savedStages.at(-1)?.id;
  if (exportSource) connect(exportSource, 'export', '已保存记录');
  return { id: `session:${session.id}`, title: session.title, brandNames: [session.brands[0].name, session.brands[1].name], summary: session.goal, updatedAt: session.updatedAt,
    nodeCount: nodes.length, assetCount: assets.length, selectionStatus: session.selectedConceptId ? 'selected' : 'unselected', lanes, nodes, edges, assets,
    notes: [session.mode === 'demo' ? '这是明确标注的固定流程演示。' : '来自本地品牌对话的真实保存记录。', '画布按当前进度展示；图片只在真实请求开始后出现，生成结果与审查状态分别记录。'] };
}
