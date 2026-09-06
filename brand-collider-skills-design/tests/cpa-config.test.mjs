import test from 'node:test';
import assert from 'node:assert/strict';
import { loadImageConfig } from '../src/providers/image-config.ts';

const savedGateway = { OPENAI_BASE_URL: 'https://gateway.invalid/v1', OPENAI_API_KEY: 'old-gateway-key', IMAGE_CONNECT_IP: '100.84.130.17' };
const cpa = { baseUrl: 'http://100.84.194.46:8317/v1', apiKey: 'test-cpa-key' };

test('CPA isolates its credential and defaults image orchestration to GPT-5.5 independently of text', () => {
  const config = loadImageConfig({ ...savedGateway, OPENAI_PROVIDER: 'cpa' }, '/tmp', () => cpa);
  assert.equal(config.provider, 'cpa');
  assert.equal(config.baseUrl, cpa.baseUrl);
  assert.equal(config.apiKey, cpa.apiKey);
  assert.equal(config.connectIp, undefined);
  assert.equal(config.textModel, 'gpt-6-astra');
  assert.equal(config.responsesModel, 'gpt-5.5');
  assert.equal(config.reasoningEffort, 'low');
  assert.equal(config.imageModel, 'gpt-image-2');
});

test('CPA resolver failure never falls back to a saved gateway key', () => {
  assert.throws(() => loadImageConfig({ ...savedGateway, OPENAI_PROVIDER: 'cpa' }, '/tmp', () => { throw new Error('lookup failed'); }), /lookup failed/);
});

test('gateway mode does not invoke CPA or weaken its HTTP transport requirements', () => {
  const resolver = () => { throw new Error('must not be called'); };
  const config = loadImageConfig(savedGateway, '/tmp', resolver);
  assert.equal(config.apiKey, savedGateway.OPENAI_API_KEY);
  assert.equal(config.connectIp, savedGateway.IMAGE_CONNECT_IP);
  assert.throws(() => loadImageConfig({ ...savedGateway, OPENAI_BASE_URL: cpa.baseUrl }, '/tmp', resolver));
});

test('CPA fails closed on public HTTP, credential URLs, malformed keys and unknown provider names', () => {
  for (const baseUrl of ['http://example.com/v1', 'http://100.128.0.1/v1', 'http://100.63.0.1/v1', 'https://user:pass@example.com/v1']) {
    assert.throws(() => loadImageConfig({ OPENAI_PROVIDER: 'cpa' }, '/tmp', () => ({ ...cpa, baseUrl })));
  }
  assert.throws(() => loadImageConfig({ OPENAI_PROVIDER: 'cpa' }, '/tmp', () => ({ ...cpa, apiKey: '' })));
  assert.throws(() => loadImageConfig({ ...savedGateway, OPENAI_PROVIDER: 'typo' }));
});

test('explicit CPA model choices remain separate and output configuration is preserved', () => {
  const config = loadImageConfig({ OPENAI_PROVIDER: 'cpa', OPENAI_MODEL: 'gpt-6-astra', IMAGE_RESPONSES_MODEL: 'gpt-6-astra', IMAGE_OUTPUT_DIR: 'assets' }, '/tmp', () => cpa);
  assert.equal(config.outputDir, '/tmp/assets');
  assert.equal(config.imageModel, 'gpt-image-2');
});
