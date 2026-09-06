import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageStreamObserver } from '../src/providers/image-stream.ts';

const frame = (payload, name = '') => `${name ? `event: ${name}\n` : ''}data: ${JSON.stringify(payload)}\n\n`;
const item = (overrides = {}) => ({ type: 'image_generation_call', status: 'completed', result: 'final-image-bytes', ...overrides });
const completed = (overrides = {}) => ({ type: 'response.completed', response: { status: 'completed', output: [item()], ...overrides } });

test('only fully delimited response.completed supplies a completed terminal', () => {
  const observer = new ImageStreamObserver();
  const event = frame(completed());
  assert.deepEqual(observer.push(event.slice(0, -1)), { milestones: [], terminal: null });
  assert.deepEqual(observer.push('\n'), { milestones: ['image_received', 'completed'], terminal: 'completed' });
});

test('a final output item is progress only; tool completion or partial previews cannot finish', () => {
  const observer = new ImageStreamObserver();
  assert.deepEqual(observer.push(frame({ type: 'response.image_generation_call.partial_image', partial_image_b64: 'preview' })), { milestones: [], terminal: null });
  assert.deepEqual(observer.push(frame({ type: 'response.image_generation_call.completed' })), { milestones: [], terminal: null });
  assert.deepEqual(observer.push(frame({ type: 'response.output_item.done', item: item() })), { milestones: ['image_received'], terminal: null });
  assert.deepEqual(observer.push(frame({ type: 'response.output_item.done', item: item() })), { milestones: [], terminal: null });
});

test('incremental decoder handles every byte boundary in BOM, UTF-8, CRLF, and multiline data', () => {
  const raw = '\uFEFF: keepalive\r\n\r\nevent: response.completed\r\n'
    + 'data: {"response":\r\n'
    + `data: ${JSON.stringify({ status: 'completed', metadata: { label: '酷态科🔋' }, output: [item()] })}}\r\n\r\n`;
  const observer = new ImageStreamObserver();
  const stages = [];
  let result;
  for (const byte of Buffer.from(raw)) {
    result = observer.push(Buffer.from([byte]));
    stages.push(...result.milestones);
  }
  assert.deepEqual(stages, ['image_received', 'completed']);
  assert.equal(result.terminal, 'completed');
});

test('supports bare CR and named event fallback, and resets a name after its event', () => {
  const observer = new ImageStreamObserver();
  assert.deepEqual(observer.push('event: response.created\rdata: {"response":{"id":"r"}}\r\r'), { milestones: ['accepted'], terminal: null });
  assert.deepEqual(observer.push(frame({ type: 'response.image_generation_call.generating' })), { milestones: ['generating'], terminal: null });
  assert.deepEqual(observer.push(frame(completed(), 'message')), { milestones: ['image_received', 'completed'], terminal: 'completed' });
});

test('deduplicates stages and emits no payload values or upstream diagnostics', () => {
  const observer = new ImageStreamObserver();
  const stream = frame({ type: 'response.created', response: { id: 'r', metadata: 'secret' } })
    + frame({ type: 'response.in_progress', response: { id: 'r' } })
    + frame({ type: 'response.image_generation_call.in_progress' })
    + frame({ type: 'response.image_generation_call.generating' })
    + frame({ type: 'response.output_item.done', item: item() });
  assert.deepEqual(observer.push(stream), { milestones: ['accepted', 'generating', 'image_received'], terminal: null });
  assert.deepEqual(observer.push(frame({ type: 'error', error: { message: 'sensitive upstream detail' } })), { milestones: [], terminal: 'failed' });
});

test('mismatched event names, malformed payloads, and incomplete frames never announce completion', () => {
  const observer = new ImageStreamObserver();
  const raw = frame(completed(), 'response.output_item.done')
    + 'data: {broken}\n\ndata: null\n\ndata: []\n\n'
    + frame({ type: 'response.completed', response: null });
  assert.deepEqual(observer.push(raw), { milestones: [], terminal: null });
  assert.deepEqual(observer.push('data: {"type":"response.completed"'), { milestones: [], terminal: null });
});

test('failure or incomplete after final bytes in the same chunk wins over completed', () => {
  for (const [type, terminal] of [['response.failed', 'failed'], ['error', 'failed'], ['response.incomplete', 'incomplete']]) {
    const observer = new ImageStreamObserver();
    assert.deepEqual(observer.push(frame(completed()) + frame({ type })), { milestones: ['image_received'], terminal });
    assert.deepEqual(observer.push(frame(completed()) + 'data: [DONE]\n\n'), { milestones: [], terminal });
  }
});

test('completed envelope statuses cannot override failed or incomplete outcomes', () => {
  for (const [status, terminal] of [['failed', 'failed'], ['cancelled', 'failed'], ['in_progress', 'incomplete'], ['incomplete', 'incomplete']]) {
    assert.deepEqual(new ImageStreamObserver().push(frame(completed({ status }))), { milestones: [], terminal });
  }
  assert.deepEqual(new ImageStreamObserver().push(frame(completed({ error: { message: 'private' } }))), { milestones: [], terminal: 'failed' });
});

test('non-image output items and unfinished image items do not announce an image', () => {
  for (const invalid of [item({ status: 'generating' }), item({ result: '' }), item({ result: null }), item({ error: {} }), item({ type: 'message' })]) {
    assert.deepEqual(new ImageStreamObserver().push(frame({ type: 'response.output_item.done', item: invalid })), { milestones: [], terminal: null });
  }
});

test('[DONE] is a framing terminal only, needs a complete frame, and preserves failures', () => {
  const observer = new ImageStreamObserver();
  assert.deepEqual(observer.push('data: [DONE]\n'), { milestones: [], terminal: null });
  assert.deepEqual(observer.push('\n'), { milestones: [], terminal: 'done' });
  assert.deepEqual(observer.push(frame({ type: 'response.failed' })), { milestones: [], terminal: 'failed' });
  assert.deepEqual(observer.push('data: [DONE]\n\n'), { milestones: [], terminal: 'failed' });
});

test('many chunks of a large final item retain framing without retaining output in observations', () => {
  const observer = new ImageStreamObserver();
  const raw = frame({ type: 'response.output_item.done', item: item({ result: 'a'.repeat(3 * 1024 * 1024) }) });
  const stages = [];
  for (let offset = 0; offset < raw.length; offset += 1024) stages.push(...observer.push(raw.slice(offset, offset + 1024)).milestones);
  assert.deepEqual(stages, ['image_received']);
});
