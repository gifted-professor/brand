import { describe, it, expect } from 'vitest';
import { reviewAccessoryEvidence } from './accessoryReview';
import { emptyIntake } from '../src/domain/brandIntake';
const documents = [{ id: 'doc', name: 'brief.txt', text: '本品牌提供产品设计。' }];
const claim = { capabilityId: 'design', claimType: 'owned', subjectBrandId: 'current-brand', documentId: 'doc', quote: documents[0].text };
describe('independent accessory review passes', () => {
  it('runs proposal then independent review and preserves provenance', async () => {
    let calls = 0;
    const result = await reviewAccessoryEvidence({ complete: async messages => {
      calls++;
      if (calls===1) { expect(messages[0].content).toContain('能力证据Agent'); return { claims: [claim] }; }
      expect(messages[0].content).toContain('独立红队Agent');
      return { reviews: [{ index: 0, decision: 'supported', reason: '资料明确支持当前主体。' }] };
    } }, { ...emptyIntake, name: '测试品牌' }, documents);
    expect(calls).toBe(2); expect(result[0].conflict).toBe(false); expect(result[0].documentId).toBe('doc');
  });
  it('does not treat uncertainty, missing reviews or duplicate votes as approval', async () => {
    for (const reviews of [[], [{ index:0, decision:'uncertain' }], [{ index:0, decision:'supported' },{ index:0, decision:'supported' }]]) {
      let calls=0;
      const result=await reviewAccessoryEvidence({ complete:async()=>++calls===1?{claims:[claim]}:{reviews} },emptyIntake,documents);
      expect(result[0].conflict).toBe(true);
    }
  });
  it('rejects invented documents and never trusts a proposed level', async () => {
    const result=await reviewAccessoryEvidence({complete:async()=>({claims:[{...claim,documentId:'invented',level:3}]})},emptyIntake,documents);
    expect(result).toEqual([]);
  });
});
