import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startConfiguredServer } from '../src/server/index.ts';
import { readCpaConnectionAsync } from '../src/providers/cpa-connection.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'collider-server-lifecycle-'));
  const shutdowns = [];
  const runtime = { info: () => ({ configured: true, transport: 'codex-cli' }), shutdown: async reason => { shutdowns.push(reason); } };
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const start = async runtimeFactory => {
    const service = await startConfiguredServer({ cwd, port: 0, registerSignals: false, runtimeFactory });
    t.after(() => service.stop());
    const base = `http://127.0.0.1:${service.server.address().port}`;
    return { ...service, base };
  };
  const events = async () => (await readFile(join(cwd, 'outputs/runtime-events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return { cwd, runtime, shutdowns, start, events };
}

test('a conflicting server port never calls the runtime factory or restores session files', async t => {
  const f = await fixture(t);
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  let initializations = 0;
  await assert.rejects(startConfiguredServer({ cwd: f.cwd, port: occupied.address().port, registerSignals: false,
    runtimeFactory: async () => { initializations++; return f.runtime; },
  }), /端口是否已被占用/);
  assert.equal(initializations, 0);
  assert.deepEqual(f.shutdowns, []);
  const events = await f.events();
  assert.equal(events.length, 1); assert.equal(events[0].event, 'bind_failed'); assert.equal(events[0].code, 'EADDRINUSE');
});

test('startup requests return readable JSON 503 while initialization is pending, then normal APIs become ready', async t => {
  const f = await fixture(t), init = deferred();
  const service = await f.start(() => init.promise);
  const response = await fetch(`${service.base}/api/runtime`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '1');
  assert.deepEqual(await response.json(), { code: 'service_starting', error: '本地服务正在启动，协作进度稍后恢复。' });
  const nonlocal = await fetch(`${service.base}/api/runtime`, { headers: { Origin: 'https://outside.example' } });
  assert.equal(nonlocal.status, 403);
  init.resolve(f.runtime); await service.ready;
  assert.equal(service.state(), 'ready');
  const ready = await fetch(`${service.base}/api/runtime`);
  assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), f.runtime.info());
  await service.stop();
  assert.equal(service.state(), 'stopped'); assert.equal(service.server.listening, false);
  assert.equal(f.shutdowns.length, 1);
  assert.deepEqual((await f.events()).map(event => event.event), ['listening', 'ready', 'stopping', 'stopped']);
});

test('shutdown returns service_stopping while cleanup is pending and cleans the runtime only once', async t => {
  const f = await fixture(t), cleanup = deferred();
  f.runtime.shutdown = async reason => { f.shutdowns.push(reason); await cleanup.promise; };
  const service = await f.start(async () => f.runtime); await service.ready;
  const stopping = service.stop('SIGTERM');
  assert.equal(service.stop('SIGINT'), stopping);
  const response = await fetch(`${service.base}/api/sessions`);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'service_stopping');
  cleanup.resolve(); await stopping;
  assert.deepEqual(f.shutdowns, ['SIGTERM']);
  assert.equal(service.server.listening, false);
  const events = await f.events();
  assert.deepEqual(events.find(event => event.event === 'stopping').signal, 'SIGTERM');
});

test('stop during initialization aborts the factory signal and disposes a runtime that finishes late', async t => {
  const f = await fixture(t), init = deferred();
  let factorySignal;
  const service = await f.start((_cwd, signal) => { factorySignal = signal; return init.promise; });
  const stopping = service.stop('SIGINT');
  assert.equal(factorySignal.aborted, true);
  const response = await fetch(`${service.base}/api/runtime`);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'service_stopping');
  init.resolve(f.runtime);
  await assert.rejects(service.ready, /启动已中止/);
  await stopping;
  assert.deepEqual(f.shutdowns, ['SIGINT']);
  assert.equal(service.state(), 'stopped'); assert.equal(service.server.listening, false);
  assert.ok(!(await f.events()).some(event => event.event === 'ready'));
});

test('initialization failure closes the listening socket and logs only safe lifecycle data', async t => {
  const f = await fixture(t);
  const sensitiveError = Object.assign(new Error('SECRET_USER_TEXT SECRET_CREDENTIAL'), { code: 'SECRET_CODE' });
  const service = await f.start(async () => { throw sensitiveError; });
  await assert.rejects(service.ready, error => /初始化失败/.test(error.message) && !error.message.includes('SECRET'));
  assert.equal(service.server.listening, false);
  assert.deepEqual(f.shutdowns, []);
  const events = await f.events();
  assert.ok(events.some(event => event.event === 'initialization_failed' && event.code === 'INITIALIZATION_FAILED'));
  for (const event of events) {
    assert.ok(Object.keys(event).every(key => ['at', 'pid', 'event', 'signal', 'code'].includes(key)));
    assert.equal(event.pid, process.pid); assert.ok(!Number.isNaN(Date.parse(event.at)));
  }
  assert.ok(!JSON.stringify(events).includes('SECRET'));
});

async function fakeCredentialHelper(t, program) {
  const root = await mkdtemp(join(tmpdir(), 'collider-async-cpa-'));
  const directory = join(root, 'bin'); await mkdir(directory);
  await writeFile(join(directory, 'python3'), `#!${process.execPath}\n${program}\n`, { mode: 0o700 });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { PATH: directory };
}

test('async CPA lookup keeps the event loop available while the captured helper is running', async t => {
  const env = await fakeCredentialHelper(t, 'setTimeout(() => process.stdout.write(JSON.stringify({baseUrl:"http://127.0.0.1:9999/v1",apiKey:"fixture-key"})), 100);');
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 5);
  t.after(() => clearInterval(timer));
  assert.deepEqual(await readCpaConnectionAsync(env), { baseUrl: 'http://127.0.0.1:9999/v1', apiKey: 'fixture-key' });
  assert.ok(ticks > 0, 'credential lookup must not block lifecycle HTTP responses');
});

test('async CPA failures never expose helper output or errors, and cancellation preserves its reason', async t => {
  const failureEnv = await fakeCredentialHelper(t, 'process.stderr.write("SECRET_HELPER_STDERR"); process.stdout.write("SECRET_HELPER_STDOUT"); process.exitCode = 1;');
  await assert.rejects(readCpaConnectionAsync(failureEnv), error => /credential lookup failed/.test(error.message)
    && !JSON.stringify(error).includes('SECRET') && !error.message.includes('SECRET') && error.cause === undefined);
  const slowEnv = await fakeCredentialHelper(t, 'setInterval(() => {}, 1000);');
  const controller = new AbortController();
  const reason = new DOMException('Service stopping', 'AbortError');
  const lookup = readCpaConnectionAsync(slowEnv, controller.signal);
  setImmediate(() => controller.abort(reason));
  await assert.rejects(lookup, error => error === reason);
});
