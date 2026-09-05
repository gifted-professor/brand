import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadImageConfig } from '../src/providers/image-config.ts';
import { ImageProviderError, OpenAIImageProvider, referenceDataUrl } from '../src/providers/openai-image-provider.ts';

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
  ]) assert.throws(() => loadImageConfig({ ...env, ...change }, tmpdir()));
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
  await provider.generate({ prompt, references: [reference] });
  const payload = JSON.parse(requests[0].body);
  assert.deepEqual(payload.tools, [{ type: 'image_generation', model: 'gpt-image-2', action: 'edit', output_format: 'png' }]);
  assert.deepEqual(payload.input[0].content[1], { type: 'input_image', image_url: reference });
  assert.equal(payload.input[0].content.length, 2);
  assert.match(payload.input[0].content[0].text, /preserve the subject and product details/);
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
    ['response.incomplete', 'image_upstream_connection_lost', 'unknown'],
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

test('one provider rejects overlapping generations, then releases the lock after completion', async (t) => {
  const firstArrived = deferred();
  let heldResponse;
  let calls = 0;
  const { provider, requests } = await fixture(t, (_req, res) => {
    if (++calls === 1) { heldResponse = res; firstArrived.resolve(); }
    else respondImage(res);
  });
  const first = provider.generate({ prompt });
  await firstArrived.promise;
  await expectFailure(() => provider.generate({ prompt: 'second image' }), 'image_provider_busy', 'failed');
  assert.equal(requests.length, 1);
  respondImage(heldResponse);
  const firstAsset = await first;
  const nextAsset = await provider.generate({ prompt: 'next image' });
  assert.equal(requests.length, 2);
  assert.notEqual(firstAsset.assetId, nextAsset.assetId);
  assert.notEqual(firstAsset.requestId, nextAsset.requestId);
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
