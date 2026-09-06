import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { requestsPromoVideo, videoBrief, runVideo } from '../src/server/flova-video.ts';
import { sessionVideoArtifacts } from '../web/session-video.ts';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const success = data => ({ code: 0, data });
async function fixture(t, execute) {
  const directory = await mkdtemp(join(tmpdir(), 'flova-video-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, 'source.png'), bytes = Buffer.from('fixture-image'); await writeFile(path, bytes);
  const state = { revision: 1, status: 'preparing', model: 'Seedance 2.5', resolution: '480p', aspectRatio: '16:9', duration: 30,
    request: '基于这套物料生成宣传视频', brief: 'Fixture brief', sources: [{ id: 'cup', name: '纸杯', kind: 'material', hash: hash(bytes) }], assets: [], pendingActions: [], summary: '' };
  return { state, directory, sessionId: 'session-abc', signal: new AbortController().signal, files: {}, save: async () => {},
    execute, sourceFile: async () => ({ path, mimeType: 'image/png', contentHash: hash(bytes) }) };
}
test('explicit promo requests match while questions, negation, and quoted examples do not', () => {
  for (const text of ['现在我希望基于这一套物料来生成一只宣传视频', '用这套物料生成一支宣传视频', '请基于已验收的物料制作宣传视频']) assert.equal(requestsPromoVideo(text), true, text);
  for (const text of ['不要基于这套物料生成宣传视频', '能基于这套物料生成宣传视频吗', '比如“基于这套物料生成宣传视频”', '基于这套物料生成宣传视频，改成1080p']) assert.equal(requestsPromoVideo(text), false, text);
});
test('brief uses approved concept images and fixed requested model settings without inventing a bag', () => {
  const brief = videoBrief({ title: '奶龙 × 库迪', concepts: [] }, '基于这套物料生成宣传视频', [{ name: '杯套', kind: 'material' }]);
  assert.match(brief, /Seedance 2.5，480p，16:9横屏/); assert.match(brief, /不是实物照片/); assert.match(brief, /没有纸袋参考/);
});
test('aggregated run delivers previews once and exports only after successful terminal result', async t => {
  const calls = [];
  const ctx = await fixture(t, async (args, line) => {
    calls.push(args);
    if (args[0] === 'project' && args[1] === 'resources') return success({ resources: [{ status: 'success' }] });
    if (args[0] === 'project') return success({ project_id: 'p1', project_url: 'https://www.flova.ai/project/?id=p1' });
    if (args[0] === 'upload') return success({ file: { name: 'source.png' } });
    if (args[0] === 'run') {
      line('[11:20:24] stream_chat_id=s1');
      const event = `flova_event=${JSON.stringify({ type: 'resource_ready', local_path: join(ctx.directory, 'source.png'), asset_kind: 'image_preview' })}`;
      line('[11:20:24] ' + event); line(event);
      return success({ terminal: true, status: 'completed', pending_actions: [], assistant_messages: [] });
    }
    if (args[1] === 'readiness') return success({ can_export: true });
    line('task_id=e1'); return success({ terminal: true, status: 'success', export_url: 'https://cdn.example/final.mp4' });
  });
  const fetchOriginal = globalThis.fetch; t.after(() => globalThis.fetch = fetchOriginal);
  globalThis.fetch = async () => new Response(Buffer.from('0000ftypisomfixture-final-video'), { headers: { 'content-type': 'video/mp4' } });
  await runVideo(ctx);
  assert.equal(ctx.state.status, 'completed'); assert.equal(ctx.state.assets.length, 2);
  assert.equal(ctx.state.streamChatId, 's1'); assert.equal(ctx.state.exportTaskId, 'e1');
  assert.equal(calls.filter(args => args[0] === 'run').length, 1);
  assert.equal(calls.some(args => args.includes('--no-wait')), false);
  assert.equal(calls.find(args => args[0] === 'run').includes('--file-from'), true);
  assert.equal(sessionVideoArtifacts({ revision: 1, video: ctx.state }).assets.filter(asset => asset.kind === 'video').length, 1);
});
test('blocking options stop export and only exact chosen option resumes', async t => {
  const calls = [];
  const action = { blocking: true, action_id: 'a1', resume_message_id: 'm1', message: '确认生成', options: [{ id: 'yes', label: '生成', effect: 'resume' }, { id: 'no', effect: 'none' }] };
  const ctx = await fixture(t, async args => {
    calls.push(args);
    if (args[0] === 'project') return success({ project_id: 'p1' });
    if (args[0] === 'upload') return success({});
    if (args[1] === 'resume') return success({ terminal: true, status: 'completed', assistant_messages: [], pending_actions: [] });
    if (args[0] === 'export') return success({ can_export: false });
    return success({ status: 'waiting', terminal: false, pending_actions: [action] });
  });
  await runVideo(ctx); assert.equal(ctx.state.status, 'awaiting_input'); assert.equal(calls.some(args => args[0] === 'export'), false);
  await runVideo(ctx, { actionId: 'a1', optionId: 'no' }); assert.equal(calls.some(args => args[1] === 'resume'), false);
  ctx.state.assemblyRequested = true; ctx.state.productionRounds = 6;
  await runVideo(ctx, { actionId: 'a1', optionId: 'yes' });
  assert.deepEqual(calls.find(args => args[1] === 'resume'), ['run', 'resume', 'p1', '--message-id', 'm1', '--action-id', 'a1', '--option', 'yes']);
  assert.equal(ctx.state.status, 'ready');
});
test('interrupted run is recovered without creating a project or resending generation', async t => {
  const calls = [];
  const ctx = await fixture(t, async args => { calls.push(args); return { code: 'run_result_not_ready', data: { terminal: false } }; });
  Object.assign(ctx.state, { projectId: 'p1', runSubmitted: true, streamChatId: 's1', status: 'recoverable' });
  await runVideo(ctx); assert.equal(ctx.state.status, 'recoverable');
  assert.deepEqual(calls, [['run', 'result', 'p1', '--stream-chat-id', 's1']]);
});
test('unknown project creation does not create a duplicate; missing image evidence blocks upload', async t => {
  const calls = [], ctx = await fixture(t, async args => { calls.push(args); return success({}); });
  ctx.state.operation = 'create'; await runVideo(ctx); assert.equal(calls.length, 0);
  Object.assign(ctx.state, { operation: 'upload', projectId: 'p1' }); ctx.state.sources[0].hash = 'changed';
  await runVideo(ctx); assert.equal(calls.length, 0); assert.equal(ctx.state.runSubmitted, undefined);
});
test('failed final run cannot export even if previews were generated', async t => {
  const calls = [], ctx = await fixture(t, async args => {
    calls.push(args); return { code: 'generation_failed', data: { terminal: true, status: 'failed', assistant_messages: [] } };
  });
  Object.assign(ctx.state, { projectId: 'p1', runSubmitted: true, streamChatId: 's1' });
  await runVideo(ctx); assert.equal(ctx.state.assets.length, 0); assert.equal(calls.some(args => args[0] === 'export'), false);
});

test('confirmed missing recent run permits exactly one resend on the same project', async t => {
  const calls = [], ctx = await fixture(t, async args => {
    calls.push(args);
    if (args[1] === 'current') return { code: 'no_active_run', data: null };
    if (args[0] === 'upload') return success({ file: 'fixture' });
    return { code: 'network_error', message: 'connection closed' };
  });
  Object.assign(ctx.state, { projectId: 'p1', runSubmitted: true, status: 'recoverable' });
  await runVideo(ctx);
  assert.equal(ctx.state.missingRunResubmitted, true);
  assert.equal(calls.filter(args => args[0] === 'project').length, 0);
  assert.equal(calls.filter(args => args[0] === 'run' && args[1] === 'p1').length, 1);
  await runVideo(ctx);
  assert.equal(calls.filter(args => args[0] === 'run' && args[1] === 'p1').length, 1);
});

test('authorized follow-up sends one new direction in the existing project', async t => {
  const calls = [], ctx = await fixture(t, async args => {
    calls.push(args);
    return success({ terminal: true, status: 'completed', pending_actions: [{ action_id: 'choice', blocking: true, message: 'Choose generation budget', options: [] }] });
  });
  Object.assign(ctx.state, { projectId: 'p1', runSubmitted: true, streamChatId: 'old' });
  await runVideo(ctx, undefined, 'Complete the already authorized video production.');
  assert.deepEqual(calls, [['run', 'p1', '--content', 'Complete the already authorized video production.']]);
  assert.equal(ctx.state.status, 'awaiting_input');
});

test('a planning-only successful round advances production instead of exporting an empty timeline', async t => {
  const calls = []; let rounds = 0;
  const ctx = await fixture(t, async args => {
    calls.push(args);
    if (args[0] === 'project') return success({ project_id: 'p1' });
    if (args[0] === 'upload') return success({ file: 'fixture' });
    if (args[0] === 'export') return success({ can_export: false });
    if (++rounds === 1) return success({ terminal: true, status: 'completed', assistant_messages: [], pending_actions: [] });
    return success({ pending_actions: [{ blocking: true, action_id: 'cost', message: 'Confirm cost', options: [] }] });
  });
  await runVideo(ctx);
  assert.equal(rounds, 2); assert.equal(ctx.state.status, 'awaiting_input');
  assert.equal(calls.filter(args => args[0] === 'project').length, 1);
  assert.equal(calls.filter(args => args[0] === 'upload').length, 1);
  assert.equal(calls.some(args => args[0] === 'export' && args[1] === 'video'), false);
});
