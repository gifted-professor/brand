import { SKILLS, type Message, type Session, type SkillId } from '../src/collider-types.ts';
import type { ProductionLaneId, ProductionProject } from '../src/production-types.ts';

export const skillLane: Record<SkillId, ProductionLaneId> = {
  'brand-profile': 'strategy',
  'collab-ideation': 'strategy',
  'design-spec': 'materials',
  'campaign-copy': 'story',
  'visual-production': 'media',
  'quality-review': 'review',
};

// The runtime records image requests as system skill calls. Brand-role calls to
// visual-production only write a plan and must never imply a running image job.
export function latestSessionImageCall(session: Session): Message | undefined {
  return session.messages.findLast(message => message.kind === 'skill'
    && message.role === 'system' && message.skill === 'visual-production'
    && message.revision === session.revision);
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
    || hasCurrentSessionImage(session);
}

/** Choose the work currently worth showing without inventing future stages. */
export function resolveSessionStage(session: Session | null): ProductionLaneId | null {
  if (!session || !sessionHasProgress(session)) return null;
  const imageCall = latestSessionImageCall(session);
  if (imageCall?.status === 'running') return 'media';
  if (session.activeSkill && (session.status === 'running' || session.status === 'paused')) return skillLane[session.activeSkill];
  const latestCall = session.messages.findLast(message => message.kind === 'skill'
    && message.skill && message.revision === session.revision);
  if (latestCall?.status === 'running' && latestCall.skill) return skillLane[latestCall.skill];
  if (hasCurrentSessionImage(session)) return 'media';
  if (latestCall?.skill) return skillLane[latestCall.skill];
  const completed = SKILLS.findLast(skill => session.completedSkills.includes(skill.id));
  return completed ? skillLane[completed.id] : 'strategy';
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
