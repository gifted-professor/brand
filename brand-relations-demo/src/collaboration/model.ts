import type { Brand } from '../domain/types';
import type { Invitation, InvitationAction, InvitationDraft } from '../domain/invitation';
import { invitationReducer } from '../domain/invitation';

export type Side = 'a' | 'b';
export interface VisualIdentity {
  wordmark: string; background: string; foreground: string; accent: string;
  source: 'fictional' | 'provided' | 'unprovided';
  photo?: string; logo?: string;
}
export interface ProjectBrand { brand: Brand; visual: VisualIdentity }
export interface PreviewSet {
  id: string; revision: number; createdAt: string; source: 'template' | 'ai';
  a: string; b: string; model?: string;
}
export interface Project {
  id: string; sequence: number; revision: number; createdAt: string; updatedAt: string;
  brands: { a: ProjectBrand; b: ProjectBrand }; invitation: Invitation;
  headlines: { a: string; b: string }; channel: 'social' | 'store';
  previews: PreviewSet[]; approvals: { a: boolean; b: boolean };
  notes: { id: string; side: Side; text: string; createdAt: string }[];
}
export const STATUS_LABELS = { draft: '单方意向 · 未发送', pending: '等待对方回应', accepted: '双方愿意继续', revision: '对方希望调整', declined: '对方暂不参与', withdrawn: '邀请已撤回' };
export const currentPreview = (project: Project) => project.previews.findLast(preview => preview.revision === project.revision);
export const readyToExport = (project: Project) => project.invitation.status === 'accepted' && project.approvals.a && project.approvals.b && Boolean(currentPreview(project));
export const isPaused = (project: Project) => ['declined', 'withdrawn', 'revision'].includes(project.invitation.status);
export function updateInvitation(project: Project, action: InvitationAction): Project {
  if (action.type === 'send' && (!currentPreview(project) || Object.values(project.brands).some(b => b.visual.source === 'unprovided'))) throw new Error('请补充双方视觉资料并生成当前版本的预演。');
  const invitation = invitationReducer(project.invitation, action);
  if (invitation === project.invitation) throw new Error('当前状态不支持此操作，请刷新项目后重试。');
  return { ...project, invitation, approvals: { a: false, b: false } };
}
export function updateBrief(project: Project, input: { draft: InvitationDraft; headlines: Project['headlines']; channel: Project['channel']; visuals: { a: VisualIdentity; b: VisualIdentity } }): Project {
  if (!['draft', 'accepted'].includes(project.invitation.status)) throw new Error('请先准备新版本，再修改合作简报。');
  return { ...project, revision: project.revision + 1, invitation: { ...project.invitation, draft: input.draft },
    headlines: input.headlines, channel: input.channel,
    brands: { a: { ...project.brands.a, visual: input.visuals.a }, b: { ...project.brands.b, visual: input.visuals.b } },
    approvals: { a: false, b: false } };
}
export function approveMaterial(project: Project, side: Side): Project {
  if (project.invitation.status !== 'accepted' || !currentPreview(project)) throw new Error('双方建联且当前版本已有预演后，才可以确认物料。');
  if (Object.values(project.brands).some(b => b.visual.source === 'unprovided')) throw new Error('请先补充双方原有视觉资料。');
  return { ...project, approvals: { ...project.approvals, [side]: true } };
}
