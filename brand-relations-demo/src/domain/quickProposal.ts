import type { InvitationDraft } from './invitation';
import type { Brand } from './types';

export const PROPOSAL_BRAND_FIELDS = ['name', 'category', 'summary', 'offers', 'needs', 'intent', 'audience', 'identity', 'constraints', 'supportingEvidence'] as const;
export function proposalRequest(brands: Brand[], draft: InvitationDraft) {
  return { brands: brands.map(brand => Object.fromEntries(PROPOSAL_BRAND_FIELDS.map(key => [key, brand[key] ?? '']))), draft };
}

export type QuickProposalResult = {
  draft: Pick<InvitationDraft, 'title' | 'concept' | 'contribution' | 'ask'>;
  notes: string[];
  model?: string;
};

export function isQuickProposalResult(value: unknown): value is QuickProposalResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as QuickProposalResult;
  return Boolean(result.draft && ['title', 'concept', 'contribution', 'ask'].every(key => {
    const text = result.draft[key as keyof QuickProposalResult['draft']];
    return typeof text === 'string' && text.trim().length > 0 && text.length <= (key === 'title' ? 100 : 2000);
  }) && Array.isArray(result.notes) && result.notes.length <= 5 && result.notes.every(note => typeof note === 'string' && note.trim().length > 0 && note.length <= 500)
    && (result.model === undefined || typeof result.model === 'string'));
}
