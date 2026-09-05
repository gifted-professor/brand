import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageResponseError, parseImageResponse } from '../src/providers/image-response.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 255, 217]).toString('base64');
const webp = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary').toString('base64');
const imageItem = (overrides = {}) => ({ type: 'image_generation_call', id: 'ig_123', status: 'completed', result: png, ...overrides });
const response = (overrides = {}) => ({ id: 'resp_123', status: 'completed', output: [imageItem()], ...overrides });
const sse = (payload, eventName) => `${eventName ? `event: ${eventName}\n` : ''}data: ${JSON.stringify(payload)}\n\n`;

function rejects(raw, code, generationStatus = 'unknown', contentType = 'text/event-stream') {
  assert.throws(() => parseImageResponse(contentType, raw), (error) => {
    assert.ok(error instanceof ImageResponseError);
    assert.equal(error.code, code);
    assert.equal(error.generationStatus, generationStatus);
    return true;
  });
}

test('JSON final image preserves the call and response identifiers', () => {
  assert.deepEqual(parseImageResponse('application/json; charset=utf-8', JSON.stringify(response())), {
    base64: png, mimeType: 'image/png', providerRequestId: 'ig_123', providerResponseId: 'resp_123',
  });
});

test('supports reference gateway JSON without optional statuses or identifiers', () => {
  const parsed = parseImageResponse('application/json', JSON.stringify({ output: [{ type: 'image_generation_call', result: png }] }));
  assert.equal(parsed.base64, png);
  assert.equal(parsed.providerRequestId, null);
  assert.equal(parsed.providerResponseId, null);
});

test('top-level Images compatibility accepts only b64_json with image magic', () => {
  for (const [base64, mimeType] of [[png, 'image/png'], [jpeg, 'image/jpeg'], [webp, 'image/webp']]) {
    assert.deepEqual(parseImageResponse('application/json', JSON.stringify({ data: [{ b64_json: base64 }] })), {
      base64, mimeType, providerRequestId: null, providerResponseId: null,
    });
  }
});

test('handles CRLF, comments, BOM, and multiline SSE data frames', () => {
  const stream = '\uFEFF: keepalive\r\n\r\nevent: response.completed\r\n'
    + 'data: {"type":"response.completed",\r\n'
    + `data: "response":${JSON.stringify(response())}}\r\n\r\n`;
  assert.equal(parseImageResponse('text/event-stream', stream).base64, png);
});

test('uses a named SSE event when payload omits type', () => {
  assert.equal(parseImageResponse('text/event-stream', sse({ response: response() }, 'response.completed')).base64, png);
});

test('ignores partial previews and deduplicates item.done plus response.completed', () => {
  const stream = sse({ type: 'response.created', response: { id: 'resp_123', status: 'in_progress' } })
    + sse({ type: 'response.image_generation_call.partial_image', partial_image_b64: jpeg })
    + sse({ type: 'response.output_item.added', item: imageItem({ result: jpeg }) })
    + sse({ type: 'response.output_item.done', item: imageItem() })
    + sse({ type: 'response.completed', response: response() }) + 'data: [DONE]\n\n';
  assert.deepEqual(parseImageResponse('text/event-stream', stream), {
    base64: png, mimeType: 'image/png', providerRequestId: 'ig_123', providerResponseId: 'resp_123',
  });
});

test('a complete item.done at EOF is a confirmed final even without response.completed', () => {
  const stream = sse({ type: 'response.created', response: { id: 'resp_123' } })
    + `data: ${JSON.stringify({ type: 'response.output_item.done', item: imageItem() })}`;
  assert.equal(parseImageResponse('text/event-stream', stream).providerResponseId, 'resp_123');
});

test('a confirmed final survives a truncated trailing frame', () => {
  const stream = sse({ type: 'response.output_item.done', item: imageItem() }) + 'data: {"type":"response.comp';
  assert.equal(parseImageResponse('text/event-stream', stream).base64, png);
});

test('a truncated stream without a final is unknown, never failed', () => {
  rejects(sse({ type: 'response.created', response: { id: 'resp_123' } }) + 'data: {"type":', 'image_upstream_invalid_response');
  rejects(sse({ type: 'response.image_generation_call.partial_image', partial_image_b64: png }), 'image_no_result');
  rejects('data: [DONE]\n\n', 'image_no_result');
});

test('explicit failed and error events are failed, including after image bytes', () => {
  for (const type of ['response.failed', 'error']) {
    rejects(sse({ type, error: { message: 'internal details must not leak' } }), 'image_upstream_failed', 'failed');
    rejects(sse({ type: 'response.output_item.done', item: imageItem() }) + sse({ type }), 'image_upstream_failed', 'failed');
  }
});

test('incomplete is unknown even if a final image preceded it', () => {
  rejects(sse({ type: 'response.incomplete', response: { status: 'incomplete' } }), 'image_upstream_incomplete');
  rejects(sse({ type: 'response.output_item.done', item: imageItem() }) + sse({ type: 'response.incomplete' }), 'image_upstream_incomplete');
});

test('JSON failure statuses and error envelopes cannot become successful images', () => {
  rejects(JSON.stringify(response({ status: 'failed' })), 'image_upstream_failed', 'failed', 'application/json');
  rejects(JSON.stringify({ error: { message: 'secret diagnostic' } }), 'image_upstream_failed', 'failed', 'application/json');
  for (const type of ['error', 'response.failed']) {
    rejects(JSON.stringify(response({ type })), 'image_upstream_failed', 'failed', 'application/json');
  }
  for (const status of ['incomplete', 'in_progress', 'queued']) {
    rejects(JSON.stringify(response({ status })), 'image_upstream_incomplete', 'unknown', 'application/json');
  }
});

test('a non-final image call status cannot count as a completed result', () => {
  rejects(sse({ type: 'response.output_item.done', item: imageItem({ status: 'generating' }) }), 'image_upstream_incomplete');
});

test('multi-megabyte image base64 can be checked without regex stack exhaustion', () => {
  const bytes = Buffer.alloc(3 * 1024 * 1024);
  Buffer.from(png, 'base64').copy(bytes);
  const base64 = bytes.toString('base64');
  assert.equal(parseImageResponse('application/json', JSON.stringify({ data: [{ b64_json: base64 }] })).base64, base64);
});

test('rejects malformed base64, non-image bytes, and mismatched output format', () => {
  for (const result of ['not-base64!', 'SGVsbG8=', png.slice(0, -1), '/9j/4A==garbage']) {
    rejects(JSON.stringify(response({ output: [imageItem({ result })] })), 'image_upstream_invalid_image', 'unknown', 'application/json');
  }
  rejects(JSON.stringify(response({ output: [imageItem({ output_format: 'jpeg' })] })), 'image_upstream_invalid_image', 'unknown', 'application/json');
});

test('base64 must have canonical padding bits and exact signatures', () => {
  rejects(JSON.stringify({ data: [{ b64_json: '/9j/4B==' }] }), 'image_upstream_invalid_image', 'unknown', 'application/json');
  for (const bytes of [Buffer.from('RIFFxxxxFAKE'), Buffer.from([137, 80, 78, 71]), Buffer.from('GIF89a')]) {
    rejects(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }), 'image_upstream_invalid_image', 'unknown', 'application/json');
  }
});

test('does not mistake prompt images, metadata URLs, or nested compatibility data for output', () => {
  const payload = {
    input: [{ type: 'input_image', image_url: `data:image/png;base64,${png}` }],
    metadata: { url: 'https://example.com/image.png', b64_json: png },
    data: [{ url: 'https://example.com/image.png' }],
    output: [{ type: 'message', content: [{ url: `data:image/png;base64,${png}`, b64_json: png }] }],
  };
  rejects(JSON.stringify(payload), 'image_no_result', 'unknown', 'application/json');
  rejects(sse({ type: 'response.output_item.done', item: { type: 'input_image', result: png } }), 'image_no_result');
});

test('rejects distinct final images instead of silently dropping results', () => {
  rejects(JSON.stringify(response({ output: [imageItem(), imageItem({ id: 'ig_456', result: jpeg })] })), 'image_multiple_results', 'unknown', 'application/json');
});

test('rejects mixed response IDs in one SSE response', () => {
  rejects(sse({ type: 'response.created', response: { id: 'resp_other' } })
    + sse({ type: 'response.completed', response: response() }), 'image_upstream_invalid_response');
});

test('malformed envelopes and incompatible content types remain unknown', () => {
  for (const raw of ['{', 'null', '[]']) rejects(raw, 'image_upstream_invalid_response', 'unknown', 'application/json');
  rejects('<html>Proxy error</html>', 'image_upstream_invalid_response', 'unknown', 'text/html');
  rejects('data: {"type":"response.completed","response":null}\n\n', 'image_upstream_invalid_response');
  rejects(sse({ type: 'response.completed', response: response() }, 'response.output_item.done'), 'image_upstream_invalid_response');
});
