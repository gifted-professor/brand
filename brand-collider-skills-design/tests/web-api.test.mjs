import test from 'node:test';
import assert from 'node:assert/strict';
import { api, isServiceUnavailable } from '../web/api.ts';

function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return handler(...args);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('GET retries a disconnected service and bare proxy response, then returns the recovered snapshot', async t => {
  const calls = stubFetch(t, () => {
    if (calls.length === 1) throw new TypeError('Failed to fetch');
    if (calls.length === 2) return new Response('Bad Gateway', { status: 502 });
    return json({ status: 'running' });
  });
  assert.deepEqual(await api('/sessions/current'), { status: 'running' });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([url, options]) => url === '/api/sessions/current' && options.method === 'GET' && options.body === undefined));
});

for (const status of [502, 503, 504]) {
  test(`GET stops after three attempts for a bare ${status} proxy failure`, async t => {
    const calls = stubFetch(t, () => new Response('<html>Local server unavailable</html>', { status }));
    await assert.rejects(api('/runtime'), error => isServiceUnavailable(error) && /本地服务暂时不可用/.test(error.message));
    assert.equal(calls.length, 3);
  });
}

for (const code of ['service_starting', 'service_stopping']) {
  test(`GET retries explicit ${code} responses despite their structured error`, async t => {
    const calls = stubFetch(t, () => calls.length === 1
      ? json({ code, error: '服务正在切换状态' }, 503) : json({ configured: true }));
    assert.deepEqual(await api('/runtime'), { configured: true });
    assert.equal(calls.length, 2);
  });
}

test('structured CLI task failures retain their message and never retry or masquerade as a service outage', async t => {
  const message = 'CLI 未返回有效 JSON 成果，该步骤未提交。';
  const calls = stubFetch(t, () => json({ error: message }, 502));
  await assert.rejects(api('/sessions/current'), error => !isServiceUnavailable(error) && error.message === message);
  assert.equal(calls.length, 1);
});

test('other HTTP task errors remain distinct from service interruptions', async t => {
  const calls = stubFetch(t, () => json({ message: '未找到此会话。' }, 404));
  await assert.rejects(api('/sessions/missing'), error => !isServiceUnavailable(error) && error.message === '未找到此会话。');
  assert.equal(calls.length, 1);
});

test('POST never repeats a request after losing its connection and reports an unconfirmed outcome', async t => {
  const calls = stubFetch(t, () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api('/sessions/current/run', {}), error => isServiceUnavailable(error) && /未能确认本次操作结果/.test(error.message));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].body, '{}');
});

test('POST never repeats bare proxy failures or explicit service lifecycle failures', async t => {
  const responses = [new Response('Bad Gateway', { status: 502 }), json({ code: 'service_stopping', error: '服务正在停止' }, 503)];
  const calls = stubFetch(t, () => responses.shift());
  await assert.rejects(api('/sessions/current/intervene', { text: '新标准' }), isServiceUnavailable);
  assert.equal(calls.length, 1);
  await assert.rejects(api('/sessions/current/run', {}), isServiceUnavailable);
  assert.equal(calls.length, 2);
});

test('a successful HTTP response with invalid JSON fails explicitly without returning null', async t => {
  const calls = stubFetch(t, () => new Response('<html>Unexpected response</html>', { status: 200 }));
  await assert.rejects(api('/sessions/current'), error => !isServiceUnavailable(error) && /内容格式无效/.test(error.message));
  assert.equal(calls.length, 1);
});

test('GET retries a connection lost while reading the response body', async t => {
  const calls = stubFetch(t, () => calls.length === 1
    ? { ok: true, status: 200, json: async () => { throw new TypeError('terminated'); } }
    : json({ status: 'paused' }));
  assert.deepEqual(await api('/sessions/current'), { status: 'paused' });
  assert.equal(calls.length, 2);
});

test('an already cancelled request keeps its abort reason and never fetches', async t => {
  const calls = stubFetch(t, () => json({}));
  const reason = new DOMException('Navigation changed', 'AbortError');
  await assert.rejects(api('/runtime', undefined, AbortSignal.abort(reason)), error => error === reason && !isServiceUnavailable(error));
  assert.equal(calls.length, 0);
});

test('cancellation during fetch preserves the original abort and prevents retries', async t => {
  const controller = new AbortController();
  const reason = new DOMException('Navigation changed', 'AbortError');
  const calls = stubFetch(t, (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    queueMicrotask(() => controller.abort(reason));
  }));
  await assert.rejects(api('/runtime', undefined, controller.signal), error => error === reason && !isServiceUnavailable(error));
  assert.equal(calls.length, 1);
});

test('cancellation during the retry delay stops pending work without another fetch', async t => {
  const controller = new AbortController();
  const reason = new DOMException('Navigation changed', 'AbortError');
  const calls = stubFetch(t, () => {
    setImmediate(() => controller.abort(reason));
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(api('/runtime', undefined, controller.signal), error => error === reason && !isServiceUnavailable(error));
  assert.equal(calls.length, 1);
});

test('an AbortError while reading JSON is preserved instead of becoming a format or connection error', async t => {
  const reason = new DOMException('Body cancelled', 'AbortError');
  const calls = stubFetch(t, () => ({ ok: true, status: 200, json: async () => { throw reason; } }));
  await assert.rejects(api('/runtime'), error => error === reason && !isServiceUnavailable(error));
  assert.equal(calls.length, 1);
});

test('invalid caller data does not become a connection failure or trigger network work', async t => {
  const calls = stubFetch(t, () => json({}));
  const body = {}; body.circular = body;
  await assert.rejects(api('/sessions', body), error => error instanceof TypeError && !isServiceUnavailable(error));
  assert.equal(calls.length, 0);
});
