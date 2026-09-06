import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { loadImageBatchPlan, recordImageBatchReview, reconcileImageBatchUnknown, registerImageBatchQualityCorrection, registerImageBatchPostprocess, retryFailedImageBatchTasks, runImageBatch } from '../src/providers/image-batch.ts';
import { ImageProviderError, referenceDataUrl } from '../src/providers/openai-image-provider.ts';

// These tests inject local file writers, never an HTTP provider or real API config.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const digest = value => createHash('sha256').update(value).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const task = (id, extra = {}) => ({ id, prompt: id, ...extra });

async function fixture(t, tasks) {
  const directory = await mkdtemp(join(tmpdir(), 'brand-image-batch-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'jobs.json'), statePath = join(directory, 'state.json');
  await writeFile(manifestPath, JSON.stringify({ version: 1, tasks }));
  await writeFile(join(directory, 'source.png'), png);
  const asset = async id => {
    const path = join(directory, `${id}.png`);
    await writeFile(path, png);
    return { assetId: id, contentHash: digest(png), path, generationStatus: 'succeeded', reviewStatus: 'unverified',
      providerRequestId: id, providerResponseId: id, requestId: id, model: 'test', responsesModel: 'test',
      mimeType: 'image/png', metadataPath: join(directory, `${id}.json`), createdAt: new Date().toISOString() };
  };
  return { directory, manifestPath, statePath, asset };
}

test('batch fills four slots, refills promptly, attaches upstream files, and isolates dependency failures', async t => {
  const tasks = [task('poster', { dependencies: ['core'], referenceTasks: ['core'], references: ['./source.png'] }),
    task('core'), task('a'), task('b'), task('c'), task('d'), task('e'), task('blocked', { dependencies: ['b'] })];
  const f = await fixture(t, tasks), plan = await loadImageBatchPlan(f.manifestPath);
  const started = [], starts = new Map(tasks.map(task => [task.id, deferred()])), gates = new Map(tasks.map(task => [task.id, deferred()]));
  let live = 0, peak = 0;
  const provider = { async generate(input) {
    const id = input.prompt; started.push(id); live += 1; peak = Math.max(peak, live); starts.get(id).resolve(input);
    await gates.get(id).promise; live -= 1;
    if (id === 'b') throw new ImageProviderError('image_upstream_http_401', 'failed', 'request-b');
    return f.asset(id);
  } };
  const running = runImageBatch(plan, { provider, statePath: f.statePath });
  await Promise.all(['core', 'a', 'b', 'c'].map(id => starts.get(id).promise));
  assert.deepEqual(started, ['core', 'a', 'b', 'c']);
  gates.get('b').resolve();
  await starts.get('d').promise;
  assert.equal(started.includes('poster'), false);
  gates.get('core').resolve();
  await starts.get('e').promise;
  for (const gate of gates.values()) gate.resolve();
  const waiting = await running;
  assert.equal(waiting.status, 'waiting_review');
  assert.equal(waiting.tasks.poster.status, 'waiting_review');
  assert.equal(started.includes('poster'), false, 'generating an image does not approve its visual review');
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: waiting.tasks.core.asset.contentHash,
    evidence: 'Fixture inspection: reference silhouette and object structure match the supplied source.' });
  const result = await runImageBatch(plan, { provider, statePath: f.statePath });
  const posterInput = await starts.get('poster').promise;
  assert.deepEqual(posterInput.references, [referenceDataUrl(png), referenceDataUrl(png)]);
  assert.equal(peak, 4);
  assert.equal(result.tasks.b.status, 'failed');
  assert.equal(result.tasks.b.requestId, 'request-b');
  assert.equal(result.tasks.blocked.status, 'blocked');
  assert.equal(started.includes('blocked'), false);
  assert.equal(result.tasks.poster.status, 'succeeded');
  assert.equal(result.tasks.poster.references[0].path, join(f.directory, 'source.png'));
  assert.equal(result.tasks.poster.references[0].contentHash, digest(png));
  assert.equal(result.tasks.poster.references[1].path, join(f.directory, 'core.png'));
  const saved = await readFile(f.statePath, 'utf8');
  assert.doesNotMatch(saved, /data:image|base64|"prompt"/);
  const rerun = await runImageBatch(plan, { statePath: f.statePath, provider: { generate() { throw new Error('must not retry'); } } });
  assert.deepEqual(rerun.tasks, result.tasks);
  assert.equal(started.length, 7, 'one request per executed task, no retry for failed outcomes');
});

test('two delayed reviews leave four generation slots available and a shared core bypasses queued decorative reviews', { timeout: 10000 }, async t => {
  const tasks = ['decor-a', 'decor-b', 'queued-a', 'queued-b', 'core', 'filler-a', 'filler-b', 'filler-c']
    .map(id => task(id, id === 'filler-b' ? { dependencies: ['queued-a'] } : {}));
  tasks.push(task('poster', { dependencies: ['core'], referenceTasks: ['core'] }));
  const f = await fixture(t, tasks), plan = await loadImageBatchPlan(f.manifestPath);
  const generationGates = new Map(tasks.map(task => [task.id, deferred()]));
  const reviewGates = new Map(tasks.map(task => [task.id, deferred()]));
  const generationStarts = new Map(tasks.map(task => [task.id, deferred()]));
  const reviewStarts = new Map(tasks.map(task => [task.id, deferred()]));
  const coreSaved = deferred(), generated = [], reviewed = [];
  let generationLive = 0, reviewLive = 0, generationPeak = 0, reviewPeak = 0;
  const releaseAll = () => { for (const gate of [...generationGates.values(), ...reviewGates.values()]) gate.resolve(); };
  t.after(releaseAll);
  const running = runImageBatch(plan, { statePath: f.statePath,
    provider: { async generate(input) {
      const id = input.prompt;
      if (id === 'poster') {
        const saved = JSON.parse(await readFile(f.statePath, 'utf8'));
        assert.equal(saved.tasks.core.review.status, 'approved');
        assert.equal(saved.tasks.core.review.outputHash, saved.tasks.core.asset.contentHash);
        assert.deepEqual(input.references, [referenceDataUrl(png)]);
      }
      generated.push(id); generationLive += 1; generationPeak = Math.max(generationPeak, generationLive);
      generationStarts.get(id).resolve(); await generationGates.get(id).promise;
      const asset = await f.asset(id); generationLive -= 1; return asset;
    } },
    async review(task, record) {
      assert.equal(record.status, 'succeeded'); assert.equal(record.asset.contentHash, digest(png));
      reviewed.push(task.id); reviewLive += 1; reviewPeak = Math.max(reviewPeak, reviewLive);
      reviewStarts.get(task.id).resolve(); await reviewGates.get(task.id).promise;
      reviewLive -= 1;
      return { status: 'approved', evidence: 'Fixture visually inspected this exact output against its actual reference.' };
    },
    onChange(state) { if (state.tasks.core.status === 'succeeded') coreSaved.resolve(); },
  });
  await Promise.all(tasks.slice(0, 4).map(task => generationStarts.get(task.id).promise));
  generationGates.get('decor-a').resolve();
  await Promise.all([reviewStarts.get('decor-a').promise, generationStarts.get('core').promise]);
  generationGates.get('decor-b').resolve();
  await Promise.all([reviewStarts.get('decor-b').promise, generationStarts.get('filler-a').promise]);
  generationGates.get('queued-a').resolve(); await generationStarts.get('filler-b').promise;
  generationGates.get('queued-b').resolve(); await generationStarts.get('filler-c').promise;
  assert.equal(generationLive, 4, 'four replacement images are running while both inspections remain blocked');
  assert.equal(reviewLive, 2); assert.deepEqual(reviewed, ['decor-a', 'decor-b']);
  generationGates.get('core').resolve(); await coreSaved.promise;
  assert.equal(generated.includes('poster'), false, 'an uninspected generated core cannot become a reference');
  reviewGates.get('decor-a').resolve(); await reviewStarts.get('core').promise;
  assert.deepEqual(reviewed, ['decor-a', 'decor-b', 'core'], 'the actual visual reference moves ahead of decorations, including an ordinary ordering prerequisite');
  reviewGates.get('core').resolve(); await generationStarts.get('poster').promise;
  assert.equal(reviewLive, 2);
  assert.deepEqual(reviewed, ['decor-a', 'decor-b', 'core', 'queued-a']);
  assert.equal(reviewed.includes('queued-b'), false, 'the dependent image starts while decorative review work is still queued');
  releaseAll();
  const completed = await running;
  assert.equal(completed.status, 'completed');
  assert.equal(generationPeak, 4); assert.equal(reviewPeak, 2);
  assert.equal(generated.length, tasks.length); assert.equal(new Set(generated).size, tasks.length);
  assert.equal(reviewed.length, tasks.length); assert.equal(new Set(reviewed).size, tasks.length);
  assert.ok(Object.values(completed.tasks).every(record => record.review?.outputHash === record.asset?.contentHash));
});

test('pause drains active reviews, leaves queued inspections unstarted and resumes without regenerating saved images', { timeout: 10000 }, async t => {
  const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => task(id));
  const f = await fixture(t, tasks), plan = await loadImageBatchPlan(f.manifestPath);
  const controller = new AbortController(), bothReviews = deferred(), allSaved = deferred(), release = deferred();
  t.after(() => release.resolve());
  const generated = [], reviewed = [];
  const provider = { async generate(input) { generated.push(input.prompt); return f.asset(input.prompt); } };
  const running = runImageBatch(plan, { statePath: f.statePath, provider, signal: controller.signal,
    async review(task) {
      reviewed.push(task.id); if (reviewed.length === 2) bothReviews.resolve();
      await release.promise;
      return { status: 'approved', evidence: 'Fixture inspection of the submitted image completed successfully.' };
    },
    onChange(state) { if (Object.values(state.tasks).every(record => record.status === 'succeeded')) allSaved.resolve(); },
  });
  await Promise.all([bothReviews.promise, allSaved.promise]);
  assert.equal(reviewed.length, 2);
  controller.abort('user_pause');
  await assert.rejects(runImageBatch(plan, { statePath: f.statePath, provider }), /image_batch_state_locked/);
  release.resolve();
  const paused = await running;
  assert.equal(reviewed.length, 2, 'queued inspections are not started after abort');
  assert.equal(Object.values(paused.tasks).filter(record => record.review).length, 2, 'active inspections still save their exact output approvals');
  const resumed = [];
  const completed = await runImageBatch(plan, { statePath: f.statePath,
    provider: { generate() { throw new Error('saved images must not be generated again'); } },
    async review(task) { resumed.push(task.id); return { status: 'approved', evidence: 'Fixture resumed inspection confirms this saved image matches its reference.' }; },
  });
  assert.equal(generated.length, tasks.length);
  assert.equal(resumed.length, 4);
  assert.ok(resumed.every(id => !reviewed.includes(id)));
  assert.ok(Object.values(completed.tasks).every(record => record.review?.status === 'approved'));
});

test('inline visual approval cannot release dependencies after the reviewed output bytes change', async t => {
  const f = await fixture(t, [task('core'), task('poster', { dependencies: ['core'], referenceTasks: ['core'] })]);
  const plan = await loadImageBatchPlan(f.manifestPath), generated = [];
  const final = await runImageBatch(plan, { statePath: f.statePath,
    provider: { async generate(input) { generated.push(input.prompt); return f.asset(input.prompt); } },
    async review(_task, record) {
      await writeFile(record.asset.path, Buffer.concat([png, Buffer.from('changed-during-review')]));
      return { status: 'approved', evidence: 'A claimed visual approval cannot override an actual output hash mismatch.' };
    },
  });
  assert.deepEqual(generated, ['core']);
  assert.equal(final.tasks.core.review, undefined);
  assert.equal(final.tasks.core.error, 'image_batch_review_unavailable');
  assert.equal(final.tasks.poster.status, 'waiting_review');
});

test('four unknown outcomes reserve capacity across restarts; reconciliation releases only a confirmed terminal slot', async t => {
  const f = await fixture(t, Array.from({ length: 7 }, (_, id) => task(`task${id}`))), plan = await loadImageBatchPlan(f.manifestPath);
  const calls = [];
  const uncertain = { async generate(input) { calls.push(input.prompt); throw new ImageProviderError('image_upstream_timeout', 'unknown', `request-${input.prompt}`); } };
  const first = await runImageBatch(plan, { statePath: f.statePath, provider: uncertain });
  assert.equal(first.status, 'waiting_capacity');
  assert.equal(Object.values(first.tasks).filter(record => record.status === 'unknown').length, 4);
  assert.equal(Object.values(first.tasks).filter(record => record.status === 'waiting_capacity').length, 3);
  assert.equal(calls.length, 4);
  await runImageBatch(plan, { statePath: f.statePath, provider: uncertain });
  assert.equal(calls.length, 4, 'resuming cannot forget the outstanding upstream jobs');
  await reconcileImageBatchUnknown({ statePath: f.statePath, taskId: 'task0', outcome: 'cancelled',
    evidence: 'Fixture host checked the upstream request and confirmed cancellation.' });
  let live = 0, peak = 0;
  const completed = await runImageBatch(plan, { statePath: f.statePath, provider: { async generate(input) {
    calls.push(input.prompt); live += 1; peak = Math.max(peak, live);
    const asset = await f.asset(input.prompt); live -= 1; return asset;
  } } });
  assert.equal(peak, 1, 'three unreconciled unknown requests continue to occupy three slots');
  assert.equal(calls.length, 7);
  assert.equal(completed.tasks.task0.status, 'failed');
  assert.equal(completed.tasks.task0.reconciliation.outcome, 'cancelled');
});

test('explicit retry preserves the failed attempt and frozen references, reopens only its affected dependencies and requires a fresh output review', async t => {
  const f = await fixture(t, [task('core', { references: ['./source.png'] }), task('child', { dependencies: ['core'], referenceTasks: ['core'] }),
    task('grandchild', { dependencies: ['child'] }), task('other-failure'), task('other-child', { dependencies: ['other-failure'] }),
    task('joined', { dependencies: ['core', 'other-failure'] }), task('independent')]);
  const plan = await loadImageBatchPlan(f.manifestPath), frozen = structuredClone(plan), calls = [];
  const failed = await runImageBatch(plan, { statePath: f.statePath, provider: { async generate(input) {
    calls.push(input);
    if (['core', 'other-failure'].includes(input.prompt)) throw new ImageProviderError('image_upstream_http_400', 'failed', `old-${input.prompt}`);
    return f.asset(input.prompt);
  } } });
  const oldCore = structuredClone(failed.tasks.core), evidence = 'Confirmed terminal HTTP 400 failure; explicitly authorize one new core attempt with the unchanged design.';
  const retried = await retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['core'], evidence });
  assert.deepEqual(plan, frozen);
  assert.equal(retried.tasks.core.status, 'pending'); assert.equal(retried.tasks.core.attempt, 2);
  assert.ok(retried.tasks.core.attemptId); assert.equal(retried.tasks.core.requestId, undefined);
  assert.deepEqual(retried.tasks.core.retryHistory[0].record, oldCore);
  assert.equal(retried.tasks.core.retryHistory[0].manifestHash, plan.manifestHash);
  assert.match(retried.tasks.core.retryHistory[0].taskHash, /^[a-f0-9]{64}$/);
  assert.equal(retried.tasks.core.retryHistory[0].evidence, evidence);
  assert.equal(retried.tasks.core.status, 'pending'); assert.equal(retried.tasks.child.status, 'pending'); assert.equal(retried.tasks.grandchild.status, 'pending');
  for (const id of ['other-failure', 'other-child', 'joined', 'independent']) assert.deepEqual(retried.tasks[id], failed.tasks[id]);
  const before = calls.length;
  const provider = { async generate(input) { calls.push(input); return { ...await f.asset(input.prompt), requestId: `fresh-${input.prompt}` }; } };
  const waiting = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.deepEqual(calls.slice(before).map(input => input.prompt), ['core']);
  assert.deepEqual(calls.at(-1), calls.find(input => input.prompt === 'core'), 'retry submits exactly the frozen prompt and original references');
  assert.equal(waiting.tasks.core.asset.requestId, 'fresh-core');
  assert.equal(waiting.tasks.child.status, 'waiting_review'); assert.equal(waiting.tasks.grandchild.status, 'waiting_review');
  assert.deepEqual(waiting.tasks.core.retryHistory, retried.tasks.core.retryHistory);
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: waiting.tasks.core.asset.contentHash,
    evidence: 'The actual new core output was visually inspected against the frozen original reference.' });
  const resumed = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.deepEqual(calls.slice(before).map(input => input.prompt), ['core', 'child', 'grandchild']);
  assert.deepEqual(calls.find(input => input.prompt === 'child').references, [referenceDataUrl(png)]);
  assert.deepEqual(resumed.tasks.core.retryHistory[0].record, oldCore);
  assert.equal(resumed.tasks['other-child'].status, 'blocked'); assert.equal(resumed.tasks.joined.status, 'blocked');
  await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['core'], evidence }), /requires_failed_without_asset/);
  const persisted = JSON.parse(await readFile(f.statePath, 'utf8'));
  assert.deepEqual(persisted.tasks.core.retryHistory, retried.tasks.core.retryHistory);
  assert.doesNotMatch(JSON.stringify(persisted.tasks.core.retryHistory), /data:image|base64/);
});

test('an upstream refusal cannot be retried as a transport failure', async t => {
  const f = await fixture(t, [task('core')]), plan = await loadImageBatchPlan(f.manifestPath);
  let calls = 0;
  const provider = { async generate() { calls++; throw new ImageProviderError('image_upstream_declined', 'failed', 'refused-request'); } };
  await runImageBatch(plan, { statePath: f.statePath, provider });
  const before = await readFile(f.statePath, 'utf8');
  await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['core'], evidence: 'Do not repeat an explicitly declined request.' }), /retry_upstream_declined/);
  assert.equal(await readFile(f.statePath, 'utf8'), before);
  await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(calls, 1);
});

test('a second terminal failure exhausts the one explicit retry and repeated run never resubmits it', async t => {
  const f = await fixture(t, [task('core')]), plan = await loadImageBatchPlan(f.manifestPath);
  let count = 0;
  const provider = { async generate() { count += 1; throw new ImageProviderError('image_upstream_http_400', 'failed', `attempt-${count}`); } };
  await runImageBatch(plan, { statePath: f.statePath, provider });
  const options = { statePath: f.statePath, taskIds: ['core'], evidence: 'The original failure is terminal; explicitly authorize one additional attempt.' };
  await retryFailedImageBatchTasks(plan, options);
  const failed = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(failed.tasks.core.requestId, 'attempt-2'); assert.equal(failed.tasks.core.retryHistory[0].record.requestId, 'attempt-1');
  await assert.rejects(retryFailedImageBatchTasks(plan, options), /retry_limit_reached/);
  await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(count, 2);
});

test('retry rejects nonterminal or existing-image states atomically and requires explicit bounded named targets', async t => {
  const f = await fixture(t, [task('eligible'), task('ineligible')]), plan = await loadImageBatchPlan(f.manifestPath);
  const asset = await f.asset('ineligible');
  for (const record of [{ status: 'pending' }, { status: 'running' }, { status: 'unknown' }, { status: 'blocked' },
    { status: 'succeeded', asset, review: { status: 'needs_revision', outputHash: asset.contentHash, evidence: 'Rejected existing image', reviewedAt: 'fixture' } },
    { status: 'failed', asset }, { status: 'failed', review: { status: 'needs_revision' } }]) {
    const state = { version: 1, manifestHash: plan.manifestHash, updatedAt: 'fixture',
      tasks: { eligible: { status: 'failed', requestId: 'original' }, ineligible: record } };
    await writeFile(f.statePath, JSON.stringify(state));
    const before = await readFile(f.statePath, 'utf8');
    await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['eligible', 'ineligible'], evidence: 'Explicit bounded retry request for named tasks only.' }), /requires_failed_without_asset/);
    assert.equal(await readFile(f.statePath, 'utf8'), before, 'one invalid target prevents every selected mutation');
  }
  for (const taskIds of [[], ['eligible', 'eligible'], Array.from({ length: 17 }, (_, i) => `task-${i}`), ['__proto__']]) {
    await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds, evidence: 'Explicit bounded retry request for named tasks only.' }), /invalid_retry/);
  }
  await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['missing'], evidence: 'Explicit bounded retry request for named tasks only.' }), /requires_failed_without_asset/);
});

test('an unknown request must be reconciled with terminal evidence before a retry can be authorized', async t => {
  const f = await fixture(t, [task('core')]), plan = await loadImageBatchPlan(f.manifestPath);
  await runImageBatch(plan, { statePath: f.statePath, provider: { async generate() { throw new ImageProviderError('image_upstream_timeout', 'unknown', 'uncertain-original'); } } });
  const retry = { statePath: f.statePath, taskIds: ['core'], evidence: 'After terminal outcome verification, authorize one separate new attempt.' };
  await assert.rejects(retryFailedImageBatchTasks(plan, retry), /requires_failed_without_asset/);
  await reconcileImageBatchUnknown({ statePath: f.statePath, taskId: 'core', outcome: 'cancelled', evidence: 'The provider confirmed the original request was cancelled with no generated output.' });
  const pending = await retryFailedImageBatchTasks(plan, retry);
  assert.equal(pending.tasks.core.retryHistory[0].record.reconciliation.outcome, 'cancelled');
  assert.match(pending.tasks.core.retryHistory[0].record.reconciliation.evidence, /provider confirmed/);
});

test('retry refuses changed source bytes before authorization and treats a reused provider request identity as unknown', async t => {
  const f = await fixture(t, [task('core', { references: ['./source.png'] })]), plan = await loadImageBatchPlan(f.manifestPath);
  await runImageBatch(plan, { statePath: f.statePath, provider: { async generate() { throw new ImageProviderError('image_upstream_http_400', 'failed', 'old-request'); } } });
  const retry = { statePath: f.statePath, taskIds: ['core'], evidence: 'Explicitly permit one distinct new request after the confirmed terminal failure.' };
  await writeFile(join(f.directory, 'source.png'), Buffer.concat([png, Buffer.from('changed')]));
  await assert.rejects(retryFailedImageBatchTasks(plan, retry), /reference_changed/);
  await writeFile(join(f.directory, 'source.png'), png);
  await retryFailedImageBatchTasks(plan, retry);
  const reused = await runImageBatch(plan, { statePath: f.statePath, provider: { async generate() { return { ...await f.asset('core'), requestId: 'old-request' }; } } });
  assert.equal(reused.tasks.core.status, 'unknown'); assert.equal(reused.tasks.core.error, 'image_batch_retry_request_id_reused');
  assert.equal(reused.tasks.core.asset, undefined);
});

test('recovering a real successful unknown unblocks only unsubmitted dependencies and still requires visual review', async t => {
  const f = await fixture(t, [task('poster', { dependencies: ['core'], referenceTasks: ['core'] }), task('core')]);
  const plan = await loadImageBatchPlan(f.manifestPath), calls = [];
  const first = await runImageBatch(plan, { statePath: f.statePath, provider: { async generate(input) {
    calls.push(input.prompt); throw new ImageProviderError('image_upstream_timeout', 'unknown', 'original-request-core');
  } } });
  assert.equal(first.tasks.poster.status, 'blocked');
  const recovered = { ...await f.asset('core'), requestId: 'original-request-core' };
  await assert.rejects(reconcileImageBatchUnknown({ statePath: f.statePath, taskId: 'core', outcome: 'succeeded',
    evidence: 'Fixture host found a real saved image from the original request.', asset: { ...recovered, requestId: 'another-request' } }), /asset_mismatch/);
  await reconcileImageBatchUnknown({ statePath: f.statePath, taskId: 'core', outcome: 'succeeded',
    evidence: 'Fixture host found the saved final asset for the original request.', asset: recovered });
  const provider = { async generate(input) { calls.push(input.prompt); return f.asset(input.prompt); } };
  const waiting = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(waiting.tasks.poster.status, 'waiting_review');
  assert.deepEqual(calls, ['core'], 'recovering a result never resubmits its generation');
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: recovered.contentHash,
    evidence: 'Fixture visual inspection confirmed the recovered image matches the reference.' });
  const final = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(final.status, 'completed');
  assert.deepEqual(calls, ['core', 'poster']);
});

test('visual review requires the exact saved hash, propagates waiting status, and needs-revision keeps downstream stopped', async t => {
  const f = await fixture(t, [task('descendant', { dependencies: ['poster'] }),
    task('poster', { dependencies: ['core'], referenceTasks: ['core'] }), task('core')]);
  const plan = await loadImageBatchPlan(f.manifestPath), calls = [];
  const provider = { async generate(input) { calls.push(input.prompt); return f.asset(input.prompt); } };
  const first = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.deepEqual(calls, ['core']);
  assert.equal(first.status, 'waiting_review');
  assert.equal(first.tasks.descendant.status, 'waiting_review');
  await assert.rejects(recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: '0'.repeat(64), evidence: 'Wrong hash must never approve this generated file.' }), /review_asset_mismatch/);
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: first.tasks.core.asset.contentHash,
    status: 'needs_revision', evidence: 'Fixture inspection: incorrect brand symbol; this version needs revision.' });
  const rejected = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(rejected.tasks.poster.status, 'waiting_review');
  assert.deepEqual(calls, ['core']);
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: first.tasks.core.asset.contentHash,
    status: 'approved', reviewer: 'Independent fixture visual reviewer', evidence: 'Fixture re-inspection: symbol comparison is now accepted for this exact file.' });
  const completed = await runImageBatch(plan, { statePath: f.statePath, provider });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.tasks.core.review.reviewer, 'Independent fixture visual reviewer');
  assert.deepEqual(completed.tasks.core.reviewHistory, [rejected.tasks.core.review], 'a later attributed inspection preserves the exact prior verdict and evidence');
  assert.deepEqual(calls, ['core', 'poster', 'descendant']);
});

test('the same state cannot start twice, completed assets are reused, and edited assets stop reuse', async t => {
  const f = await fixture(t, [task('core')]), plan = await loadImageBatchPlan(f.manifestPath);
  const entered = deferred(), release = deferred(); let calls = 0;
  const provider = { async generate() { calls += 1; entered.resolve(); await release.promise; return f.asset('core'); } };
  const first = runImageBatch(plan, { provider, statePath: f.statePath });
  await entered.promise;
  await assert.rejects(runImageBatch(plan, { provider, statePath: f.statePath }), /image_batch_state_locked/);
  await assert.rejects(retryFailedImageBatchTasks(plan, { statePath: f.statePath, taskIds: ['core'], evidence: 'Even an explicit retry cannot mutate an active locked image batch.' }), /image_batch_state_locked/);
  release.resolve(); await first;
  await runImageBatch(plan, { provider, statePath: f.statePath });
  assert.equal(calls, 1);
  await writeFile(join(f.directory, 'core.png'), 'changed');
  await assert.rejects(runImageBatch(plan, { provider, statePath: f.statePath }), /image_batch_saved_asset_changed/);
  assert.equal(calls, 1, 'missing/changed output must not silently cause another paid request');
});

test('interrupted running work becomes unknown; only pending independent work can resume', async t => {
  const f = await fixture(t, [task('core'), task('child', { dependencies: ['core'], referenceTasks: ['core'] }), task('independent')]);
  const plan = await loadImageBatchPlan(f.manifestPath), calls = [];
  await writeFile(f.statePath, JSON.stringify({ version: 1, manifestHash: plan.manifestHash, updatedAt: new Date().toISOString(),
    tasks: { core: { status: 'running' }, child: { status: 'pending' }, independent: { status: 'pending' } } }));
  const result = await runImageBatch(plan, { statePath: f.statePath, provider: { async generate(input) { calls.push(input.prompt); return f.asset(input.prompt); } } });
  assert.deepEqual(calls, ['independent']);
  assert.equal(result.tasks.core.status, 'unknown');
  assert.equal(result.tasks.core.error, 'image_batch_interrupted_unknown');
  assert.equal(result.tasks.child.status, 'blocked');
});

test('all manifest inputs are checked before generation; dependency and reference mistakes reject the batch', async t => {
  for (const tasks of [
    [task('same'), task('same')], [task('__proto__')],
    [task('a', { dependencies: ['missing'] })], [task('a', { dependencies: ['a'] })],
    [task('a', { dependencies: ['b'] }), task('b', { dependencies: ['a'] })],
    [task('a'), task('b', { referenceTasks: ['a'] })],
    [task('a', { references: ['https://example.test/image.png'] })],
    [task('a', { references: [referenceDataUrl(png)] })],
    [task('a', { prompt: ' ' })], [task('a', { ratio: '5:5' })],
    [task('a'), task('b'), task('c'), task('d'), task('e'), task('f', { dependencies: ['a', 'b', 'c', 'd', 'e'], referenceTasks: ['a', 'b', 'c', 'd', 'e'] })],
  ]) {
    const f = await fixture(t, tasks);
    await assert.rejects(loadImageBatchPlan(f.manifestPath));
  }
});

test('source bytes bind the manifest identity and concurrency must be between one and four', async t => {
  const f = await fixture(t, [task('a', { references: ['./source.png'] })]), plan = await loadImageBatchPlan(f.manifestPath);
  let calls = 0;
  const provider = { async generate() { calls += 1; return f.asset('a'); } };
  for (const concurrency of [0, 5, 1.5, NaN]) await assert.rejects(runImageBatch(plan, { provider, statePath: f.statePath, concurrency }), /invalid_concurrency/);
  for (const reviewConcurrency of [0, 5, 1.5, NaN]) await assert.rejects(runImageBatch(plan, { provider, statePath: f.statePath, reviewConcurrency }), /invalid_review_concurrency/);
  await runImageBatch(plan, { provider, statePath: f.statePath, concurrency: 1 });
  await writeFile(join(f.directory, 'source.png'), Buffer.concat([png, Buffer.from([0])]));
  const changed = await loadImageBatchPlan(f.manifestPath);
  assert.notEqual(changed.manifestHash, plan.manifestHash);
  await assert.rejects(runImageBatch(changed, { provider, statePath: f.statePath }), /state_mismatch/);
  assert.equal(calls, 1);
});

const correctionInput = f => ({ manifestPath: f.manifestPath, statePath: f.statePath, taskId: 'core',
  instruction: 'Restore the exact heavy italic source wordmark and reduce the ear shape to a subtle outline; preserve everything else.',
  evidence: 'Actual output inspection found an upright substitute font and an oversized solid ear graphic; one local edit is authorized.' });
async function rejectedCore(f, plan, other = {}) {
  const asset = await f.asset('core-original');
  const state = { version: 1, manifestHash: plan.manifestHash, updatedAt: new Date().toISOString(),
    tasks: Object.fromEntries(plan.tasks.map(item => [item.id, { status: 'pending' }])) };
  state.tasks.core = { status: 'succeeded', asset, references: structuredClone(plan.tasks.find(item => item.id === 'core').references),
    review: { status: 'needs_revision', outputHash: asset.contentHash, evidence: correctionInput(f).evidence, reviewedAt: new Date().toISOString() } };
  Object.assign(state.tasks, other); await writeFile(f.statePath, JSON.stringify(state)); return state;
}

test('explicit quality correction keeps full rejected evidence, appends the actual output and requires a new hash approval before any dependent', async t => {
  const f = await fixture(t, [task('core', { references: ['./source.png'], ratio: '3:4' }),
    task('child', { dependencies: ['core'], referenceTasks: ['core'] }), task('ordinary-child', { dependencies: ['core'] }), task('unrelated')]);
  const plan = await loadImageBatchPlan(f.manifestPath), originalManifest = await readFile(f.manifestPath, 'utf8');
  const unrelated = { status: 'succeeded', asset: await f.asset('unrelated'), review: { status: 'approved', outputHash: digest(png), evidence: 'The independent output was actually inspected and approved.', reviewedAt: new Date().toISOString() } };
  const original = await rejectedCore(f, plan, { unrelated });
  const result = await registerImageBatchQualityCorrection(plan, correctionInput(f));
  assert.notEqual(result.manifestHash, plan.manifestHash); assert.equal(result.state.manifestHash, result.manifestHash);
  assert.equal((await loadImageBatchPlan(f.manifestPath)).manifestHash, result.manifestHash);
  assert.deepEqual(JSON.parse(await readFile(f.statePath, 'utf8')), result.state);
  assert.equal(result.state.tasks.core.status, 'pending'); assert.equal(result.state.tasks.core.attempt, 2); assert.ok(result.state.tasks.core.attemptId);
  assert.equal(result.state.tasks.core.asset, undefined); assert.equal(result.state.tasks.core.review, undefined); assert.equal(result.state.tasks.core.retryHistory, undefined);
  assert.deepEqual(result.state.tasks.unrelated, original.tasks.unrelated);
  const history = result.state.tasks.core.correctionHistory[0];
  assert.equal(history.originalManifest, originalManifest); assert.equal(history.originalManifestFileHash, digest(originalManifest));
  assert.deepEqual(history.record, original.tasks.core); assert.equal(history.editReference.path, original.tasks.core.asset.path);
  assert.equal(history.editReference.contentHash, original.tasks.core.asset.contentHash); assert.equal(history.manifestHash, plan.manifestHash);
  assert.equal(history.correctedManifestHash, result.manifestHash); assert.equal(history.instruction, correctionInput(f).instruction);
  assert.equal(history.evidence, correctionInput(f).evidence); assert.ok(history.authorizedAt);
  assert.equal(history.originalTask.request.references, undefined); assert.doesNotMatch(JSON.stringify(result.state), /data:image|base64/);
  const correctedTask = result.plan.tasks[0];
  assert.ok(correctedTask.request.prompt.startsWith(plan.tasks[0].request.prompt)); assert.ok(correctedTask.request.prompt.includes(correctionInput(f).instruction));
  assert.equal(correctedTask.request.ratio, '3:4'); assert.deepEqual(correctedTask.dependencies, plan.tasks[0].dependencies);
  assert.deepEqual(correctedTask.references.slice(0, -1), plan.tasks[0].references); assert.deepEqual(correctedTask.references.at(-1), history.editReference);
  assert.deepEqual(result.plan.tasks.slice(1), plan.tasks.slice(1));
  await assert.rejects(runImageBatch(plan, { statePath: f.statePath, provider: { generate() { throw new Error('old plan cannot execute'); } } }), /state_mismatch/);
  const generated = [], correctedBytes = Buffer.concat([png, Buffer.from('corrected-output')]);
  const provider = { async generate(input) {
    if (input.prompt.startsWith('core')) {
      generated.push('core'); assert.deepEqual(input.references, [referenceDataUrl(png), referenceDataUrl(png)]);
      const asset = await f.asset('core-corrected'); await writeFile(asset.path, correctedBytes); asset.contentHash = digest(correctedBytes); return asset;
    }
    generated.push(input.prompt);
    if (input.prompt === 'child') assert.deepEqual(input.references, [referenceDataUrl(correctedBytes)]);
    return f.asset(input.prompt);
  } };
  const waiting = await runImageBatch(await loadImageBatchPlan(f.manifestPath), { statePath: f.statePath, provider });
  assert.deepEqual(generated, ['core']); assert.equal(waiting.tasks.child.status, 'waiting_review'); assert.equal(waiting.tasks['ordinary-child'].status, 'waiting_review');
  assert.equal(waiting.tasks.core.asset.requestId, 'core-corrected'); assert.deepEqual(waiting.tasks.core.correctionHistory[0], history);
  await assert.rejects(recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: original.tasks.core.asset.contentHash, evidence: 'An old image approval must not release the newly corrected output.' }), /review_asset_mismatch/);
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: digest(correctedBytes), evidence: 'The new corrected file was actually compared against the identity source and accepted.' });
  const completed = await runImageBatch(await loadImageBatchPlan(f.manifestPath), { statePath: f.statePath, provider });
  assert.equal(completed.status, 'completed'); assert.deepEqual([...generated].sort(), ['child', 'core', 'ordinary-child']);
  assert.equal(digest(await readFile(original.tasks.core.asset.path)), original.tasks.core.asset.contentHash);
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: digest(correctedBytes), status: 'needs_revision', evidence: 'A second observed defect may be recorded but cannot authorize unlimited edits.' });
  await assert.rejects(registerImageBatchQualityCorrection(result.plan, correctionInput(f)), /correction_limit_reached/);
});

test('quality correction rejects ineligible states, changed files, completed descendants and excessive references without changing either frozen file', async t => {
  for (const kind of ['unknown', 'running', 'approved', 'unreviewed', 'review-hash', 'descendant', 'old-output-changed', 'source-changed', 'reference-limit']) {
    const paths = kind === 'reference-limit' ? ['./source.png', './second.png', './third.png', './fourth.png'] : ['./source.png'];
    const f = await fixture(t, [task('core', { references: paths }), task('child', { dependencies: ['core'], referenceTasks: ['core'] })]);
    for (const name of ['second.png', 'third.png', 'fourth.png']) await writeFile(join(f.directory, name), png);
    const plan = await loadImageBatchPlan(f.manifestPath), state = await rejectedCore(f, plan);
    if (['unknown', 'running'].includes(kind)) state.tasks.core.status = kind;
    if (kind === 'approved') state.tasks.core.review.status = 'approved';
    if (kind === 'unreviewed') delete state.tasks.core.review;
    if (kind === 'review-hash') state.tasks.core.review.outputHash = '0'.repeat(64);
    if (kind === 'descendant') state.tasks.child = { status: 'succeeded', asset: await f.asset('child') };
    if (kind === 'old-output-changed') await writeFile(state.tasks.core.asset.path, Buffer.concat([png, Buffer.from('tampered')]));
    if (kind === 'source-changed') await writeFile(join(f.directory, 'source.png'), Buffer.concat([png, Buffer.from('tampered')]));
    await writeFile(f.statePath, JSON.stringify(state));
    const manifestBefore = await readFile(f.manifestPath, 'utf8'), stateBefore = await readFile(f.statePath, 'utf8');
    await assert.rejects(registerImageBatchQualityCorrection(plan, correctionInput(f)), undefined, kind);
    assert.equal(await readFile(f.manifestPath, 'utf8'), manifestBefore, kind); assert.equal(await readFile(f.statePath, 'utf8'), stateBefore, kind);
  }
});

test('quality correction honors the batch lock and incomplete transaction marker, and an aborted resume leaves the correction pending', async t => {
  const f = await fixture(t, [task('core')]), plan = await loadImageBatchPlan(f.manifestPath);
  await rejectedCore(f, plan); const originalState = await readFile(f.statePath, 'utf8');
  await writeFile(`${f.statePath}.lock`, 'active batch');
  await assert.rejects(registerImageBatchQualityCorrection(plan, correctionInput(f)), /state_locked/); await rm(`${f.statePath}.lock`);
  await writeFile(`${f.manifestPath}.quality-correction.json`, JSON.stringify({ version: 1, interrupted: true }));
  await assert.rejects(loadImageBatchPlan(f.manifestPath), /correction_transaction_incomplete/);
  await assert.rejects(registerImageBatchQualityCorrection(plan, correctionInput(f)), /correction_transaction_incomplete/);
  assert.equal(await readFile(f.statePath, 'utf8'), originalState); await rm(`${f.manifestPath}.quality-correction.json`);
  const result = await registerImageBatchQualityCorrection(plan, correctionInput(f)), controller = new AbortController(); controller.abort('paused');
  const paused = await runImageBatch(result.plan, { statePath: f.statePath, signal: controller.signal,
    provider: { generate() { throw new Error('no request after abort'); } }, review() { throw new Error('no inspection after abort'); } });
  assert.equal(paused.tasks.core.status, 'pending'); assert.equal(paused.tasks.core.correctionHistory.length, 1);
});

test('quality correction rejects reuse of the original paid request identity and a failed correction cannot become a fresh failed retry', async t => {
  for (const kind of ['reused-success', 'reused-failure', 'new-failure']) {
    const f = await fixture(t, [task('core'), task('child', { dependencies: ['core'], referenceTasks: ['core'] })]);
    const plan = await loadImageBatchPlan(f.manifestPath), original = await rejectedCore(f, plan);
    const correction = await registerImageBatchQualityCorrection(plan, correctionInput(f));
    let calls = 0;
    const result = await runImageBatch(correction.plan, { statePath: f.statePath, provider: { async generate() {
      calls += 1;
      if (kind !== 'reused-success') throw new ImageProviderError('image_upstream_http_400', 'failed', kind === 'reused-failure' ? original.tasks.core.asset.requestId : 'new-correction-request');
      const asset = await f.asset('core-new-file'); asset.requestId = original.tasks.core.asset.requestId; return asset;
    } } });
    assert.equal(calls, 1); assert.equal(result.tasks.core.status, kind === 'new-failure' ? 'failed' : 'unknown');
    assert.equal(result.tasks.child.status, 'blocked'); assert.deepEqual(result.tasks.core.correctionHistory[0].record, original.tasks.core);
    if (kind !== 'new-failure') assert.equal(result.tasks.core.error, 'image_batch_correction_request_id_reused');
    else await assert.rejects(retryFailedImageBatchTasks(correction.plan, { statePath: f.statePath, taskIds: ['core'], evidence: 'A failed authorized correction cannot open another ordinary retry allowance.' }), /retry_limit_reached/);
  }
});

async function postprocessFixture(t) {
  const f = await fixture(t, [task('core', { references: ['./source.png'] }), task('child', { dependencies: ['core'], referenceTasks: ['core'] }), task('ordinary', { dependencies: ['core'] })]);
  const original = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const processed = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#cccccc' } }).png().toBuffer();
  await writeFile(join(f.directory, 'source.png'), original);
  const plan = await loadImageBatchPlan(f.manifestPath), state = await rejectedCore(f, plan);
  await writeFile(state.tasks.core.asset.path, original); state.tasks.core.asset.contentHash = digest(original); state.tasks.core.review.outputHash = digest(original);
  await writeFile(f.statePath, JSON.stringify(state));
  const asset = { kind: 'local-postprocess', generationStatus: 'postprocessed', assetId: 'local-logo-output', path: join(f.directory, 'postprocess.png'),
    metadataPath: join(f.directory, 'postprocess.json'), contentHash: digest(processed), mimeType: 'image/png', createdAt: new Date().toISOString(), reviewStatus: 'unverified' };
  await writeFile(asset.path, processed); await writeFile(asset.metadataPath, JSON.stringify(asset));
  const input = { statePath: f.statePath, taskId: 'core', expectedOutputHash: digest(original), asset, source: plan.tasks[0].references[0],
    processing: { tool: 'fixture-local-composite', parameters: { sourceHash: digest(original), transform: [1, 0, 0, 1], mask: 'fixture-mask' } },
    evidence: 'User explicitly authorized placing the verified original logo; this local derivative retains the same canvas dimensions.' };
  return { ...f, plan, state, input, original, processed };
}

test('local postprocess registers honest non-provider provenance and requires actual review before either reference or ordinary dependents run', async t => {
  const f = await postprocessFixture(t), manifest = await readFile(f.manifestPath, 'utf8');
  const state = await registerImageBatchPostprocess(f.plan, f.input), core = state.tasks.core;
  assert.equal(core.asset.generationStatus, 'postprocessed'); assert.equal(core.asset.kind, 'local-postprocess');
  for (const key of ['model', 'requestId', 'providerRequestId', 'providerResponseId', 'responsesModel']) assert.equal(core.asset[key], undefined);
  assert.equal(core.review, undefined); assert.equal(core.requestId, undefined); assert.equal(core.diagnostics, undefined); assert.equal(core.attempt, undefined);
  assert.equal(state.manifestHash, f.plan.manifestHash); assert.equal(await readFile(f.manifestPath, 'utf8'), manifest);
  assert.deepEqual(core.postprocessHistory[0].record, f.state.tasks.core); assert.deepEqual(core.postprocessHistory[0].source, f.input.source);
  assert.deepEqual(core.postprocessHistory[0].processing, f.input.processing); assert.equal(core.postprocessHistory[0].outputHash, digest(f.processed));
  const calls = [], provider = { async generate(input) { calls.push(input.prompt); return f.asset(input.prompt); } };
  const waiting = await runImageBatch(f.plan, { statePath: f.statePath, provider });
  assert.deepEqual(calls, []); assert.equal(waiting.tasks.child.status, 'waiting_review'); assert.equal(waiting.tasks.ordinary.status, 'waiting_review');
  await assert.rejects(recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: digest(f.original), evidence: 'The old review cannot approve the newly composed original logo output.' }), /review_asset_mismatch/);
  const reviewed = [];
  const final = await runImageBatch(f.plan, { statePath: f.statePath, provider, review(task, record) {
    reviewed.push(task.id); assert.ok(record.asset.contentHash); return { status: 'approved', evidence: 'The actual local composite was inspected against the exact original logo and accepted.' };
  } });
  assert.equal(final.status, 'completed'); assert.deepEqual(calls.sort(), ['child', 'ordinary']); assert.equal(reviewed[0], 'core');
  assert.deepEqual(final.tasks.core.postprocessHistory, core.postprocessHistory); assert.equal(digest(await readFile(f.state.tasks.core.asset.path)), digest(f.original));
  await recordImageBatchReview({ statePath: f.statePath, taskId: 'core', outputHash: digest(f.processed), status: 'needs_revision', evidence: 'A further review may identify issues but cannot reopen unlimited local edits.' });
  await assert.rejects(registerImageBatchPostprocess(f.plan, { ...f.input, expectedOutputHash: digest(f.processed) }), /postprocess_limit_reached/);
});

test('local postprocess rejects counterfeit provider fields, invalid pixels, changed dimensions, stale hashes and generated dependents without mutation', async t => {
  const f = await postprocessFixture(t), before = await readFile(f.statePath, 'utf8');
  for (const change of [input => { input.asset.model = 'pretend-model'; }, input => { input.expectedOutputHash = '0'.repeat(64); },
    input => { input.source.contentHash = '0'.repeat(64); }, input => { input.asset.path = f.state.tasks.core.asset.path; },
    input => { input.processing.parameters = { invalid: NaN }; }]) {
    const input = structuredClone(f.input); change(input); await assert.rejects(registerImageBatchPostprocess(f.plan, input));
    assert.equal(await readFile(f.statePath, 'utf8'), before);
  }
  for (const bytes of [Buffer.from('not an image'), await sharp({ create: { width: 17, height: 12, channels: 3, background: '#cccccc' } }).png().toBuffer()]) {
    await writeFile(f.input.asset.path, bytes); const input = structuredClone(f.input); input.asset.contentHash = digest(bytes);
    await assert.rejects(registerImageBatchPostprocess(f.plan, input), /postprocess_invalid_image|postprocess_dimensions_changed/);
    assert.equal(await readFile(f.statePath, 'utf8'), before);
  }
  await writeFile(f.input.asset.path, f.processed);
  const state = structuredClone(f.state); state.tasks.child = { status: 'succeeded', asset: await f.asset('already-produced-child') };
  await writeFile(f.statePath, JSON.stringify(state));
  await assert.rejects(registerImageBatchPostprocess(f.plan, f.input), /postprocess_has_generated_dependents/);
  await writeFile(`${f.statePath}.lock`, 'in-flight'); await assert.rejects(registerImageBatchPostprocess(f.plan, f.input), /state_locked/); await rm(`${f.statePath}.lock`);
});
