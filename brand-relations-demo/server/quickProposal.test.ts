import { describe, expect, it, vi } from 'vitest';
import { compactProposalInput, generateQuickProposal } from './quickProposal';

const input = { brands: [{ name: '茶社', offers: '茶叶', constraints: '不新增赠品', avatarDataUrl: 'large-image-data' }, { name: '书房', offers: '空间' }], draft: { concept: '周末读书会', diagnostics: ['日期待确认'] } };
const result = { draft: { title: '书香茶会', concept: '阅读与品茶的小型活动', contribution: '提供茶叶', ask: '邀请提供场地，待对方确认' }, notes: ['日期待确认'] };
describe('single-call proposal draft', () => {
  it('produces a usable draft in exactly one call, preserving constraints and excluding image data', async () => {
    const complete = vi.fn(async () => result);
    expect(await generateQuickProposal({ model: 'fast-model', complete }, input)).toEqual({ ...result, model: 'fast-model' });
    expect(complete).toHaveBeenCalledTimes(1);
    const messages = complete.mock.calls[0] as unknown as [Array<{ content: string }>];
    const prompt = JSON.parse(messages[0][1].content);
    expect(prompt.brands[0].constraints).toBe('不新增赠品');
    expect(prompt.draft.diagnostics).toEqual(['日期待确认']);
    expect(JSON.stringify(prompt)).not.toContain('large-image-data');
  });
  it('rejects broken input before a model request', async () => {
    const complete = vi.fn();
    for (const value of [null, {}, { ...input, brands: [] }, { ...input, draft: [] }, { ...input, draft: { concept: 42 } }]) {
      await expect(generateQuickProposal({ complete }, value)).rejects.toThrow();
    }
    expect(complete).not.toHaveBeenCalled();
    expect(() => compactProposalInput({ ...input, draft: { diagnostics: [42] } })).toThrow();
  });
  it('does not invent a success for malformed output or failed calls', async () => {
    for (const value of [null, {}, { ...result, draft: { ...result.draft, title: '' } }, { ...result, notes: 'wrong' }]) {
      await expect(generateQuickProposal({ complete: async () => value }, input)).rejects.toThrow('格式不完整');
    }
    await expect(generateQuickProposal({ complete: async () => { throw new Error('offline'); } }, input)).rejects.toThrow('offline');
  });
});
