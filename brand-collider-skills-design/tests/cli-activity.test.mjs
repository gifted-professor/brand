import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createCliActivity } from '../src/server/cli-activity.ts';

test('activity is readable during a stalled process and records timeout boundary without raw content', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-activity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logger = createCliActivity(dir, { runId: 'test', agentId: 'research-a' }, 20);
  try {
    logger.spawned(123); logger.stdout(21);
    logger.event({ type: 'available_commands', tools: ['web_search', 'SECRET_TOOL'] });
    logger.stderr('ECONNRESET SECRET_CREDENTIAL');
    let live;
    for (let i = 0; i < 100; i++) {
      await delay(10);
      try { live = JSON.parse(await readFile(join(dir, 'activity.json'), 'utf8')); } catch { continue; }
      if (live.stderrBytes > 0) break;
    }
    assert.equal(live.phase, 'waiting_model_or_cli');
    assert.equal(live.webCallsStarted, 0); assert.deepEqual(live.stderrSignals, ['network']);
    assert.deepEqual(live.availableTools, ['web_search']);
    assert.ok(live.stdoutIdleMs >= 0); assert.equal(live.reason, undefined);
    logger.stop('timeout');
  } finally { await logger.close(null, 'SIGTERM'); }
  const saved = await readFile(join(dir, 'activity.json'), 'utf8');
  assert.doesNotMatch(saved, /SECRET/);
  const result = JSON.parse(saved);
  assert.equal(result.reason, 'timeout'); assert.equal(result.signal, 'SIGTERM');
  assert.ok(result.timeline.some(item => item.event === 'timeout' && item.phase === 'waiting_model_or_cli'));
});

test('tool and result boundaries are counted once and the trace is bounded', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-activity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logger = createCliActivity(dir, { runId: 'test', agentId: 'research-b' });
  logger.event({ type: 'tool_call', toolName: 'web_search', toolCallId: 'secret-id', input: 'SECRET_QUERY' });
  for (let i = 0; i < 100; i++) logger.event({ type: 'tool_call_update', toolCallId: 'secret-id', status: 'completed', result: 'SECRET_RESULT' });
  logger.event({ type: 'thought', data: 'SECRET_THOUGHT' });
  logger.event({ type: 'end', structuredOutput: { secret: 'SECRET_OUTPUT' } });
  await logger.close(0, null);
  const raw = await readFile(join(dir, 'activity.json'), 'utf8'), saved = JSON.parse(raw);
  assert.doesNotMatch(raw, /SECRET|secret-id|thought/);
  assert.equal(saved.webCallsStarted, 1); assert.equal(saved.webCallsFinished, 1);
  assert.ok(saved.timeline.length <= 64); assert.equal(saved.reason, 'exit');
  assert.equal(saved.exitCode, 0); assert.equal(saved.lastEvent, 'end');
});
