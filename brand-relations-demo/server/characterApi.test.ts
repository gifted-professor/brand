import { describe, expect, it } from 'vitest';
import { generateAiCharacters } from './characterApi';
import { createLocalCandidates } from '../src/engines/characterGenome';
const brief = { name: 'Test', category: '', offers: 'Product design and prototyping.', needs: 'Manufacturing.', identity: 'Warm.' };
describe('OpenAI character adapter (mocked provider)', () => {
  it('uses server authorization, structured output and validated shared geometry', async () => {
    const templates = createLocalCandidates(brief);
    const payload = { capabilities: templates[0].capabilities, parts: templates[0].parts, candidates: templates.map(({ name, palette, silhouette, signature }) => ({ name, palette, silhouette, signature })) };
    const fetcher: typeof fetch = async (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only' });
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      expect(JSON.parse(body.input)).toEqual(brief);
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }));
    };
    const results = await generateAiCharacters(brief, { key: 'test-only', model: 'test-model' }, undefined, fetcher);
    expect(results).toHaveLength(3);
    expect(results.every(result => result.source === 'ai')).toBe(true);
  });
  it('handles service failure, refusal and incomplete output without a fake success', async () => {
    for (const response of [new Response('{}', { status: 429 }), new Response(JSON.stringify({ status: 'incomplete' })), new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }))]) {
      await expect(generateAiCharacters(brief, { key: 'test-only', model: 'test-model' }, undefined, async () => response)).rejects.toThrow();
    }
  });
});
