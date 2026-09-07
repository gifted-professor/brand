import { AGENT_ROLES, SKILLS, agentRoleForSkill, type Message, type Session, type SkillId } from '../src/collider-types.ts';
import type { ProductionLaneId, ProductionProject, ProductionWorkflow, ProductionWorkflowStep } from '../src/production-types.ts';
import { automationProgressNode, currentSessionAutomation, isSessionFinalReviewPending, isSessionGenerationComplete, isSessionMediaComplete, isSessionMediaRunning, mediaProgressLabel } from './session-automation.ts';

export const skillLane: Record<SkillId, ProductionLaneId> = {
  'brand-profile': 'strategy',
  'collab-ideation': 'strategy',
  'design-spec': 'materials',
  'campaign-copy': 'story',
  'visual-production': 'media',
  'quality-review': 'review',
};

// These are the nine specialist stages in the runtime's fixed workflow. The
// host dispatch is immediate; both research steps may be running together.
export const workflowSteps: readonly { id: string; skill: SkillId; standpoint: 'a' | 'b'; label: string }[] = [
  { id: 'profile-a', skill: 'brand-profile', standpoint: 'a', label: '品牌 A 研究' },
  { id: 'profile-b', skill: 'brand-profile', standpoint: 'b', label: '品牌 B 研究' },
  { id: 'ideation-a', skill: 'collab-ideation', standpoint: 'a', label: '提出创意初稿' },
  { id: 'ideation-b', skill: 'collab-ideation', standpoint: 'b', label: '比较并收敛方向' },
  { id: 'design-a', skill: 'design-spec', standpoint: 'a', label: '深化产品与体验' },
  { id: 'design-b', skill: 'design-spec', standpoint: 'b', label: '统一设计与物料清单' },
  { id: 'copy-a', skill: 'campaign-copy', standpoint: 'a', label: '完成传播文案' },
  { id: 'visual-b', skill: 'visual-production', standpoint: 'b', label: '规划视觉与单件效果图' },
  { id: 'review-a', skill: 'quality-review', standpoint: 'a', label: '审查并汇总交付' },
];

export function latestSessionOrchestratorCall(session: Session): Message | undefined {
  return session.messages.findLast(message => message.kind === 'notice' && message.agentRole === 'orchestrator'
    && message.revision === session.revision && Boolean(message.status || message.execution));
}

export function isSessionOrchestratorCurrent(session: Session): boolean {
  const dispatch = latestSessionOrchestratorCall(session);
  if (!dispatch || session.status === 'idle' || session.status === 'awaiting_selection' || session.status === 'completed') return false;
  const latestCall = session.messages.findLast(message => message.kind === 'skill' && message.revision === session.revision);
  return !latestCall || session.messages.indexOf(dispatch) > session.messages.indexOf(latestCall);
}

// A Skill identifies a method, not an image request. Reference binding also
// runs as a system visual-production call; its completion produces no image.
export function latestSessionImageCall(session: Session): Message | undefined {
  return session.messages.findLast(message => message.kind === 'skill'
    && message.role === 'system' && message.skill === 'visual-production'
    && message.revision === session.revision
    && (message.operation === 'image-generation' || (!message.operation
      && !message.execution && (!message.agentName || message.agentName === '生图 Agent'))));
}

export function hasCurrentSessionImage(session: Session): boolean {
  const url = session.proposal?.imageUrl;
  if (!url) return false;
  const version = url.match(/[?&]v=(\d+)(?:&|$)/)?.[1];
  if (version && Number(version) !== session.revision) return false;
  return session.completedSkills.includes('visual-production')
    || latestSessionImageCall(session)?.status === 'done';
}

export function sessionHasProgress(session: Session): boolean {
  if (session.status === 'idle') return false;
  return session.status === 'running' || session.completedSkills.length > 0
    || session.messages.some(message => message.kind === 'skill' && message.revision === session.revision)
    || Boolean(latestSessionOrchestratorCall(session))
    || hasCurrentSessionImage(session)
    || Boolean(currentSessionAutomation(session) && currentSessionAutomation(session)?.phase !== 'idle');
}

/** Resolve an actual session artifact, keeping shared lanes from hiding progress. */
export function resolveSessionProgressNode(session: Session | null): string | null {
  if (!session || !sessionHasProgress(session)) return null;
  if (session.video?.revision === session.revision) return 'promo-video';
  const automation = currentSessionAutomation(session);
  if (isSessionGenerationComplete(session)) return session.completedSkills.includes('quality-review')
    || session.activeSkill === 'quality-review' ? 'quality-review' : 'media-evidence';
  if (automation && ['generating', 'reviewing', 'partial', 'paused'].includes(automation.phase)
    && (!session.activeSkill || session.activeSkill === 'visual-production' || session.status !== 'running')) {
    return automationProgressNode(session) || null;
  }
  const imageCall = latestSessionImageCall(session);
  if (imageCall?.status === 'running') return 'generated-image';
  if (isSessionOrchestratorCurrent(session)) return 'workflow-brief';
  if (session.activeSkill && (session.status === 'running' || session.status === 'paused')) return session.activeSkill;
  if (automation && automation.phase !== 'idle' && automation.phase !== 'completed') return automationProgressNode(session) || null;
  const latestCall = session.messages.findLast(message => message.kind === 'skill'
    && message.skill && message.revision === session.revision
    && (message.role !== 'system' || message.skill === 'visual-production'));
  const latestNode = latestCall?.skill ? latestCall.role === 'system' ? 'generated-image' : latestCall.skill : null;
  // A failure remains actionable even when an earlier image is still available.
  if (latestCall?.status === 'running' || latestCall?.status === 'error') return latestNode;
  if (session.status === 'awaiting_selection' && (session.completedSkills.includes('collab-ideation')
    || session.messages.some(message => message.kind === 'skill' && message.skill === 'collab-ideation'
      && message.role !== 'system' && message.revision === session.revision))) return 'collab-ideation';
  if (hasCurrentSessionImage(session)) return 'generated-image';
  if (automation?.phase === 'completed') return automationProgressNode(session) || null;
  if (latestNode) return latestNode;
  const completed = SKILLS.findLast(skill => session.completedSkills.includes(skill.id));
  return completed?.id ?? null;
}

/** Choose the work currently worth showing without inventing future stages. */
export function resolveSessionStage(session: Session | null): ProductionLaneId | null {
  const node = resolveSessionProgressNode(session);
  if (node === 'promo-video') return 'video';
  if (node) return node === 'generated-image' || node.startsWith('media-material-') ? 'media'
    : node === 'media-evidence' ? 'review' : node === 'workflow-brief' || node === 'media-references' ? 'strategy' : skillLane[node as SkillId];
  return session && sessionHasProgress(session) ? 'strategy' : null;
}

/** Build progress from committed calls and actual dispatches, including failures. */
export function sessionWorkflow(session: Session, nodeIds: ReadonlySet<string>): ProductionWorkflow | undefined {
  if (!sessionHasProgress(session)) return undefined;
  const dispatch = latestSessionOrchestratorCall(session);
  const orchestrating = isSessionOrchestratorCurrent(session);
  const automation = currentSessionAutomation(session);
  const mediaComplete = !session.autoProduce || isSessionMediaComplete(session);
  const generationComplete = isSessionGenerationComplete(session);
  const mediaPending = session.autoProduce && !generationComplete && session.completedSkills.includes('visual-production');
  const reviewPending = isSessionFinalReviewPending(session);
  const steps: ProductionWorkflowStep[] = workflowSteps.map(step => {
    const completed = session.completedSkills.includes(step.skill);
    const call = session.messages.findLast(message => message.kind === 'skill' && message.role === step.standpoint
      && message.skill === step.skill && (message.revision === session.revision || (completed && message.status === 'done')));
    const interrupted = call?.execution?.state === 'interrupted';
    let status: ProductionWorkflowStep['status'] = completed || call?.status === 'done' ? 'completed'
      : call?.status === 'error' ? interrupted || session.status === 'paused' ? 'paused' : 'failed'
      : call?.status === 'running' ? session.status === 'running' ? 'running' : session.status === 'error' ? 'failed' : 'paused'
      : 'pending';
    if (mediaPending && (step.skill === 'visual-production' || step.skill === 'quality-review')) {
      status = step.skill === 'quality-review' ? 'pending' : session.status === 'paused' || automation?.phase === 'partial' || automation?.phase === 'paused' ? 'paused'
        : session.status === 'error' ? 'failed' : session.status === 'running' || isSessionMediaRunning(session) ? 'running' : 'pending';
    }
    if (generationComplete && step.skill === 'visual-production') status = 'completed';
    if (!mediaPending && (reviewPending || (generationComplete && !mediaComplete)) && step.skill === 'quality-review') {
      status = session.status === 'running' ? 'running' : 'paused';
    }
    const brand = session.brands.find(brand => brand.id === step.standpoint)?.name || `品牌 ${step.standpoint.toUpperCase()}`;
    return { ...step, ...(session.autoProduce && step.skill === 'visual-production' ? { label: '绑定参考图并逐件生成' } : {}), agentName: `${AGENT_ROLES[agentRoleForSkill(step.skill)].name} · ${brand}`, status,
      ...(nodeIds.has(step.skill) && status !== 'pending' ? { nodeId: step.skill } : {}) };
  });
  const next = steps.find(step => step.status !== 'completed');
  // Historical API sessions can record an active skill before its first call.
  // A CLI handoff does not count as a specialist already executing that skill.
  if (!orchestrating && session.activeSkill && next?.skill === session.activeSkill && next.status === 'pending') {
    next.status = session.status === 'running' ? 'running' : session.status === 'error' ? 'failed' : 'paused';
    if (nodeIds.has(next.skill)) next.nodeId = next.skill;
  }
  const currentCall = session.messages.findLast(message => message.kind === 'skill' && message.role !== 'system'
    && message.revision === session.revision);
  const callStep = currentCall ? steps.find(step => step.skill === currentCall.skill && step.standpoint === currentCall.role) : undefined;
  const image = latestSessionImageCall(session);
  const imageIsCurrent = image && session.messages.indexOf(image) > (currentCall ? session.messages.indexOf(currentCall) : -1)
    && (!dispatch || session.messages.indexOf(image) > session.messages.indexOf(dispatch));
  const status: ProductionWorkflow['status'] = automation?.phase === 'partial' || automation?.phase === 'paused' ? 'paused'
    : isSessionMediaRunning(session) ? 'running'
    : session.status === 'completed' && (!mediaComplete || reviewPending) ? 'paused'
    : imageIsCurrent && image.status === 'running' ? 'running'
    : imageIsCurrent && image.status === 'error' ? 'failed'
    : session.status === 'error' ? 'failed' : session.status === 'idle' ? 'paused' : session.status;
  const phase: ProductionWorkflow['phase'] = imageIsCurrent && image.status !== 'done' ? 'specialist'
    : session.status === 'awaiting_selection' ? 'selection'
    : session.status === 'completed' && mediaComplete && !reviewPending ? 'finished' : mediaPending ? 'specialist' : orchestrating ? 'orchestrator' : 'specialist';
  const current = phase === 'finished' ? undefined : phase === 'selection' ? steps[3]
    : orchestrating ? next : steps.find(step => step.status === 'running') || (status === 'failed' || status === 'paused' ? callStep?.status !== 'completed' ? callStep : undefined : undefined) || next;
  const focus = resolveSessionProgressNode(session);
  const currentNodeId = focus && nodeIds.has(focus) ? focus : undefined;
  const activeCall = session.messages.findLast(message => message.kind === 'skill' && message.role !== 'system'
    && message.revision === session.revision && message.status === 'running');
  const parallelResearch = steps.filter(step => step.skill === 'brand-profile' && step.status === 'running').length === 2;
  let currentAction = phase === 'selection' ? '三个方向已整理，等待你选择方向后继续深化。'
    : phase === 'finished' ? '当前版本的方案与审查意见已保存。'
    : orchestrating ? dispatch?.status === 'error' ? dispatch.detail || session.error || '主控交接未完成，已保留当前简报。'
      : dispatch?.content || '主控正在整理共同简报。'
    : parallelResearch ? '双方品牌研究正在并行进行，完成后汇合创意方向。'
    : activeCall?.content || currentCall?.content || (current ? `${current.agentName}：${current.label}` : '等待下一阶段任务。');
  if (imageIsCurrent && image.status !== 'done') currentAction = image.status === 'running' ? '正在生成概念视觉，保存后图片会加入画布。' : image.detail || '图片生成未完成。';
  else if (status === 'failed' && !orchestrating) currentAction = session.error || currentCall?.detail || currentAction;
  else if (status === 'paused') currentAction = orchestrating ? '主控交接已暂停，当前简报与已保存成果保留。' : '协作已暂停，已完成的阶段成果保留。';
  if (mediaPending && mediaProgressLabel(session)) currentAction = mediaProgressLabel(session)!;
  else if (generationComplete && !mediaComplete) currentAction = `图像已生成，当前处于第九步验收。${mediaProgressLabel(session) || '请查看逐件验收记录。'}`;
  else if (reviewPending) currentAction = '范围内图像已保存，全案审查仍有待修订或待确认事项，请查看审查意见。';
  else if (phase === 'finished' && session.autoProduce) currentAction = '本轮方案与范围内物料已完成，原图来源、附图证据及审查意见已保存。';
  const video = session.video?.revision === session.revision ? session.video : undefined;
  if (video) return { revision: session.revision, status: video.status === 'completed' ? 'completed'
      : ['preparing', 'running', 'exporting'].includes(video.status) && session.status === 'running' ? 'running' : 'paused',
    phase: video.status === 'completed' ? 'finished' : 'specialist', currentStepId: 'promo-video', currentNodeId: 'promo-video',
    currentAction: `宣传视频 · ${video.summary}`, completedSteps: steps.filter(step => step.status === 'completed').length, totalSteps: steps.length, steps };
  return { revision: session.revision, status, phase, currentStepId: current?.id, currentNodeId, currentAction,
    completedSteps: steps.filter(step => step.status === 'completed').length, totalSteps: steps.length, steps };
}

/** Imported projects have no live session; prefer work in flight, then visuals. */
export function resolveProjectStage(project: ProductionProject | null): ProductionLaneId | null {
  if (!project?.nodes.length) return null;
  const running = project.nodes.findLast(node => node.status === 'running');
  if (running) return running.lane;
  const useful = project.nodes.filter(node => node.status !== 'planned' && node.status !== 'failed' && node.status !== 'reference');
  const imageIds = new Set(project.assets.filter(asset => asset.kind === 'image').map(asset => asset.id));
  // The manifest orders its hero/product images before supporting storyboards.
  // Keep source order for ties and unranked primary images, rather than choosing
  // whichever supporting artifact happened to be appended last by the importer.
  const primaryImage = useful.filter(node => node.primaryAssetId && imageIds.has(node.primaryAssetId))
    .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))[0];
  if (primaryImage) return primaryImage.lane;
  const image = useful.findLast(node => node.kind === 'image' && node.assetIds.some(id => imageIds.has(id)));
  if (image) return image.lane;
  return useful.findLast(node => node.id !== 'export')?.lane ?? useful.at(-1)?.lane ?? project.nodes.at(-1)?.lane ?? null;
}
