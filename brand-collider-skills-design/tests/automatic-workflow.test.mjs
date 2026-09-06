import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ColliderRuntime } from '../src/server/runtime.ts';
import { RuntimeError } from '../src/server/text-provider.ts';
import { materialPlanFixture, materialVisualFixtures } from './material-fixture.mjs';

const cwd = resolve(import.meta.dirname, '..');
const stages = ['profile-a', 'profile-b', 'ideation-a', 'ideation-b', 'design-a', 'design-b', 'copy-a', 'visual-b', 'review-a'];
const namesOnly = () => ({ mode: 'live', brands: [{ name: '织物品牌' }, { name: '声音品牌' }], goal: '' });
const stageOf = messages => /当前步骤：([^；]+)/.exec(messages[0].content)?.[1];
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const result = stage => ({ message: `${stage} 已依据公开资料及明确的概念假设完成`, section: `${stage} 的完整概念方案。本轮结合织物品牌的日常使用场景与声音品牌的内容体验，提出通过触摸材质与扫码听音建立共同参与路径。织物承担可重复使用的实体载体，声音承担场景内容；具体素材、合作权益、履约渠道与时间安排尚未核实，后续设计和传播沿用这些边界，不将建议写成承诺。未核验的资源按建议处理，授权与生产条件待确认。`,
  pendingConfirmations: ['授权与生产条件待确认'], card: null, blockedReason: null,
  ...(stage === 'ideation-b' ? { concepts: [1, 2, 3].map(i => ({ title: `推荐方向${i}`, tagline: `合作主题${i}`, description: `独立合作机制${i}`,
    contributionA: `织物贡献${i}`, contributionB: `声音贡献${i}`, consumerValue: `日常体验价值${i}` })) } : {}),
  ...(stage === 'design-b' ? { materialPlan: { ...materialPlanFixture(), deliveryScope: 'full_collaboration' } } : {}),
  ...(stage === 'visual-b' ? { imagePrompt: '日常织物与自然声音的概念主视觉。', materialVisuals: materialVisualFixtures() } : {}),
  ...(stage === 'review-a' ? { verdict: 'unverified' } : {}),
});

async function fixture(t, behavior) {
  const outputDir = await mkdtemp(join(tmpdir(), 'collider-auto-'));
  const calls = [];
  const provider = { transport: 'grok-cli', model: 'test-local-cli', async complete(messages, task) {
    const stage = stageOf(messages);
    assert.notEqual(task.agentId, 'orchestrator', 'programmatic stage handoffs must not invoke a model');
    const call = { stage, agentId: task.agentId, revision: task.revision, messages: structuredClone(messages), signal: task.signal, recovery: task.recovery };
    calls.push(call);
    const normal = result(stage);
    const execution = { transport: 'grok-cli', agentId: task.agentId, revision: task.revision, runId: randomUUID(), state: 'running', startedAt: new Date().toISOString() };
    await task.onExecution?.(execution);
    const value = behavior ? await behavior(call, normal, calls) : normal;
    await task.onExecution?.({ ...execution, state: 'completed', finishedAt: new Date().toISOString() });
    return value;
  } };
  const runtime = new ColliderRuntime({ cwd, outputDir, provider, demoDelayMs: 0 });
  await runtime.init();
  t.after(async () => { await runtime.shutdown(); await rm(outputDir, { recursive: true, force: true }); });
  const saved = async id => JSON.parse(await readFile(join(outputDir, `${id}.json`), 'utf8'));
  return { runtime, calls, outputDir, provider, saved };
}
async function run(runtime, input = namesOnly()) {
  const session = await runtime.create(input);
  await runtime.run(session.id); await runtime.waitForIdle(session.id);
  return runtime.get(session.id);
}
async function waitUntil(check) {
  const deadline = Date.now() + 3000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'expected runtime progress did not arrive');
    await delay(10);
  }
}

test('brand names alone default to all nine stages with an attributed recommendation and no image claim', async t => {
  const f = await fixture(t);
  const done = await run(f.runtime);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.autoAdvance, true);
  assert.ok(done.goal.trim());
  assert.deepEqual(done.brands.map(brand => ({ description: brand.description, files: brand.files })), [{ description: '', files: [] }, { description: '', files: [] }]);
  assert.equal(done.selectedConceptId, 'concept-1');
  assert.equal(done.selectionSource, 'orchestrator');
  assert.equal(done.completedSkills.length, 6);
  assert.deepEqual(f.calls.filter(call => call.agentId !== 'orchestrator').map(call => call.stage), stages);
  assert.equal(f.calls.length, 9);
  assert.equal(f.calls.some(call => call.agentId === 'orchestrator'), false);
  assert.ok(done.messages.some(message => message.kind === 'notice' && message.agentRole === 'orchestrator'), 'the visible workflow still includes host handoff notices');
  assert.ok(f.calls.every(call => call.recovery === undefined), 'normal activations must not enter delivery recovery');
  const persisted = await f.saved(done.id);
  assert.equal(persisted.records.length, 9);
  assert.equal(persisted.modelCallsUsed, 9);
  assert.equal(done.proposal.imageUrl, undefined);
  assert.equal(done.proposal.reviewStatus, 'unverified');
  assert.ok(done.proposal.pendingConfirmations.includes('授权与生产条件待确认'));
  await f.runtime.select(done.id, { conceptId: 'concept-2' }); await f.runtime.waitForIdle(done.id);
  const selected = f.runtime.get(done.id);
  assert.equal(selected.status, 'completed', selected.error);
  assert.equal(selected.selectedConceptId, 'concept-2');
  assert.equal(selected.selectionSource, 'user');
});

test('both research calls start together from the same phase snapshot and ideation waits for both results', { timeout: 10000 }, async t => {
  const releases = { 'profile-a': deferred(), 'profile-b': deferred() }, bothStarted = deferred();
  t.after(() => { releases['profile-a'].resolve(); releases['profile-b'].resolve(); });
  let profilesStarted = 0;
  const f = await fixture(t, async (call, normal) => {
    if (!releases[call.stage]) return normal;
    profilesStarted += 1;
    if (profilesStarted === 2) bothStarted.resolve();
    await releases[call.stage].promise;
    return normal;
  });
  const session = await f.runtime.create(namesOnly());
  await f.runtime.run(session.id); await bothStarted.promise;
  assert.deepEqual(f.calls.map(call => call.stage), ['profile-a', 'profile-b']);
  const inputs = f.calls.map(call => JSON.parse(call.messages[1].content));
  for (const input of inputs) {
    assert.deepEqual(input.currentArtifacts, []);
    assert.deepEqual(input.handoff.inputStages, []);
    assert.equal(input.publicDialogue, undefined);
    assert.equal(input.lastPartnerMessage, undefined);
  }
  for (const key of ['revision', 'brands', 'goal', 'constraints', 'automation']) assert.deepEqual(inputs[0][key], inputs[1][key]);
  releases['profile-b'].resolve();
  await waitUntil(async () => (await f.saved(session.id)).records.some(record => record.key === 'profile-b'));
  assert.deepEqual(f.calls.map(call => call.stage), ['profile-a', 'profile-b'], 'one completed profile must not release the creative phase');
  releases['profile-a'].resolve(); await f.runtime.waitForIdle(session.id);
  const done = f.runtime.get(session.id);
  assert.equal(done.status, 'completed', done.error);
  const creative = JSON.parse(f.calls.find(call => call.stage === 'ideation-a').messages[1].content);
  assert.deepEqual(creative.currentArtifacts.map(artifact => artifact.stage).sort(), ['profile-a', 'profile-b']);
  assert.ok(creative.currentArtifacts.every(artifact => artifact.section === result(artifact.stage).section));
  assert.equal(f.calls.length, 9);
});

test('a failed profile waits for and preserves its successful sibling, then retries only the missing profile', { timeout: 10000 }, async t => {
  const releaseB = deferred(), failedRepair = deferred();
  t.after(() => releaseB.resolve());
  let allowA = false;
  const f = await fixture(t, async (call, normal) => {
    if (call.stage === 'profile-b') await releaseB.promise;
    if (call.stage === 'profile-a' && !allowA) {
      if (call.recovery) failedRepair.resolve();
      return { ...normal, section: '' };
    }
    return normal;
  });
  const session = await f.runtime.create(namesOnly());
  await f.runtime.run(session.id); await failedRepair.promise;
  assert.equal(f.calls.some(call => call.stage === 'ideation-a'), false);
  releaseB.resolve(); await f.runtime.waitForIdle(session.id);
  assert.equal(f.runtime.get(session.id).status, 'error');
  assert.deepEqual((await f.saved(session.id)).records.map(record => record.key), ['profile-b']);
  allowA = true;
  const before = f.calls.length;
  await f.runtime.run(session.id); await f.runtime.waitForIdle(session.id);
  const done = f.runtime.get(session.id);
  assert.equal(done.status, 'completed', done.error);
  assert.deepEqual(f.calls.slice(before).map(call => call.stage), stages.filter(stage => stage !== 'profile-b'));
  assert.equal(f.calls.filter(call => call.stage === 'profile-b').length, 1);
});

for (const action of ['pause', 'revision']) test(`${action} cancels both in-flight profiles and prevents either old result from committing`, { timeout: 10000 }, async t => {
  const release = deferred(), bothStarted = deferred();
  t.after(() => release.resolve());
  let oldProfiles = 0;
  const f = await fixture(t, async (call, normal) => {
    if (call.revision !== 1 || !call.stage.startsWith('profile-')) return normal;
    oldProfiles += 1;
    if (oldProfiles === 2) bothStarted.resolve();
    await release.promise;
    return { ...normal, section: `${normal.section} MUST_NOT_COMMIT_OLD_PARALLEL_PROFILE` };
  });
  const session = await f.runtime.create(namesOnly());
  await f.runtime.run(session.id); await bothStarted.promise;
  const oldCalls = f.calls.slice();
  if (action === 'pause') await f.runtime.pause(session.id);
  else await f.runtime.intervene(session.id, { restartFrom: 1, text: '全部成果以最新数字体验为核心' });
  assert.ok(oldCalls.every(call => call.signal.aborted), 'both active research executions are cancelled');
  release.resolve(); await f.runtime.waitForIdle(session.id);
  const saved = await f.saved(session.id), done = f.runtime.get(session.id);
  assert.doesNotMatch(JSON.stringify(done), /MUST_NOT_COMMIT_OLD_PARALLEL_PROFILE/);
  if (action === 'pause') {
    assert.equal(done.status, 'paused');
    assert.deepEqual(saved.records, []);
    assert.equal(f.calls.length, 2);
  } else {
    assert.equal(done.status, 'completed', done.error);
    assert.equal(done.revision, 2);
    assert.equal(f.calls.length, 11);
    assert.ok(f.calls.slice(2).every(call => call.revision === 2 && call.messages[1].content.includes('全部成果以最新数字体验为核心')));
    assert.ok(saved.records.every(record => record.revision === 2));
  }
});

test('legacy sessions without autoAdvance continue from saved concepts without repeating research', async t => {
  const f = await fixture(t);
  const old = await run(f.runtime, { ...namesOnly(), autoAdvance: false });
  assert.equal(old.status, 'awaiting_selection');
  await f.runtime.shutdown();
  const persisted = await f.saved(old.id);
  delete persisted.session.autoAdvance;
  delete persisted.modelCallsUsed;
  await writeFile(join(f.outputDir, `${old.id}.json`), JSON.stringify(persisted));
  const restored = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => restored.shutdown()); await restored.init();
  const before = f.calls.length;
  await restored.run(old.id); await restored.waitForIdle(old.id);
  const done = restored.get(old.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.selectionSource, 'orchestrator');
  assert.deepEqual(f.calls.slice(before).filter(call => call.agentId !== 'orchestrator').map(call => call.stage), stages.slice(4));
  assert.equal((await f.saved(old.id)).modelCallsUsed, 9);
});

test('refreshResearch replaces old method pins, archives their revision and reruns research without erasing dialogue', async t => {
  const f = await fixture(t);
  const original = await run(f.runtime);
  assert.equal(original.status, 'completed', original.error);
  await f.runtime.shutdown();
  const persisted = await f.saved(original.id);
  // Simulate a historical method entirely in this test's temporary session.
  persisted.pins = persisted.pins.map(pin => {
    const content = `${pin.content}\nOLD_METHOD_FOR_REFRESH_REGRESSION`;
    return { ...pin, content, digest: createHash('sha256').update(content).digest('hex') };
  });
  for (const record of persisted.records) {
    const stageIndex = stages.indexOf(record.key);
    const originalCall = original.messages.filter(message => message.kind === 'skill')[stageIndex];
    record.skillDigest = persisted.pins.find(pin => pin.id === originalCall.skill).digest;
  }
  const oldPins = structuredClone(persisted.pins), oldMessages = structuredClone(persisted.session.messages);
  await writeFile(join(f.outputDir, `${original.id}.json`), JSON.stringify(persisted));
  const restored = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => restored.shutdown()); await restored.init();
  const currentPins = restored.info().skills;
  assert.notDeepEqual(oldPins, currentPins);
  assert.deepEqual((await f.saved(original.id)).pins, oldPins, 'loading an old session alone must preserve its method');
  const updated = await restored.intervene(original.id, { restartFrom: 3, text: '重新核验双方公开资料并完成完整方案', refreshResearch: true });
  assert.equal(updated.revision, 2);
  assert.equal(updated.status, 'paused');
  assert.deepEqual(updated.completedSkills, []);
  assert.deepEqual(updated.concepts, []);
  assert.equal(updated.selectedConceptId, undefined);
  assert.equal(updated.selectionSource, undefined);
  assert.equal(updated.proposal, undefined);
  assert.deepEqual(updated.messages.slice(0, oldMessages.length), oldMessages);
  const refreshed = await f.saved(original.id);
  assert.deepEqual(refreshed.records, []);
  assert.deepEqual(refreshed.pins, currentPins);
  assert.deepEqual(refreshed.pinHistory, [{ revision: 1, pins: oldPins }]);
  assert.equal(refreshed.modelCallsUsed, 9, 'refresh must retain the real call budget');
  const before = f.calls.length;
  await restored.run(original.id); await restored.waitForIdle(original.id);
  const done = restored.get(original.id);
  assert.equal(done.status, 'completed', done.error);
  const repeated = f.calls.slice(before);
  assert.equal(repeated.length, 9);
  assert.ok(repeated.every(call => call.revision === 2));
  assert.deepEqual(repeated.filter(call => call.agentId !== 'orchestrator').map(call => call.stage), stages);
  assert.ok(repeated.every(call => !JSON.stringify(call.messages).includes('OLD_METHOD_FOR_REFRESH_REGRESSION')));
  const finalSaved = await f.saved(original.id);
  assert.equal(finalSaved.records.length, 9);
  assert.ok(finalSaved.records.every(record => record.revision === 2));
  assert.deepEqual(finalSaved.pinHistory, [{ revision: 1, pins: oldPins }]);
  assert.deepEqual(done.messages.slice(0, oldMessages.length), oldMessages);
});

test('an empty research section gets one local repair without replaying the completed sibling', async t => {
  const f = await fixture(t, (call, normal, calls) => {
    if (call.agentId === 'research-b' && calls.filter(item => item.agentId === 'research-b').length === 1) return { ...normal, message: '准备读取资料', section: '' };
    return normal;
  });
  const done = await run(f.runtime);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(f.calls.filter(call => call.agentId === 'research-a').length, 1);
  assert.equal(f.calls.filter(call => call.agentId === 'research-b').length, 2);
  assert.equal(f.calls.filter(call => call.agentId === 'orchestrator').length, 0);
  assert.equal(f.calls.length, 10);
  const persisted = await f.saved(done.id);
  assert.deepEqual(persisted.records.map(record => record.key).sort(), [...stages].sort());
  assert.equal(persisted.modelCallsUsed, 10);
  assert.equal(persisted.turnsUsed, 9);
  assert.equal(persisted.records.filter(record => record.key === 'profile-b').length, 1);
  assert.ok(persisted.records.every(record => record.result.section.trim()));
  const researchAttempts = f.calls.filter(call => call.agentId === 'research-b');
  assert.equal(researchAttempts[0].recovery, undefined);
  assert.equal(researchAttempts[1].recovery, 'deliver-current-evidence');
  assert.ok(f.calls.filter(call => call !== researchAttempts[1]).every(call => call.recovery === undefined));
});

test('CLI structured-result failure is repaired once and stays within the current professional step', async t => {
  const f = await fixture(t, (call, normal, calls) => {
    if (call.agentId === 'research-b' && calls.filter(item => item.agentId === 'research-b').length === 1) throw new RuntimeError('CLI 未交付有效结构化结果', 502);
    return normal;
  });
  const done = await run(f.runtime);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(f.calls.length, 10);
  assert.equal(f.calls.filter(call => call.agentId === 'orchestrator').length, 0);
  assert.equal((await f.saved(done.id)).modelCallsUsed, 10);
});

test('repeated invalid output stops after one repair and never presents a partial stage as completed', async t => {
  const f = await fixture(t, (call, normal) => call.agentId === 'research-b' ? { ...normal, section: '' } : normal);
  const failed = await run(f.runtime);
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /自动修复后/);
  assert.doesNotMatch(failed.error, /补充资料|需要补充信息/);
  assert.equal(f.calls.filter(call => call.agentId === 'research-b').length, 2);
  assert.equal(f.calls.filter(call => call.agentId === 'orchestrator').length, 0);
  assert.equal(f.calls.length, 3);
  const persisted = await f.saved(failed.id);
  assert.deepEqual(persisted.records.map(record => record.key), ['profile-a']);
  assert.equal(persisted.modelCallsUsed, 3);
  assert.deepEqual(f.calls.filter(call => call.agentId === 'research-b').map(call => call.recovery), [undefined, 'deliver-current-evidence']);
});

test('refreshResearch retracts old long progress placeholders and their paired execution messages but preserves real history', async t => {
  const f = await fixture(t);
  const original = await run(f.runtime, { ...namesOnly(), autoAdvance: false });
  assert.equal(original.status, 'awaiting_selection');
  await f.runtime.shutdown();
  const persisted = await f.saved(original.id);
  const placeholder = 'Starting public-source research on Manner Coffee: official positioning, products, channels, visual cues, and any collaboration history, keeping user claims separate from verified facts.';
  const publicResult = persisted.session.messages.find(message => message.kind === 'message' && message.agentRole === 'research' && message.artifact);
  publicResult.artifact.section = placeholder;
  publicResult.content = 'REVOKED_A_PLACEHOLDER: I will research the brand and deliver a result later.';
  const incompleteRunId = publicResult.execution.runId;
  persisted.records.find(record => record.key === 'profile-a').result.section = placeholder;
  const pairedIds = persisted.session.messages.filter(message => message.execution?.runId === incompleteRunId).map(message => message.id);
  assert.equal(pairedIds.length, 2, 'a CLI execution and its public artifact share the run identity');
  const oldError = { id: randomUUID(), kind: 'message', role: 'b', agentRole: 'research', status: 'error',
    content: 'REVOKED_B_PLACEHOLDER: I will look up sources later.', revision: 1, createdAt: new Date().toISOString() };
  persisted.session.messages.push(oldError);
  const unaffectedHistory = persisted.session.messages.filter(message => !pairedIds.includes(message.id));
  const oldBudget = persisted.modelCallsUsed;
  await writeFile(join(f.outputDir, `${original.id}.json`), JSON.stringify(persisted));
  const restored = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => restored.shutdown()); await restored.init();
  const updated = await restored.intervene(original.id, { text: '重新研究，并按明确假设继续完成完整联名方案', refreshResearch: true });
  const retracted = updated.messages.filter(message => pairedIds.includes(message.id));
  assert.equal(retracted.length, 2);
  for (const message of retracted) {
    assert.equal(message.status, 'error');
    assert.equal(message.artifact, undefined);
    assert.match(message.detail, /已撤销该产物/);
    assert.equal(message.execution.runId, incompleteRunId, 'keep the raw execution identity for diagnosis');
  }
  for (const message of unaffectedHistory) assert.deepEqual(updated.messages.find(current => current.id === message.id), message);
  const refreshed = await f.saved(original.id);
  assert.equal(refreshed.modelCallsUsed, oldBudget);
  assert.deepEqual(refreshed.records, []);
  assert.equal(updated.proposal, undefined);
  assert.deepEqual(updated.completedSkills, []);
  const before = f.calls.length;
  await restored.run(original.id); await restored.waitForIdle(original.id);
  const resumed = f.calls.slice(before);
  assert.equal(restored.get(original.id).status, 'awaiting_selection');
  for (const call of resumed) {
    const data = JSON.parse(call.messages[1].content);
    assert.equal(data.lastPartnerMessage, undefined);
    assert.equal(data.publicDialogue, undefined);
    assert.doesNotMatch(JSON.stringify(data), /REVOKED_[AB]_PLACEHOLDER/);
    assert.doesNotMatch(JSON.stringify(data.currentArtifacts), /Starting public-source research/);
  }
  const firstData = JSON.parse(resumed[0].messages[1].content);
  assert.deepEqual(firstData.currentArtifacts, [], 'fresh parallel research cannot inherit previous research or public discussion');
});

for (const [agentId, field, value] of [
  ['research-b', 'message', '本'],
  ['research-b', 'section', '轮'],
  ['research-b', 'section', `${' '.repeat(100)}轮${' '.repeat(100)}`],
]) test(`CLI ${agentId} ${field} with ${value.length === 1 ? 'one character' : 'whitespace padding'} never counts as completed work`, async t => {
  const f = await fixture(t, (call, normal) => call.agentId === agentId ? { ...normal, [field]: value } : normal);
  const failed = await run(f.runtime);
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /自动修复后/);
  assert.equal(f.calls.filter(call => call.agentId === agentId).length, 2, 'the invalid result receives exactly one repair attempt');
  const persisted = await f.saved(failed.id);
  assert.deepEqual(persisted.records.map(record => record.key), ['profile-a']);
  assert.equal(failed.messages.some(message => message.kind === 'message' && message.role === 'b' && message.artifact), false);
});

test('a missing-resource note accompanies valid work as a pending assumption and does not stop the chain', async t => {
  const note = '预算、授权和产品参数尚未提供，按概念假设推进';
  const f = await fixture(t, (call, normal) => call.agentId === 'research-b' ? { ...normal, blockedReason: note } : normal);
  const done = await run(f.runtime);
  assert.equal(done.status, 'completed', done.error);
  const persisted = await f.saved(done.id);
  assert.ok(persisted.records.find(record => record.key === 'profile-b').result.pendingConfirmations.includes(note));
  assert.ok(done.proposal.pendingConfirmations.includes(note));
  assert.equal(f.calls.length, 9);
});

test('a blocked-only placeholder must be repaired into real work before it can be committed', async t => {
  const f = await fixture(t, (call, normal, calls) => {
    if (call.agentId === 'research-b' && calls.filter(item => item.agentId === 'research-b').length === 1) {
      return { message: '', section: '', pendingConfirmations: [], blockedReason: '未提供授权文件和预算' };
    }
    return normal;
  });
  const done = await run(f.runtime);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(f.calls.filter(call => call.agentId === 'research-b').length, 2);
  const persisted = await f.saved(done.id);
  assert.equal(persisted.records.length, 9);
  assert.equal(persisted.records.find(record => record.key === 'profile-b').result.section, result('profile-b').section);
});

test('pause during automatic repair discards the in-flight result and prevents downstream calls', { timeout: 10000 }, async t => {
  const pending = deferred(), entered = deferred();
  t.after(() => pending.resolve(result('profile-b')));
  const f = await fixture(t, (call, normal, calls) => {
    if (call.agentId !== 'research-b') return normal;
    if (calls.filter(item => item.agentId === 'research-b').length === 1) return { ...normal, section: '' };
    entered.resolve(); return pending.promise;
  });
  const session = await f.runtime.create(namesOnly());
  await f.runtime.run(session.id); await entered.promise;
  await f.runtime.pause(session.id);
  pending.resolve({ ...result('profile-b'), section: 'MUST_NOT_COMMIT_AFTER_PAUSE' });
  await f.runtime.waitForIdle(session.id);
  const paused = f.runtime.get(session.id);
  assert.equal(paused.status, 'paused');
  assert.equal(f.calls.at(-1).signal.aborted, true);
  assert.equal(f.calls.length, 3);
  const persisted = await f.saved(session.id);
  assert.deepEqual(persisted.records.map(record => record.key), ['profile-a']);
  assert.doesNotMatch(JSON.stringify(paused), /MUST_NOT_COMMIT_AFTER_PAUSE/);
});

test('a newer brief during repair discards old output and all subsequent calls use the new revision', { timeout: 10000 }, async t => {
  const pending = deferred(), entered = deferred();
  t.after(() => pending.resolve(result('profile-b')));
  const f = await fixture(t, (call, normal, calls) => {
    if (call.agentId !== 'research-b' || call.revision !== 1) return normal;
    if (calls.filter(item => item.agentId === 'research-b' && item.revision === 1).length === 1) return { ...normal, section: '' };
    entered.resolve(); return pending.promise;
  });
  const session = await f.runtime.create(namesOnly());
  await f.runtime.run(session.id); await entered.promise;
  await f.runtime.intervene(session.id, { restartFrom: 1, text: '全部成果以数字体验作为核心' });
  const countBeforeRelease = f.calls.length;
  pending.resolve({ ...result('profile-b'), section: 'MUST_NOT_COMMIT_OLD_REVISION' });
  await f.runtime.waitForIdle(session.id);
  const done = f.runtime.get(session.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.revision, 2);
  assert.ok(f.calls.slice(countBeforeRelease).length > 0);
  assert.ok(f.calls.slice(countBeforeRelease).every(call => call.revision === 2));
  assert.doesNotMatch(JSON.stringify(done), /MUST_NOT_COMMIT_OLD_REVISION/);
  assert.ok(f.calls.slice(countBeforeRelease).every(call => call.messages[1].content.includes('全部成果以数字体验作为核心')));
});

test('the persisted 48-call ceiling prevents repairs from creating an unbounded discussion', async t => {
  const f = await fixture(t, (call, normal) => call.agentId === 'research-a' ? { ...normal, section: '' } : normal);
  const session = await f.runtime.create(namesOnly());
  await f.runtime.shutdown();
  const persisted = await f.saved(session.id);
  persisted.modelCallsUsed = 47;
  await writeFile(join(f.outputDir, `${session.id}.json`), JSON.stringify(persisted));
  const restored = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => restored.shutdown()); await restored.init();
  await restored.run(session.id); await restored.waitForIdle(session.id);
  assert.equal(f.calls.length, 1, 'only the final permitted main activation may run');
  const capped = await f.saved(session.id);
  assert.equal(capped.modelCallsUsed, 48);
  assert.equal(capped.records.length, 0);
  assert.equal(restored.get(session.id).status, 'error');
  assert.match(restored.get(session.id).error, /48/);
  await assert.rejects(restored.run(session.id), /48/);
  assert.equal(f.calls.length, 1);
});

async function restoreBudgetFixture(t, f, id, mutate) {
  await f.runtime.shutdown();
  const saved = await f.saved(id); mutate(saved);
  await writeFile(join(f.outputDir, `${id}.json`), JSON.stringify(saved));
  const restored = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => restored.shutdown()); await restored.init();
  return restored;
}

test('a user changing an existing direction gets one new bounded round while lifetime counters and retained stages persist', async t => {
  const f = await fixture(t), original = await run(f.runtime);
  const restored = await restoreBudgetFixture(t, f, original.id, saved => { saved.modelCallsUsed = 47; saved.turnsUsed = 23; });
  const before = f.calls.length;
  await restored.select(original.id, { conceptId: 'concept-2' }); await restored.waitForIdle(original.id);
  const done = restored.get(original.id), saved = await f.saved(original.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.revision, 2);
  assert.equal(done.selectedConceptId, 'concept-2');
  assert.equal(saved.roundCallsStart, 47); assert.equal(saved.roundTurnsStart, 23);
  assert.equal(saved.modelCallsUsed, 52); assert.equal(saved.turnsUsed, 28);
  assert.deepEqual(f.calls.slice(before).filter(call => call.agentId !== 'orchestrator').map(call => call.stage), stages.slice(4));
  assert.deepEqual(saved.records.slice(0, 4).map(record => record.revision), [1, 1, 1, 1]);
  assert.deepEqual(saved.records.slice(4).map(record => record.revision), [2, 2, 2, 2, 2]);
  await restored.select(original.id, { conceptId: 'concept-2' }); await restored.run(original.id);
  assert.equal(f.calls.length, before + 5, 'reselecting or running completed work must not create another round');
  assert.equal((await f.saved(original.id)).roundCallsStart, 47);
  await restored.shutdown();
  const reloaded = new ColliderRuntime({ cwd, outputDir: f.outputDir, provider: f.provider });
  t.after(() => reloaded.shutdown()); await reloaded.init();
  assert.equal(reloaded.get(original.id).status, 'completed', 'lifetime stage totals above 24 remain loadable');
  assert.equal((await f.saved(original.id)).modelCallsUsed, 52);
  assert.equal((await f.saved(original.id)).roundTurnsStart, 23);
});

test('an ordinary user requirement change starts a new bounded round after exhausted lifetime totals', async t => {
  const f = await fixture(t), original = await run(f.runtime);
  const restored = await restoreBudgetFixture(t, f, original.id, saved => { saved.modelCallsUsed = 48; saved.turnsUsed = 24; });
  const before = f.calls.length;
  await restored.intervene(original.id, { restartFrom: 3, text: '全部成果按数字体验目标重新比较方向' });
  const changed = await f.saved(original.id);
  assert.equal(changed.roundCallsStart, 48); assert.equal(changed.roundTurnsStart, 24);
  assert.equal(changed.modelCallsUsed, 48); assert.equal(changed.turnsUsed, 24);
  await restored.run(original.id); await restored.waitForIdle(original.id);
  const done = restored.get(original.id), saved = await f.saved(original.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(saved.modelCallsUsed, 55); assert.equal(saved.turnsUsed, 31);
  assert.equal(saved.roundCallsStart, 48); assert.equal(saved.roundTurnsStart, 24);
  assert.deepEqual(f.calls.slice(before).filter(call => call.agentId !== 'orchestrator').map(call => call.stage), stages.slice(2));
});

for (const [label, modelCallsUsed, turnsUsed, roundCallsStart, roundTurnsStart] of [
  ['calls', 98, 40, 50, 20], ['stages', 80, 44, 50, 20],
]) test(`same selection, run, pause and maintenance keep the current ${label} round capped`, async t => {
  const f = await fixture(t), original = await run(f.runtime);
  const restored = await restoreBudgetFixture(t, f, original.id, saved => {
    Object.assign(saved, { modelCallsUsed, turnsUsed, roundCallsStart, roundTurnsStart });
    saved.session.status = 'paused'; saved.records = saved.records.slice(0, 4); saved.session.proposal = undefined;
  });
  const before = f.calls.length, limit = label === 'calls' ? /48 次/ : /24 次/;
  await assert.rejects(restored.run(original.id), limit);
  await assert.rejects(restored.select(original.id, { conceptId: original.selectedConceptId }), limit);
  await restored.pause(original.id);
  await assert.rejects(restored.run(original.id), limit);
  await restored.intervene(original.id, { restartFrom: 3, text: '维护性重新研究当前方案', refreshResearch: true });
  await assert.rejects(restored.run(original.id), limit);
  const saved = await f.saved(original.id);
  assert.equal(saved.modelCallsUsed, modelCallsUsed); assert.equal(saved.turnsUsed, turnsUsed);
  assert.equal(saved.roundCallsStart, roundCallsStart); assert.equal(saved.roundTurnsStart, roundTurnsStart);
  assert.equal(f.calls.length, before);
});

test('the first manual direction choice belongs to the existing round and cannot renew an exhausted allowance', async t => {
  const f = await fixture(t), original = await run(f.runtime, { ...namesOnly(), autoAdvance: false });
  const restored = await restoreBudgetFixture(t, f, original.id, saved => { saved.modelCallsUsed = 48; });
  const before = f.calls.length;
  await assert.rejects(restored.select(original.id, { conceptId: 'concept-1' }), /48 次/);
  const saved = await f.saved(original.id);
  assert.equal(saved.session.revision, 1);
  assert.equal(saved.roundCallsStart, undefined); assert.equal(saved.roundTurnsStart, undefined);
  assert.equal(saved.modelCallsUsed, 48); assert.equal(saved.turnsUsed, 4);
  assert.equal(f.calls.length, before);
});

test('pausing the final allowed activation cannot renew an in-progress round', async t => {
  const pending = deferred(), entered = deferred();
  t.after(() => pending.resolve(result('profile-a')));
  const f = await fixture(t, (call, normal) => {
    if (call.agentId === 'research-a') { entered.resolve(); return pending.promise; }
    return normal;
  });
  const original = await f.runtime.create(namesOnly());
  const restored = await restoreBudgetFixture(t, f, original.id, saved => {
    Object.assign(saved, { modelCallsUsed: 97, turnsUsed: 43, roundCallsStart: 50, roundTurnsStart: 20 });
  });
  await restored.run(original.id); await entered.promise;
  await restored.pause(original.id);
  pending.resolve({ ...result('profile-a'), section: 'MUST_NOT_COMMIT_AFTER_FINAL_SLOT_PAUSE' });
  await restored.waitForIdle(original.id);
  assert.equal(restored.get(original.id).status, 'paused');
  await assert.rejects(restored.run(original.id), /24 次|48 次/);
  const saved = await f.saved(original.id);
  assert.equal(saved.modelCallsUsed, 98); assert.equal(saved.turnsUsed, 44);
  assert.equal(saved.roundCallsStart, 50); assert.equal(saved.roundTurnsStart, 20);
  assert.equal(f.calls.length, 1); assert.deepEqual(saved.records, []);
});

test('a nonzero round baseline starts only the final allowed profile and preserves its completed result', async t => {
  const f = await fixture(t), original = await f.runtime.create(namesOnly());
  const restored = await restoreBudgetFixture(t, f, original.id, saved => {
    Object.assign(saved, { modelCallsUsed: 97, turnsUsed: 40, roundCallsStart: 50, roundTurnsStart: 20 });
  });
  await restored.run(original.id); await restored.waitForIdle(original.id);
  const saved = await f.saved(original.id);
  assert.equal(restored.get(original.id).status, 'error');
  assert.match(restored.get(original.id).error, /48 次/);
  assert.equal(saved.modelCallsUsed, 98); assert.equal(saved.turnsUsed, 41);
  assert.equal(saved.roundCallsStart, 50); assert.equal(saved.roundTurnsStart, 20);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].stage, 'profile-a');
  assert.deepEqual(saved.records.map(record => record.key), ['profile-a']);
});
