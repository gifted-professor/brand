export const SKILLS = [
  { id: 'brand-profile', name: '品牌解读', description: '梳理品牌特点、资源与待确认信息' },
  { id: 'collab-ideation', name: '联名创意', description: '碰撞三个有实质差异的合作方向' },
  { id: 'design-spec', name: '设计方案', description: '明确产品、体验、材质与双方贡献' },
  { id: 'campaign-copy', name: '传播文案', description: '形成主题、故事与传播内容' },
  { id: 'visual-production', name: '视觉创作', description: '规划主视觉与出图提示词' },
  { id: 'quality-review', name: '方案审查', description: '核对标准、品牌价值与执行缺口' },
] as const;
export type SkillId = typeof SKILLS[number]['id'];
export const AGENT_ROLES = {
  orchestrator: { name: '联名总策划', description: '整理简报、安排阶段与汇总交接' },
  research: { name: '研究 Agent', description: '整理品牌资产、资料依据与信息缺口' },
  creative: { name: '创作 Agent', description: '形成创意并深化产品、文案与视觉' },
  review: { name: '审查 Agent', description: '检查品牌贡献、消费者价值与执行条件' },
} as const;
export type AgentRole = keyof typeof AGENT_ROLES;
export function agentRoleForSkill(skill: SkillId): Exclude<AgentRole, 'orchestrator'> {
  return skill === 'brand-profile' ? 'research' : skill === 'quality-review' ? 'review' : 'creative';
}
export type Brand = { id: 'a' | 'b'; name: string; description: string; files: { name: string; text: string }[] };
export type ArtifactContext = { title: string; content: string; sources: string[] };
export type Message = {
  id: string; role: 'a' | 'b' | 'user' | 'system'; kind: 'message' | 'skill' | 'notice';
  content: string; createdAt: string; revision: number; skill?: SkillId;
  status?: 'running' | 'done' | 'error'; detail?: string; model?: string;
  // The role is a stage responsibility; a/b continues to identify brand standpoint.
  // Absent on historical messages whose professional role was not recorded.
  agentRole?: AgentRole; agentName?: string;
  // Only attached after a stage result passed validation and was committed.
  artifact?: { section: string; card?: ProposalCard };
};
export type Concept = { id: string; title: string; tagline: string; description: string; contributionA: string; contributionB: string; consumerValue: string };
export type ProposalCard = { skill: SkillId; title: string; summary: string; points: { label: string; content: string }[] };
export type Proposal = { title: string; summary: string; sections: { skill: SkillId; title: string; content: string }[]; cards?: ProposalCard[]; pendingConfirmations: string[]; imagePrompt?: string; imageUrl?: string; reviewStatus?: 'unverified' | 'needs_revision' | 'passed' };
export type Session = {
  id: string; title: string; brands: [Brand, Brand]; goal: string;
  mode: 'live' | 'demo'; model?: string; status: 'idle' | 'running' | 'paused' | 'awaiting_selection' | 'completed' | 'error';
  revision: number; constraints: string[]; messages: Message[]; concepts: Concept[];
  selectedConceptId?: string; proposal?: Proposal; activeSkill?: SkillId;
  artifactContext?: ArtifactContext;
  completedSkills: SkillId[]; error?: string; createdAt: string; updatedAt: string;
};
export type RuntimeInfo = { configured: boolean; model: string; skills: { id: SkillId; name: string; description: string; version: string; digest: string; content: string }[]; uploadFormats: string[] };
