export type InvitationStatus = 'draft' | 'pending' | 'revision' | 'declined' | 'accepted' | 'withdrawn';
export type InvitationPerspective = 'sender' | 'recipient';
export interface InvitationDraft { title: string; concept: string; contribution: string; ask: string; diagnostics: [string, string, string] }
export interface Invitation {
  draft: InvitationDraft;
  status: InvitationStatus;
  version: number;
  sentDraft?: InvitationDraft;
  feedback: string;
}
export type InvitationAction =
  | { type: 'edit'; field: Exclude<keyof InvitationDraft, 'diagnostics'>; value: string }
  | { type: 'diagnostic'; index: 0 | 1 | 2; value: string }
  | { type: 'send'; actor: InvitationPerspective }
  | { type: 'respond'; actor: InvitationPerspective; response: 'revision' | 'declined' | 'accepted'; feedback: string }
  | { type: 'withdraw'; actor: InvitationPerspective }
  | { type: 'revise'; actor: InvitationPerspective };
export const canSendInvitation = (draft: InvitationDraft) => [draft.title, draft.concept, draft.contribution, draft.ask].every(value => value.trim().length > 0);
export function invitationReducer(state: Invitation, action: InvitationAction): Invitation {
  if (action.type === 'edit' && state.status === 'draft') return { ...state, draft: { ...state.draft, [action.field]: action.value } };
  if (action.type === 'diagnostic' && state.status === 'draft') {
    const diagnostics = [...state.draft.diagnostics] as InvitationDraft['diagnostics']; diagnostics[action.index] = action.value;
    return { ...state, draft: { ...state.draft, diagnostics } };
  }
  if (action.type === 'send' && action.actor === 'sender' && state.status === 'draft' && canSendInvitation(state.draft)) return { ...state, status: 'pending', feedback: '', sentDraft: { ...state.draft, diagnostics: [...state.draft.diagnostics] } };
  if (action.type === 'respond' && action.actor === 'recipient' && state.status === 'pending') {
    if (action.response === 'revision' && !action.feedback.trim()) return state;
    return { ...state, status: action.response, feedback: action.feedback.trim() };
  }
  if (action.type === 'withdraw' && action.actor === 'sender' && state.status === 'pending') return { ...state, status: 'withdrawn' };
  if (action.type === 'revise' && action.actor === 'sender' && ['revision', 'declined', 'withdrawn'].includes(state.status)) return { ...state, status: 'draft', version: state.version + 1 };
  return state;
}
