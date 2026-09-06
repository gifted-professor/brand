import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { loadImageConfig } from '../src/providers/image-config.ts';
import { ImageProviderError, OpenAIImageProvider, referenceDataUrl } from '../src/providers/openai-image-provider.ts';
import { imageGenerationQueue, reconcileUnknownImageRequest } from '../src/providers/image-queue.ts';

// All endpoints in these tests are ephemeral loopback servers. Never read .env.local.
const key = 'sk-test-local-only-do-not-use';
const prompt = 'Confidential test prompt: ceramic bottle';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;
const finalStream = frame({ type: 'response.created', response: { id: 'resp_local', status: 'in_progress' } })
  + frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', id: 'ig_local', status: 'completed', result: png.toString('base64'), output_format: 'png' } })
  + frame({ type: 'response.completed', response: { id: 'resp_local', status: 'completed', output: [] } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function respondImage(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Request-ID': 'gateway_local' });
  // Exercise HTTP chunk boundaries inside SSE fields and image data.
  res.write(finalStream.slice(0, 83));
  res.end(finalStream.slice(83));
}

async function fixture(t, handler = (_req, res) => respondImage(res)) {
  const directory = await mkdtemp(join(tmpdir(), 'brand-image-provider-test-'));
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const record = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    requests.push(record);
    handler(req, res, record);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const request of requests) reconcileUnknownImageRequest({ requestId: request.headers['x-request-id'], outcome: 'cancelled',
      evidence: 'Local fixture HTTP server and all connections have been closed; no upstream generation exists.' });
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = loadImageConfig({ OPENAI_BASE_URL: `${origin}/v1/`, OPENAI_API_KEY: key,
    OPENAI_MODEL: 'deepseek-v4-flash', IMAGE_RESPONSES_MODEL: 'gpt-5.5', IMAGE_MODEL: 'gpt-image-2',
    IMAGE_OUTPUT_DIR: join(directory, 'images'), IMAGE_TIMEOUT_MS: '1000' }, directory);
  return { directory, requests, origin, config, provider: new OpenAIImageProvider(config) };
}

async function expectFailure(operation, code, status = 'unknown') {
  let failure;
  await assert.rejects(operation, (error) => {
    failure = error;
    assert.ok(error instanceof ImageProviderError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.generationStatus, status);
    assert.equal(error.retryable, false);
    const diagnostic = `${error.stack}\n${JSON.stringify(error)}`;
    assert.ok(!diagnostic.includes(key), 'credentials must not escape in errors');
    assert.ok(!diagnostic.includes(prompt), 'request content must not escape in errors');
    assert.ok(!diagnostic.includes('private-upstream-diagnostic'), 'upstream bodies must not escape in errors');
    return true;
  });
  return failure;
}

async function assertFailureRecord(config, error) {
  const folders = await readdir(config.outputDir);
  assert.equal(folders.length, 1);
  const folder = join(config.outputDir, folders[0]);
  assert.deepEqual(await readdir(folder), ['request.json']);
  const raw = await readFile(join(folder, 'request.json'), 'utf8');
  const saved = JSON.parse(raw);
  assert.equal(saved.requestId, error.requestId);
  assert.equal(saved.error, error.code);
  assert.equal(saved.generationStatus, error.generationStatus);
  assert.equal(saved.retryable, false);
  assert.deepEqual(saved.diagnostics.upstreamFailure, error.upstreamFailure);
  assert.ok(!raw.includes(key) && !raw.includes(prompt));
}

test('configuration normalizes origin and /v1 without treating the text model as an image model', () => {
  for (const base of ['http://127.0.0.1:12345', 'http://127.0.0.1:12345/', 'http://127.0.0.1:12345/v1', 'http://127.0.0.1:12345/v1///']) {
    const config = loadImageConfig({ OPENAI_BASE_URL: base, OPENAI_API_KEY: key, OPENAI_MODEL: 'deepseek-v4-flash' }, tmpdir());
    assert.equal(config.baseUrl, 'http://127.0.0.1:12345/v1');
    assert.equal(config.textModel, 'deepseek-v4-flash');
    assert.equal(config.responsesModel, 'gpt-5.5');
    assert.equal(config.imageModel, 'gpt-image-2');
  }
});

test('configuration rejects unsafe URL forms, missing keys, unsupported models and invalid timeouts', () => {
  const env = { OPENAI_BASE_URL: 'http://127.0.0.1:12345/v1', OPENAI_API_KEY: key };
  for (const change of [
    { OPENAI_BASE_URL: '[https://example.test/v1](https://example.test/v1)' },
    { OPENAI_BASE_URL: 'http://example.test/v1' },
    { OPENAI_BASE_URL: 'https://user:secret@example.test/v1' },
    { OPENAI_BASE_URL: 'https://example.test/v1?token=secret' },
    { OPENAI_BASE_URL: 'https://example.test/v1#secret' },
    { OPENAI_BASE_URL: 'https://example.test/v1/responses' },
    { OPENAI_API_KEY: '' }, { OPENAI_API_KEY: 'replace-with-your-key' }, { OPENAI_API_KEY: 'two words' },
    { IMAGE_MODEL: 'deepseek-v4-flash' }, { IMAGE_RESPONSES_MODEL: 'bad model' },
    { IMAGE_TIMEOUT_MS: '0' }, { IMAGE_TIMEOUT_MS: '1000.5' }, { IMAGE_TIMEOUT_MS: '1800001' },
    { IMAGE_CONNECT_IP: 'not-an-ip' },
    { IMAGE_REASONING_EFFORT: 'super' }, { IMAGE_OPTIMIZE_REFERENCES: 'yes' },
    { IMAGE_FINAL_IMAGE_GRACE_MS: '-1' }, { IMAGE_FINAL_IMAGE_GRACE_MS: '10001' },
  ]) assert.throws(() => loadImageConfig({ ...env, ...change }, tmpdir()));
});

test('reasoning can use upstream default and reference optimization and tail grace can be disabled', () => {
  const config = loadImageConfig({ OPENAI_BASE_URL: 'http://127.0.0.1:12345', OPENAI_API_KEY: key,
    IMAGE_REASONING_EFFORT: 'auto', IMAGE_OPTIMIZE_REFERENCES: 'false', IMAGE_FINAL_IMAGE_GRACE_MS: '0' });
  assert.equal(config.reasoningEffort, undefined);
  assert.equal(config.optimizeReferences, false);
  assert.equal(config.finalImageGraceMs, 0);
  assert.equal(loadImageConfig({ OPENAI_BASE_URL: config.baseUrl, OPENAI_API_KEY: key, IMAGE_RESPONSES_MODEL: 'other-model' }).reasoningEffort, undefined);
});

test('complete SSE events return before an open HTTP stream ends, with measured progress', async (t) => {
  for (const ending of ['completed', 'done', 'item_only']) {
    const { config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(frame({ type: 'response.created', response: { id: 'resp_local' } }));
      res.write(frame({ type: 'response.image_generation_call.generating' }));
      const item = frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: png.toString('base64') } });
      res.write(item + (ending === 'completed' ? frame({ type: 'response.completed', response: { id: 'resp_local', status: 'completed', output: [] } }) : ending === 'done' ? 'data: [DONE]\n\n' : ''));
      // Deliberately never res.end(): recreates the CPA tail stall.
    });
    const progress = [];
    const provider = new OpenAIImageProvider({ ...config, finalImageGraceMs: 60 });
    const asset = await provider.generate({ prompt }, (event) => { progress.push(event); });
    assert.ok(asset.diagnostics.totalMs < 650, `must return before 1000ms timeout: ${JSON.stringify(asset.diagnostics)}`);
    assert.equal(asset.diagnostics.completionReason, { completed: 'response_completed', done: 'stream_done', item_only: 'image_tail_grace' }[ending]);
    assert.equal(asset.diagnostics.responseCompleted, ending === 'completed');
    assert.ok(asset.diagnostics.finalImageMs >= 0);
    assert.ok(asset.diagnostics.headersReceivedMs >= 0);
    assert.equal(asset.diagnostics.requestBytes, Buffer.byteLength(requests[0].body));
    assert.equal(progress[0].stage, 'preparing');
    assert.equal(progress.at(-1).stage, 'completed');
    assert.ok(progress.some(event => event.stage === 'image_received'));
    assert.equal(requests.length, 1);
    t.diagnostic(`${ending}: local hanging-stream request returned in ${asset.diagnostics.totalMs}ms`);
  }
});

test('tail grace observes delayed failures and additional images before publishing', async (t) => {
  for (const [tail, code, status] of [
    [frame({ type: 'response.failed' }), 'image_upstream_failed', 'failed'],
    [frame({ type: 'response.incomplete' }), 'image_upstream_incomplete', 'unknown'],
    [frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: Buffer.concat([png, Buffer.from([0])]).toString('base64') } }), 'image_multiple_results', 'unknown'],
  ]) {
    const { config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: png.toString('base64') } }));
      setTimeout(() => res.write(tail), 30);
    });
    const provider = new OpenAIImageProvider({ ...config, finalImageGraceMs: 100 });
    const error = await expectFailure(() => provider.generate({ prompt }), code, status);
    await assertFailureRecord(config, error);
    assert.equal(requests.length, 1);
  }
});

test('partial images never trigger tail grace and progress callback errors cannot retry a request', async (t) => {
  const { config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(frame({ type: 'response.image_generation_call.partial_image', partial_image_b64: png.toString('base64') }));
  });
  const provider = new OpenAIImageProvider({ ...config, finalImageGraceMs: 20 });
  const error = await expectFailure(() => provider.generate({ prompt }, () => { throw new Error('observer'); }), 'image_upstream_timeout');
  assert.equal(error.diagnostics.finalImageMs, undefined);
  assert.ok(error.diagnostics.requestMs >= 900);
  assert.equal(requests.length, 1);
});

test('a malformed final candidate does not announce an image or shorten the wait for a valid result', async (t) => {
  const { config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: 'not an image' } }));
    setTimeout(() => res.end(frame({ type: 'response.completed', response: { status: 'completed', output: [
      { type: 'image_generation_call', status: 'completed', result: png.toString('base64') },
    ] } })), 100);
  });
  const stages = [];
  const asset = await new OpenAIImageProvider({ ...config, finalImageGraceMs: 20 }).generate({ prompt }, progress => stages.push(progress));
  assert.deepEqual(await readFile(asset.path), png);
  assert.equal(asset.diagnostics.completionReason, 'response_completed');
  assert.ok(!stages.some(event => event.stage === 'image_received' && event.elapsedMs < 80));
  assert.equal(requests.length, 1);
});

test('generation sends the exact authenticated Responses wire payload with independent models', async (t) => {
  const { provider, requests } = await fixture(t);
  const asset = await provider.generate({ prompt: `  ${prompt}  `, ratio: '3:4', detail: '4K', negativePrompt: '  no text  ' });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/v1/responses');
  assert.equal(request.headers.authorization, `Bearer ${key}`);
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(Number(request.headers['content-length']), Buffer.byteLength(request.body));
  assert.equal(request.headers['x-request-id'], asset.requestId);
  assert.match(asset.requestId, uuid);
  assert.deepEqual(JSON.parse(request.body), {
    model: 'gpt-5.5', stream: true, tool_choice: { type: 'image_generation' },
    reasoning: { effort: 'low' },
    input: [{ role: 'user', content: [{ type: 'input_text', text: `${prompt}\n\nOutput composition ratio: 3:4.\n\nRequested detail tier: 4K.\n\nAvoid these elements: no text` }] }],
    tools: [{ type: 'image_generation', model: 'gpt-image-2', action: 'generate', output_format: 'png' }],
  });
  assert.ok(!request.body.includes('deepseek'));
});

test('final SSE image saves exact bytes, content hash and unverified metadata without secrets or prompts', async (t) => {
  const { provider, config } = await fixture(t);
  const asset = await provider.generate({ prompt });
  assert.deepEqual(await readFile(asset.path), png);
  assert.equal(asset.contentHash, createHash('sha256').update(png).digest('hex'));
  assert.equal(asset.generationStatus, 'succeeded');
  assert.equal(asset.reviewStatus, 'unverified');
  assert.equal(asset.model, 'gpt-image-2');
  assert.equal(asset.responsesModel, 'gpt-5.5');
  assert.equal(asset.providerRequestId, 'ig_local');
  assert.equal(asset.providerResponseId, 'resp_local');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.path, join(config.outputDir, asset.assetId, 'image.png'));
  assert.ok(Number.isFinite(Date.parse(asset.createdAt)));
  const metadata = await readFile(asset.metadataPath, 'utf8');
  assert.deepEqual(JSON.parse(metadata), asset);
  assert.ok(!metadata.includes(key) && !metadata.includes(prompt));
  assert.deepEqual((await readdir(join(config.outputDir, asset.assetId))).sort(), ['asset.json', 'image.png']);
  assert.equal((await stat(asset.path)).mode & 0o777, 0o600);
  assert.equal((await stat(asset.metadataPath)).mode & 0o777, 0o600);
});

test('catalog check only performs GET and reports listing separately from generation verification', async (t) => {
  let catalog = ['gpt-image-2', 'gpt-5.5', 'deepseek-v4-flash'];
  const { provider, config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [...catalog.map((id) => ({ id })), null, { id: 123 }] }));
  });
  const result = await provider.check();
  assert.deepEqual(result, { provider: 'openai-compatible', baseUrl: config.baseUrl, imageModel: 'gpt-image-2', responsesModel: 'gpt-5.5',
    imageModelListed: true, responsesModelListed: true, textModel: 'deepseek-v4-flash', textModelListed: true,
    generationVerified: false, connectionOverride: false });
  catalog = ['deepseek-v4-flash'];
  const missing = await provider.check();
  assert.equal(missing.imageModelListed, false);
  assert.equal(missing.responsesModelListed, false);
  assert.equal(missing.generationVerified, false);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/v1/models');
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    assert.equal(request.body, '');
  }
  await assert.rejects(stat(config.outputDir), { code: 'ENOENT' });
});

test('local reference images produce an edit tool call and input_image data URLs', async (t) => {
  const { provider, requests } = await fixture(t);
  const reference = referenceDataUrl(png);
  const asset = await provider.generate({ prompt, references: [reference] });
  const payload = JSON.parse(requests[0].body);
  assert.deepEqual(payload.tools, [{ type: 'image_generation', model: 'gpt-image-2', action: 'edit', output_format: 'png' }]);
  assert.deepEqual(payload.input[0].content[1], { type: 'input_image', image_url: reference });
  assert.equal(payload.input[0].content.length, 2);
  assert.match(payload.input[0].content[0].text, /preserve the subject and product details/);
  assert.deepEqual(asset.referenceInputs, [{ contentHash: createHash('sha256').update(png).digest('hex'), mimeType: 'image/png', bytes: png.length }]);
});

test('transparent API reference persists distinct source and actual submission hashes with presentation provenance', async t => {
  const { provider, requests } = await fixture(t);
  const raw = Buffer.alloc(32 * 8 * 4);
  raw.set([4, 0, 0, 255], 0);
  const source = await sharp(raw, { raw: { width: 32, height: 8, channels: 4 } }).png().toBuffer();
  const asset = await provider.generate({ prompt, references: [referenceDataUrl(source)] });
  assert.equal(requests.length, 1);
  const submittedUrl = JSON.parse(requests[0].body).input[0].content[1].image_url;
  const submitted = Buffer.from(submittedUrl.slice(submittedUrl.indexOf(',') + 1), 'base64');
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const submittedHash = createHash('sha256').update(submitted).digest('hex');
  assert.notEqual(sourceHash, submittedHash);
  assert.equal(asset.referenceInputs[0].contentHash, submittedHash);
  const [preparation] = asset.diagnostics.referencePreparation;
  assert.equal(preparation.originalHash, sourceHash);
  assert.equal(preparation.preparedHash, submittedHash);
  assert.deepEqual(preparation.presentation, { type: 'alpha-composite', background: '#ffffff' });
  assert.deepEqual([preparation.width, preparation.height, preparation.resized], [32, 8, false]);
  const saved = JSON.parse(await readFile(asset.metadataPath, 'utf8'));
  assert.deepEqual(saved.diagnostics.referencePreparation, asset.diagnostics.referencePreparation);
  const actual = await sharp(submitted).raw().toBuffer();
  assert.deepEqual([...actual.subarray(0, 6)], [4, 0, 0, 255, 255, 255]);
});

test('invalid input and references fail before any HTTP request or output directory is created', async (t) => {
  const { provider, config, requests } = await fixture(t);
  for (const [input, code] of [
    [null, 'invalid_prompt'], [{ prompt: ' ' }, 'invalid_prompt'], [{ prompt: 'x'.repeat(12001) }, 'invalid_prompt'],
    [{ prompt, negativePrompt: 123 }, 'invalid_negative_prompt'], [{ prompt, negativePrompt: 'x'.repeat(4001) }, 'invalid_negative_prompt'],
    [{ prompt, ratio: '2:2' }, 'invalid_ratio'], [{ prompt, detail: '8K' }, 'invalid_detail'],
    [{ prompt, references: 'file.png' }, 'invalid_references'], [{ prompt, references: Array(5).fill(referenceDataUrl(png)) }, 'invalid_references'],
    [{ prompt, references: ['https://example.test/image.png'] }, 'invalid_reference_image'],
    [{ prompt, references: [`data:image/jpeg;base64,${png.toString('base64')}`] }, 'invalid_reference_image'],
    [{ prompt, references: ['data:image/png;base64,SGVsbG8='] }, 'invalid_reference_image'],
    [{ prompt, references: ['data:image/jpeg;base64,/9j/4B=='] }, 'invalid_reference_image'],
  ]) await expectFailure(() => provider.generate(input), code, 'failed');
  assert.equal(requests.length, 0);
  await assert.rejects(stat(config.outputDir), { code: 'ENOENT' });
});

test('HTTP 500 has unknown outcome, one attempt and a redacted durable failure record', async (t) => {
  const { provider, config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `${key} ${prompt} private-upstream-diagnostic` }));
  });
  const error = await expectFailure(() => provider.generate({ prompt }), 'image_upstream_http_500');
  assert.match(error.requestId, uuid);
  assert.equal(requests.length, 1);
  await assertFailureRecord(config, error);
});

test('terminal, disconnect, JSON and HTTP failures durably retain safe categories without raw diagnostics or retry', async (t) => {
  const privateMessage = `${key} ${prompt} private-upstream-diagnostic`;
  const payload = { type: 'response.failed', response: { status: 'failed',
    error: { code: 'server_error', type: 'api_error', message: privateMessage, param: privateMessage } } };
  for (const ending of ['terminal', 'disconnect', 'json', 'http']) {
    const { provider, config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(ending === 'http' ? 503 : 200, { 'Content-Type': ['http', 'json'].includes(ending) ? 'application/json' : 'text/event-stream' });
      if (ending === 'terminal') res.write(frame(payload)); // Terminal frame must settle an open stream.
      if (ending === 'disconnect') {
        res.write(frame(payload).trimEnd()); // Parser still reads a complete final event at disconnected EOF.
        setTimeout(() => res.destroy(), 20);
      }
      if (ending === 'json' || ending === 'http') res.end(JSON.stringify(payload.response));
    });
    const error = await expectFailure(() => provider.generate({ prompt }), ending === 'http' ? 'image_upstream_http_503' : 'image_upstream_failed', ending === 'http' ? 'unknown' : 'failed');
    assert.deepEqual(error.upstreamFailure, { ...(['terminal', 'disconnect'].includes(ending) ? { event: 'response.failed' } : {}),
      status: 'failed', code: 'server_error', type: 'api_error' });
    assert.equal(error.diagnostics.httpStatus, ending === 'http' ? 503 : 200);
    assert.equal(error.diagnostics.responseCompleted, false);
    assert.equal(requests.length, 1);
    await assertFailureRecord(config, error);
    const folders = await readdir(config.outputDir);
    const saved = await readFile(join(config.outputDir, folders[0], 'request.json'), 'utf8');
    assert.ok(!saved.includes(privateMessage) && !saved.includes('private-upstream-diagnostic'));
  }
});

test('unknown upstream error codes and types cannot exfiltrate content through saved diagnostics', async (t) => {
  const { provider, config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(frame({ type: 'error', code: key, error: { code: key, type: prompt, message: 'private-upstream-diagnostic' } }));
  });
  const error = await expectFailure(() => provider.generate({ prompt }), 'image_upstream_failed', 'failed');
  assert.deepEqual(error.upstreamFailure, { event: 'error', code: 'unrecognized', type: 'unrecognized' });
  assert.equal(requests.length, 1);
  await assertFailureRecord(config, error);
});

test('HTTP 401, 403 and 429 are failed outcomes without retry or upstream diagnostics', async (t) => {
  for (const status of [401, 403, 429]) {
    const { provider, config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(status);
      res.end(`${key} ${prompt} private-upstream-diagnostic`);
    });
    const error = await expectFailure(() => provider.generate({ prompt }), `image_upstream_http_${status}`, 'failed');
    assert.equal(requests.length, 1);
    await assertFailureRecord(config, error);
  }
});

test('HTTP 408 and 499 preserve unknown outcome with no automatic retry', async (t) => {
  for (const status of [408, 499]) {
    const { provider, config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(status);
      res.end(`${key} ${prompt} private-upstream-diagnostic`);
    });
    const error = await expectFailure(() => provider.generate({ prompt }), `image_upstream_http_${status}`);
    assert.equal(requests.length, 1);
    await assertFailureRecord(config, error);
  }
});

test('request deadline times out as unknown with exactly one billable attempt', async (t) => {
  const { provider, config, requests } = await fixture(t, () => {});
  const error = await expectFailure(() => provider.generate({ prompt }), 'image_upstream_timeout');
  assert.equal(requests.length, 1);
  await assertFailureRecord(config, error);
});

test('connection loss before response never retries and records an unknown outcome', async (t) => {
  const { provider, config, requests } = await fixture(t, (req) => req.socket.destroy());
  const error = await expectFailure(() => provider.generate({ prompt }), 'image_upstream_connection_failed');
  assert.equal(requests.length, 1);
  await assertFailureRecord(config, error);
});

test('aborted response is unknown and cannot save a partial preview as the final image', async (t) => {
  const { provider, config, requests } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(frame({ type: 'response.image_generation_call.partial_image', partial_image_b64: png.toString('base64') }));
    setImmediate(() => res.destroy());
  });
  const error = await expectFailure(() => provider.generate({ prompt }), 'image_upstream_connection_lost');
  assert.equal(requests.length, 1);
  await assertFailureRecord(config, error);
});

test('a fully received final SSE image survives later disconnect or deadline without retry', async (t) => {
  for (const ending of ['disconnect', 'deadline']) {
    const { provider, requests } = await fixture(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // No response.completed or HTTP end: the item.done itself confirms the image.
      res.write(frame({ type: 'response.output_item.done', item: { type: 'image_generation_call', id: 'ig_final', status: 'completed', result: png.toString('base64') } }));
      if (ending === 'disconnect') setTimeout(() => res.destroy(), 20);
    });
    const asset = await provider.generate({ prompt });
    assert.equal(asset.generationStatus, 'succeeded', ending);
    assert.equal(asset.providerRequestId, 'ig_final');
    assert.deepEqual(await readFile(asset.path), png);
    assert.equal(requests.length, 1);
  }
});

test('explicit failure or incomplete after a final SSE image cannot be salvaged on disconnect', async (t) => {
  for (const [event, code, status] of [
    ['response.failed', 'image_upstream_failed', 'failed'],
    ['response.incomplete', 'image_upstream_incomplete', 'unknown'],
  ]) {
    const { provider, config, requests } = await fixture(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(finalStream + frame({ type: event }));
      setTimeout(() => res.destroy(), 20);
    });
    const error = await expectFailure(() => provider.generate({ prompt }), code, status);
    assert.equal(requests.length, 1);
    await assertFailureRecord(config, error);
  }
});

test('providers share four FIFO slots, refill on failure, and isolate independent requests', async (t) => {
  const fourArrived = deferred(), fifthArrived = deferred();
  const held = [];
  let live = 0, peak = 0, releaseRest = false;
  const finish = (res) => { live -= 1; respondImage(res); };
  const { provider, config, requests } = await fixture(t, (_req, res) => {
    live += 1; peak = Math.max(peak, live); held.push(res);
    if (held.length === 4) fourArrived.resolve();
    if (held.length === 5) fifthArrived.resolve();
    if (releaseRest) finish(res);
  });
  const otherProvider = new OpenAIImageProvider(config);
  const inputs = Array.from({ length: 7 }, (_, index) => ({ prompt: `independent image ${index}` }));
  const results = Promise.allSettled(inputs.map((input, index) => (index % 2 ? provider : otherProvider).generate(input)));
  await fourArrived.promise;
  assert.equal(requests.length, 4, 'the entire process shares the limit across instances');
  // Mutations after enqueue must not change the request eventually submitted.
  inputs[4].prompt = 'mutated after queueing';
  live -= 1;
  held[0].writeHead(401); held[0].end();
  await fifthArrived.promise;
  assert.equal(requests.length, 5, 'failure promptly frees a slot');
  assert.match(requests[4].body, /independent image 4/);
  assert.doesNotMatch(requests[4].body, /mutated after queueing/);
  releaseRest = true;
  held.slice(1).forEach(finish);
  const completed = await results;
  assert.equal(peak, 4);
  assert.equal(completed.filter(result => result.status === 'fulfilled').length, 6);
  const failure = completed.find(result => result.status === 'rejected').reason;
  assert.equal(failure.code, 'image_upstream_http_401');
  assert.equal(failure.generationStatus, 'failed');
  assert.equal(requests.length, 7, 'each task submits exactly one request');
  const successes = completed.filter(result => result.status === 'fulfilled').map(result => result.value);
  assert.equal(new Set(successes.map(asset => asset.requestId)).size, 6);
});

test('unknown requests retain all four slots until the host reconciles a confirmed terminal outcome', async t => {
  let release = false;
  const { provider, requests } = await fixture(t, (_req, res) => { if (release) respondImage(res); });
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, id) => provider.generate({ prompt: `unknown slot ${id}` })));
  assert.equal(requests.length, 4, 'a timeout does not prove that upstream generation has stopped');
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.generationStatus === 'unknown').length, 4);
  assert.equal(results.at(-1).reason.code, 'image_provider_waiting_capacity');
  const capacity = imageGenerationQueue.status();
  assert.equal(capacity.active, 0); assert.equal(capacity.unknown, 4);
  await expectFailure(() => provider.generate({ prompt: 'must remain blocked' }), 'image_provider_waiting_capacity', 'failed');
  assert.equal(requests.length, 4);
  assert.throws(() => reconcileUnknownImageRequest({ requestId: capacity.unknownRequestIds[0], outcome: 'failed', evidence: '' }), /invalid_reconciliation/);
  release = true;
  reconcileUnknownImageRequest({ requestId: capacity.unknownRequestIds[0], outcome: 'cancelled',
    evidence: 'Local test fixture has no background work; its timed-out request is confirmed terminated.' });
  const asset = await provider.generate({ prompt: 'one reconciled slot' });
  assert.equal(asset.generationStatus, 'succeeded');
  assert.equal(requests.length, 5);
  assert.equal(imageGenerationQueue.status().unknown, 3);
});

test('GET and POST redirects are not followed or given credentials at their target', async (t) => {
  const target = await fixture(t);
  const source = await fixture(t, (_req, res) => {
    res.writeHead(307, { Location: `${target.origin}/redirect-target` });
    res.end(`${key} private-upstream-diagnostic`);
  });
  await expectFailure(() => source.provider.check(), 'image_upstream_http_307', 'failed');
  await expectFailure(() => source.provider.generate({ prompt }), 'image_upstream_http_307', 'failed');
  assert.equal(source.requests.length, 2);
  assert.deepEqual(source.requests.map((entry) => entry.method), ['GET', 'POST']);
  assert.equal(target.requests.length, 0);
});

test('unwritable output storage prevents HTTP submission and does not permanently lock the provider', async (t) => {
  const { directory, config, requests } = await fixture(t);
  const blockedPath = join(directory, 'blocked');
  await writeFile(blockedPath, 'This is a file, not a directory.');
  const provider = new OpenAIImageProvider({ ...config, outputDir: blockedPath });
  await expectFailure(() => provider.generate({ prompt }), 'image_storage_error', 'failed');
  assert.equal(requests.length, 0);
  await rm(blockedPath);
  const asset = await provider.generate({ prompt });
  assert.equal(asset.generationStatus, 'succeeded');
  assert.equal(requests.length, 1);
});
