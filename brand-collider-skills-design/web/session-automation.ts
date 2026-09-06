import type { AutomaticMediaState, MediaMaterial } from '../src/automation-types.ts';
import type { Session } from '../src/collider-types.ts';
import type { ProductionNode, ProductionProject } from '../src/production-types.ts';

export function currentSessionAutomation(session: Session | null): AutomaticMediaState | undefined {
  const state = session?.automation;
  return session?.autoProduce && state?.sessionId === session.id && state.revision === session.revision ? state : undefined;
}

export function isSessionMediaRunning(session: Session | null): boolean {
  const state = currentSessionAutomation(session);
  return Boolean(state && session?.status !== 'paused' && session?.status !== 'error'
    && ['collecting', 'binding', 'generating', 'reviewing'].includes(state.phase));
}

export function isMaterialImageApproved(material: MediaMaterial): boolean {
  return Boolean(material.imageUrl && material.outputHash && material.status === 'approved'
    && material.review?.status === 'approved' && material.review.outputHash === material.outputHash);
}

export function isSessionMediaComplete(session: Session): boolean {
  const state = currentSessionAutomation(session);
  return Boolean(state?.phase === 'completed' && state.materials.every(material => material.status === 'out_of_scope' || isMaterialImageApproved(material)));
}

export function isSessionFinalReviewPending(session: Session): boolean {
  return Boolean(session.autoProduce && session.completedSkills.includes('quality-review')
    && session.proposal?.reviewStatus && session.proposal.reviewStatus !== 'passed');
}

export function mediaProgressLabel(session: Session): string | undefined {
  const state = currentSessionAutomation(session);
  if (!state || state.phase === 'idle') return undefined;
  const active = state.materials.filter(material => material.status !== 'out_of_scope');
  const approved = active.filter(isMaterialImageApproved).length;
  const running = active.filter(material => material.status === 'running').length;
  if (state.phase === 'partial') return `${approved} / ${active.length} 件已验收，部分物料仍需补充依据或修订。`;
  if (session.status === 'paused' || state.phase === 'paused') return '素材与物料制作已暂停，已保存的参考图和结果保留。';
  if (state.phase === 'collecting') return `正在采集并核对真实素材，已保存 ${state.references.length} 张原图。`;
  if (state.phase === 'binding') return `正在为逐件物料绑定参考图，已保存 ${state.references.length} 张原图。`;
  if (state.phase === 'prepared') return '参考图绑定已保存，等待视觉制作任务就绪。';
  if (state.phase === 'generating') return `正在生成物料：${running} / ${state.concurrency} 个任务运行中，${approved} / ${active.length} 件已验收。`;
  if (state.phase === 'reviewing') return `正在对照原图验收，${approved} / ${active.length} 件已通过。`;
  return isSessionMediaComplete(session) ? `${approved} 件范围内物料已验收，来源与附图证据已保存。` : '物料结果已保存，仍有图像或验收证据待核对。';
}

export function automationProgressNode(session: Session): string | undefined {
  const state = currentSessionAutomation(session);
  if (!state || state.phase === 'idle') return undefined;
  if (['collecting', 'binding', 'prepared'].includes(state.phase)) return 'media-references';
  if (state.phase === 'reviewing') return 'media-evidence';
  const material = state.materials.find(item => item.status === 'running')
    || state.materials.find(item => ['blocked', 'unknown', 'failed', 'needs_revision', 'waiting_review'].includes(item.status))
    || state.materials.findLast(item => item.imageUrl)
    || state.materials.find(item => item.status !== 'out_of_scope');
  return material ? `media-material-${material.materialId}` : 'media-evidence';
}

const SOURCE_LABELS = { official: '官方来源', brand_approved: '品牌提供', third_party: '第三方来源', reference_only: '仅作参考', ai_generated: 'AI 生成', unknown: '来源待核实' };
const MATERIAL_LABELS: Record<MediaMaterial['status'], string> = {
  planned: '待安排制作', out_of_scope: '保留候选 · 不在本轮制作范围', ready: '参考就绪 · 待生成', blocked: '参考依据不足', running: '图片生成中', succeeded: '已生成 · 待验收',
  unknown: '生成状态待核对', failed: '本次生成失败', waiting_review: '等待依赖图验收', waiting_capacity: '等待生成名额', approved: '图像验收通过', needs_revision: '图像需要修订',
};

function materialNodeStatus(material: MediaMaterial, session: Session): ProductionNode['status'] {
  if (isMaterialImageApproved(material)) return 'available';
  if (material.status === 'needs_revision' || material.status === 'blocked') return 'needs_revision';
  if (material.status === 'failed' || material.status === 'unknown') return 'failed';
  if (material.status === 'running') return session.status === 'paused' ? 'planned' : 'running';
  return material.imageUrl ? 'unverified' : 'planned';
}

/** Render only persisted source files, requests, bindings and evidence. */
export function sessionAutomationArtifacts(session: Session): Pick<ProductionProject, 'nodes' | 'edges' | 'assets'> {
  const nodes: ProductionProject['nodes'] = [], edges: ProductionProject['edges'] = [], assets: ProductionProject['assets'] = [];
  const state = currentSessionAutomation(session);
  if (!state || state.phase === 'idle' || session.status === 'idle') return { nodes, edges, assets };
  const refById = new Map(state.references.map(reference => [reference.referenceId, reference]));
  const materialById = new Map(state.materials.map(material => [material.materialId, material]));
  const link = (source: string, target: string, label: string) => edges.push({ id: `${source}-to-${target}`, source, target, label });
  const verified = state.references.filter(reference => reference.inspection?.status === 'verified'
    && reference.inspection.imageHash === reference.contentHash && reference.inspection.sourcePageHash === reference.sourcePageContentHash).length;
  const discoveryLabels = { pending: '等待采集', running: '采集中', completed: '采集结束', failed: '采集未完成' };
  nodes.push({ id: 'media-references', kind: 'document', lane: 'strategy', title: '真实素材采集与核对',
    summary: `已保存 ${state.references.length} 张来源原图，${verified} 张通过图像与来源核对。`,
    status: state.phase === 'collecting' && session.status === 'running' ? 'running' : state.limitations.length ? 'needs_revision' : state.references.length ? 'available' : 'planned',
    statusLabel: state.phase === 'collecting' && session.status === 'running' ? '采集与核对进行中' : session.status === 'paused' ? '已保存 · 协作暂停' : '采集记录已保存',
    content: [`品牌 A：${discoveryLabels[state.discovery.a]} · 品牌 B：${discoveryLabels[state.discovery.b]}`, ...state.limitations].join('\n\n'),
    assetIds: [], sources: [{ label: '研究 Agent · 实际网页采集与原图核对' }], tags: ['真实素材', `v${session.revision}`] });
  for (const reference of state.references) {
    const id = `media-reference-${reference.referenceId}`, assetId = `${id}-image`;
    const inspection = reference.inspection;
    const checked = inspection?.imageHash === reference.contentHash && inspection.sourcePageHash === reference.sourcePageContentHash;
    if (reference.imageUrl) assets.push({ id: assetId, name: reference.title || reference.subject, kind: 'image', url: reference.imageUrl, downloadUrl: reference.imageUrl,
      mimeType: reference.mimeType, size: 0, width: reference.width, height: reference.height, sha256: reference.contentHash });
    nodes.push({ id, kind: 'image', lane: 'strategy', title: reference.title || reference.subject,
      summary: `${reference.subject}${reference.version ? ` · ${reference.version}` : ''}\n${inspection?.evidence || '已下载原图，等待图像与来源核对。'}`,
      status: checked && inspection?.status === 'verified' ? 'reference' : checked && inspection?.status === 'rejected' ? 'needs_revision' : 'unverified',
      statusLabel: checked && inspection?.status === 'verified' ? '来源原图 · 已核对' : checked && inspection?.status === 'rejected' ? '来源原图 · 不适用' : '来源原图 · 待核对',
      content: [`对象：${inspection?.subject || reference.subject}`, `版本：${inspection?.version || reference.version || '尚未核实'}`,
        `发布者：${reference.publisher || '尚未核实'}`, `来源分类${checked && inspection?.status === 'verified' ? '' : '（待核对）'}：${SOURCE_LABELS[checked && inspection ? inspection.sourceClass : reference.sourceClass]}`,
        `采集时间：${reference.retrievedAt}`, inspection?.evidence, ...(inspection?.limitations || [])].filter(Boolean).join('\n\n'),
      assetIds: reference.imageUrl ? [assetId] : [], ...(reference.imageUrl ? { primaryAssetId: assetId } : {}),
      sources: [{ label: '原始来源网页', path: reference.sourcePageUrl, sha256: reference.sourcePageContentHash },
        { label: '采集原图', path: reference.sourceImageUrl, assetId, sha256: reference.contentHash }], tags: ['真实素材', session.brands.find(brand => brand.id === reference.brandId)?.name || reference.brandId, `v${session.revision}`] });
    link('media-references', id, '已采集原图');
  }
  for (const material of state.materials) {
    const id = `media-material-${material.materialId}`, assetId = `${id}-image`, binding = material.binding;
    const approved = isMaterialImageApproved(material);
    if (material.imageUrl) assets.push({ id: assetId, name: `${material.name} · 效果图`, kind: 'image', url: material.imageUrl, downloadUrl: material.imageUrl, mimeType: 'image/png', size: 0, sha256: material.outputHash });
    const referenceIds = binding?.referenceIds.filter(id => refById.has(id)) || [];
    const sources = referenceIds.map(referenceId => { const reference = refById.get(referenceId)!; return { label: reference.title || reference.subject, path: reference.sourcePageUrl, assetId: `media-reference-${referenceId}-image`, sha256: reference.contentHash }; });
    const bindingContent = binding ? [`绑定依据：${binding.rationale}`, `身份特征：${binding.identityRequirements.join('、') || '按设计要求执行'}`,
      `参考原图：${binding.referenceIds.map(referenceId => refById.get(referenceId)?.subject || referenceId).join('、') || '未绑定'}`,
      `依赖物料：${binding.referenceTasks.map(taskId => materialById.get(taskId)?.name || taskId).join('、') || '无'}`, binding.reason].filter(Boolean).join('\n\n') : '尚未保存参考图绑定。';
    if (binding) {
      const bindingId = `media-binding-${material.materialId}`;
      nodes.push({ id: bindingId, kind: 'material', lane: 'materials', title: `${material.name} · 参考图绑定`, summary: binding.rationale,
        status: binding.status === 'ready' ? 'available' : 'needs_revision', statusLabel: binding.status === 'ready' ? '参考绑定已就绪' : '参考绑定需补充',
        content: bindingContent, assetIds: referenceIds.map(referenceId => `media-reference-${referenceId}-image`).filter(id => assets.some(asset => asset.id === id)), sources, tags: ['参考图绑定', `v${session.revision}`] });
      for (const referenceId of referenceIds) link(`media-reference-${referenceId}`, bindingId, '实际参考图');
      link(bindingId, id, '按绑定生成');
    }
    const attachmentContent = material.attachments?.map(attachment => `- ${attachment.source === 'file' ? refById.get(attachment.referenceId || '')?.subject || attachment.referenceId || '参考原图' : materialById.get(attachment.taskId || '')?.name || attachment.taskId || '依赖图'} · SHA-256 ${attachment.contentHash}`).join('\n');
    nodes.push({ id, kind: 'image', lane: 'media', title: material.name,
      summary: material.reason || (approved ? '本件图像已对照原始素材验收，附图记录与验收依据已保存。' : MATERIAL_LABELS[material.status]),
      status: materialNodeStatus(material, session), statusLabel: material.status === 'running' && session.status === 'paused' ? '生成已暂停 · 等待核对状态'
        : material.status === 'approved' && !approved ? '已生成 · 验收证据待核对' : MATERIAL_LABELS[material.status],
      content: [bindingContent, material.reason, attachmentContent ? `## 实际附图记录\n\n${attachmentContent}` : '',
        material.submittedReferences?.length ? `## 提交给图像模型的参考图\n\n${material.submittedReferences.map((reference, index) => `${index + 1}. ${reference.mimeType} · ${reference.bytes} 字节 · SHA-256 ${reference.contentHash}`).join('\n')}` : '',
        material.review ? `## 图像验收依据\n\n${material.review.evidence}\n\n验收时间：${material.review.reviewedAt}\n对应结果：${material.review.outputHash}` : '',
        material.requestId ? `生成请求：${material.requestId}` : '', material.model ? `图像模型：${material.model}` : ''].filter(Boolean).join('\n\n'),
      assetIds: material.imageUrl ? [assetId] : [], ...(material.imageUrl ? { primaryAssetId: assetId } : {}), sources,
      tags: [material.priority === 'core' ? '核心项' : material.priority === 'recommended' ? '推荐项' : '可选项', `v${session.revision}`] });
    for (const taskId of binding?.referenceTasks || []) if (taskId !== material.materialId && materialById.has(taskId)) link(`media-material-${taskId}`, id, '依赖图验收通过后引用');
    if (material.review) {
      const reviewId = `media-review-${material.materialId}`;
      nodes.push({ id: reviewId, kind: 'review', lane: 'review', title: `${material.name} · 图像验收`, summary: material.review.evidence,
        status: approved ? 'available' : 'needs_revision', statusLabel: approved ? '本件图像验收通过' : '本件图像需要复核',
        content: `验收依据：${material.review.evidence}\n\n验收时间：${material.review.reviewedAt}\n\n对应结果 SHA-256：${material.review.outputHash}`,
        assetIds: material.imageUrl ? [assetId] : [], sources: [{ label: '实际生成结果', assetId, sha256: material.outputHash }, ...sources], tags: ['图像验收', `v${session.revision}`] });
      link(id, reviewId, '对照原始素材验收');
    }
  }
  const evidenceUrl = `/api/sessions/${encodeURIComponent(session.id)}/media/evidence?v=${session.revision}`;
  assets.push({ id: 'media-evidence-file', name: '素材与物料附图证据.json', kind: 'document', url: evidenceUrl, downloadUrl: evidenceUrl, mimeType: 'application/json', size: 0 });
  nodes.push({ id: 'media-evidence', kind: 'review', lane: 'review', title: '素材、附图与验收证据', summary: mediaProgressLabel(session) || '保存本轮采集、参考图绑定、生成及验收记录。',
    status: state.phase === 'reviewing' && session.status === 'running' ? 'running' : isSessionMediaComplete(session) ? 'available' : state.phase === 'partial' ? 'needs_revision' : 'unverified',
    statusLabel: isSessionMediaComplete(session) ? '范围内物料已验收 · 证据已保存' : state.phase === 'partial' ? '部分完成 · 查看缺项' : '证据持续保存 · 验收未完成',
    content: [mediaProgressLabel(session), ...state.limitations].filter(Boolean).join('\n\n'), assetIds: ['media-evidence-file'], sources: [{ label: '本轮实际采集、绑定、生成和验收记录' }], tags: ['附图证据', `v${session.revision}`] });
  return { nodes, edges, assets };
}
