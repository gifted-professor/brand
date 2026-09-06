import { describe, it, expect } from 'vitest';
import { generateProposalField, PROPOSAL_FIELDS } from './colliderApi';
import { exampleIntake } from '../src/domain/brandIntake';
const input = { brands: [exampleIntake, { ...exampleIntake, name: '另一品牌' }], draft: { title: '手动名称', concept: '用户的具体方向' } };
describe('COLLIDER field adapter', () => {
  it('uses the upstream method with brands as data and only returns the requested field', async () => {
    for (const field of PROPOSAL_FIELDS) {
      const result = await generateProposalField({ complete: async messages => {
        expect(messages[0].content).toContain('upstream-method');
        expect(messages[0].content).toContain('不虚构');
        expect(JSON.parse(messages[1].content)).toEqual(input);
        return { value: '待核对的建议' };
      } }, { ...input, field }, 'upstream-method');
      expect(result).toEqual({ value: '待核对的建议' });
    }
  });
  it('rejects unsupported fields, invalid responses and service failures without fabricated output', async () => {
    await expect(generateProposalField({ complete: async () => ({ value: 'x' }) }, { ...input, field: 'injected' }, '')).rejects.toThrow();
    for (const value of ['', null, 42, 'x'.repeat(101)]) await expect(generateProposalField({ complete: async () => ({ value }) }, { ...input, field: 'title' }, '')).rejects.toThrow();
    await expect(generateProposalField({ complete: async () => { throw new Error('offline'); } }, { ...input, field: 'ask' }, '')).rejects.toThrow('offline');
  });
});
