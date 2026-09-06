import { describe, expect, it } from 'vitest';
import { invitationReducer as reduce } from './invitation';
import type { Invitation } from './invitation';

const draft = (): Invitation => ({ status: 'draft', version: 1, feedback: '', draft: { title: 'A × B', concept: '小批量联名产品', contribution: '我方提供设计', ask: '邀请对方讨论生产', diagnostics: ['', '', ''] } });
const sent = () => reduce(draft(), { type: 'send', actor: 'sender' });
describe('Proposal invitation lifecycle', () => {
  it('does not equate a draft, a send, or sender confirmation with mutual consent', () => {
    expect(reduce(draft(), { type: 'respond', actor: 'recipient', response: 'accepted', feedback: '' }).status).toBe('draft');
    expect(sent().status).toBe('pending');
    expect(reduce(sent(), { type: 'respond', actor: 'sender', response: 'accepted', feedback: '' }).status).toBe('pending');
    expect(reduce(sent(), { type: 'respond', actor: 'recipient', response: 'accepted', feedback: '' }).status).toBe('accepted');
  });
  it('rejects incomplete proposals and prevents recipients from sending invitations', () => {
    const incomplete = draft(); incomplete.draft.ask = '   ';
    expect(reduce(incomplete, { type: 'send', actor: 'sender' }).status).toBe('draft');
    expect(reduce(draft(), { type: 'send', actor: 'recipient' }).status).toBe('draft');
  });
  it('freezes the submitted version and diagnostics while a response is pending', () => {
    const state = sent();
    expect(state.sentDraft).toEqual(state.draft);
    expect(state.sentDraft).not.toBe(state.draft);
    expect(state.sentDraft?.diagnostics).not.toBe(state.draft.diagnostics);
    expect(reduce(state, { type: 'edit', field: 'concept', value: '偷偷改变产物' })).toBe(state);
    expect(reduce(state, { type: 'diagnostic', index: 0, value: '新证据' })).toBe(state);
  });
  it('requires feedback for a revision and fresh recipient consent for the next version', () => {
    const initial = sent();
    expect(reduce(initial, { type: 'respond', actor: 'recipient', response: 'revision', feedback: ' ' })).toBe(initial);
    const change = reduce(initial, { type: 'respond', actor: 'recipient', response: 'revision', feedback: '先缩小规模' });
    const next = reduce(change, { type: 'revise', actor: 'sender' });
    expect(next.status).toBe('draft'); expect(next.version).toBe(2);
    expect(reduce(next, { type: 'respond', actor: 'recipient', response: 'accepted', feedback: '' }).status).toBe('draft');
    expect(reduce(next, { type: 'send', actor: 'sender' }).status).toBe('pending');
  });
  it('ends declined and withdrawn invitations and rejects late acceptance', () => {
    const no = reduce(sent(), { type: 'respond', actor: 'recipient', response: 'declined', feedback: '档期冲突' });
    expect(no.status).toBe('declined'); expect(no.feedback).toBe('档期冲突');
    expect(reduce(no, { type: 'respond', actor: 'recipient', response: 'accepted', feedback: '' })).toBe(no);
    const withdrawn = reduce(sent(), { type: 'withdraw', actor: 'sender' });
    expect(withdrawn.status).toBe('withdrawn');
    expect(reduce(withdrawn, { type: 'respond', actor: 'recipient', response: 'accepted', feedback: '' })).toBe(withdrawn);
  });
});
