import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { AutomaticMediaPipeline } from '../src/server/automatic-media.ts';
import { ImageProviderError } from '../src/providers/openai-image-provider.ts';

// Entire pipeline fixtures: no web access, model processes or paid generation.
const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ff0000' } }).png().toBuffer();
const digest = value => createHash('sha256').update(value).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const brands = { a: { name: 'Coffee fixture' }, b: { name: 'Game fixture' } };
const item = (id, extra = {}) => ({ id, name: id, priority: 'recommended', dependencies: [], category: 'product',
  role: 'A distinct user purpose', design: 'Fixture design', ipExpression: 'Official identity fixture', variants: [], feasibility: 'Concept only', ...extra });

async function fixture(t, items, hooks = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'brand-auto-media-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [], generated = [], changes = [], collected = [];
  const plan = { productAnchor: { brandId: 'a', category: 'coffee', coreProduct: 'Coffee fixture', rationale: 'Context', ipAssets: ['Element'], translation: 'Printed element' }, scopeNote: 'Fixture scoped concept', items };
  const visuals = items.map(item => ({ materialId: item.id, prompt: item.id }));
  const options = { sessionId: 'fixture-session', revision: 1, directory, imageOutputDir: join(directory, 'images'),
    discoverPage: hooks.discoverPage,
    async collect(input) {
      collected.push(input);
      const id = `reference-${randomUUID()}`, root = join(input.outputDir, id);
      await mkdir(root, { recursive: true });
      const html = hooks.noImageLink ? '<html>Unrelated source, no image relationship.</html>' : `<html><title>Fixture official page</title><img src="${input.imageUrl}"></html>`;
      const result = { schemaVersion: 1, referenceId: id, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl,
        sourcePageContentHash: digest(html), pageRetrievedAt: new Date().toISOString(), imageUrl: input.imageUrl, imageFinalUrl: input.imageUrl,
        retrievedAt: new Date().toISOString(), title: input.title, titleSource: 'caller', publisher: input.publisher, publisherSource: 'caller',
        sourceClass: input.sourceClass, sourceClassVerification: 'unverified', subject: input.subject, version: input.version,
        contentHash: digest(png), bytes: png.length, width: 1, height: 1, mimeType: 'image/png', localPath: join(root, 'reference.png'),
        sourcePagePath: join(root, 'source.html'), metadataPath: join(root, 'reference.json'),
        imageLinkEvidence: 'caller_supplied_observed_url', sourceRelationship: 'unverified', visualInspection: 'unverified', identityVerification: 'unverified', usageRights: 'unverified' };
      await writeFile(result.localPath, png); await writeFile(result.sourcePagePath, html);
      await writeFile(result.metadataPath, JSON.stringify(result));
      return result;
    },
    async invoke(task) {
      calls.push(task);
      const custom = await hooks.invoke?.(task);
      if (custom !== undefined) return custom;
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/page`,
        imageUrl: `https://example.com/${task.input.brandId}/source.png`, subject: `${task.input.brandId} official element`, version: 'Release 1',
        publisher: 'Fixture official', title: 'Fixture published artwork', sourceClass: 'official', purpose: 'Identity outline and structure' }], limitations: [] };
      if (task.purpose === 'reference-selection') return { candidateIds: task.input.candidates.slice(0, task.input.limit).map(item => item.candidateId), rationale: 'Fixture selects observed candidates for actual inspection.' };
      if (task.purpose === 'reference-inspection') {
        assert.equal(task.images.length, 1);
        assert.equal(digest(await readFile(task.images[0].path)), task.images[0].hash);
        assert.match(task.input.sourcePageExcerpt, /html/);
        return { status: 'verified', sourceClass: 'official', sourceRelationship: 'verified', identityVerified: true, targetMatch: 'matched', assetType: 'character',
          subject: task.input.reference.subject, version: 'Release 1', evidence: 'Fixture visual comparison opened the exact original and matched its official page.',
          limitations: [], imageHash: task.input.imageHash, sourcePageHash: task.input.sourcePageHash };
      }
      if (task.purpose === 'reference-binding') {
        const identity = task.input.references.find(ref => ref.brandId === 'b');
        return { bindings: items.map(material => ({ materialId: material.id, referenceIds: identity ? [identity.referenceId] : [], referenceTasks: material.referenceTasks ?? [],
          identityTargets: [{ subject: 'Fixture character', assetType: 'character', referenceIds: identity ? [identity.referenceId] : [] }],
          identityRequired: true, identityReferenceIds: identity ? [identity.referenceId] : [], identityRequirements: ['Official element outline'],
          rationale: 'Each material carries the verified original identity.', status: 'ready', reason: '' })), limitations: [] };
      }
      if (task.purpose === 'image-review') {
        assert.equal(digest(await readFile(task.images.at(-1).path)), task.input.outputHash);
        return { status: 'approved', outputHash: task.input.outputHash, inspectedReferenceHashes: task.input.referenceHashes,
          evidence: 'Fixture actual source and generated result comparison confirms the visible identity and design.', limitations: [] };
      }
      throw new Error('unexpected fixture task');
    },
    imageProvider: { async generate(input) {
      generated.push(input);
      await hooks.generate?.(input);
      const path = join(directory, `${digest(input.prompt)}-${randomUUID()}.png`);
      await writeFile(path, png);
      return { assetId: input.prompt, contentHash: digest(png), path, generationStatus: 'succeeded', reviewStatus: 'unverified',
        providerRequestId: input.prompt, providerResponseId: input.prompt, requestId: `request-${input.prompt}`, model: 'fixture-image', responsesModel: 'fixture-text',
        mimeType: 'image/png', metadataPath: `${path}.json`, createdAt: new Date().toISOString(),
        referenceInputs: (input.references ?? []).map(value => { const bytes = Buffer.from(value.split(',')[1], 'base64'); return { contentHash: digest(bytes), mimeType: 'image/png', bytes: bytes.length }; }) };
    } },
    onChange(state) { changes.push(state); },
  };
  const pipeline = new AutomaticMediaPipeline(options);
  const prepare = async () => { await pipeline.discover({ brands }); return pipeline.prepare({ plan, visuals }); };
  return { pipeline, options, prepare, directory, calls, generated, changes, collected, plan, visuals };
}

test('automatic pipeline discovers in parallel, fills four image slots, refills during review, and gates dependent references', { timeout: 10000 }, async t => {
  const ids = ['core', 'a', 'b', 'c', 'd', 'e', 'dependent'];
  const starts = new Map(ids.map(id => [id, deferred()])), gates = new Map(ids.map(id => [id, deferred()]));
  const reviewCore = deferred(), coreReviewStarted = deferred();
  const discoveryGates = new Map(['initial', 'supplemental'].map(phase => [phase, deferred()]));
  const discoveryStarts = new Map(['initial', 'supplemental'].map(phase => [phase, 0]));
  let active = 0, peak = 0, discoveryActive = 0, discoveryPeak = 0;
  const f = await fixture(t, [...ids.map(id => item(id, id === 'core' ? { priority: 'core' } : id === 'dependent' ? { dependencies: ['core'], referenceTasks: ['core'] } : {})), item('optional', { priority: 'optional' })], {
    async generate(input) { active += 1; peak = Math.max(peak, active); starts.get(input.prompt).resolve(input); await gates.get(input.prompt).promise; active -= 1; },
    async invoke(task) {
      if (task.purpose === 'reference-discovery') {
        discoveryActive += 1; discoveryPeak = Math.max(discoveryPeak, discoveryActive);
        const phase = task.input.materialPlan ? 'supplemental' : 'initial';
        discoveryStarts.set(phase, discoveryStarts.get(phase) + 1);
        if (discoveryStarts.get(phase) === 2) discoveryGates.get(phase).resolve();
        await discoveryGates.get(phase).promise;
        discoveryActive -= 1;
      }
      if (task.purpose === 'image-review' && task.input.material.id === 'core') { coreReviewStarted.resolve(); await reviewCore.promise; }
    },
  });
  const prepared = await f.prepare();
  assert.equal(discoveryPeak, 2);
  assert.equal(f.collected.length, 2, 'supplemental search reuses already registered URLs');
  assert.equal(prepared.references.length, 2);
  assert.equal(prepared.materials.at(-1).status, 'out_of_scope');
  const work = f.pipeline.execute();
  await Promise.all(['core', 'a', 'b', 'c'].map(id => starts.get(id).promise));
  gates.get('core').resolve();
  await Promise.all([coreReviewStarted.promise, starts.get('d').promise]);
  assert.equal(f.generated.some(request => request.prompt === 'dependent'), false, 'shared output must pass an actual inspection first');
  for (const [id, gate] of gates) if (id !== 'dependent') gate.resolve();
  await starts.get('e').promise;
  reviewCore.resolve();
  const dependentInput = await starts.get('dependent').promise;
  assert.equal(dependentInput.references.length, 2, 'original official reference remains attached alongside shared generated output');
  gates.get('dependent').resolve();
  const result = await work;
  assert.equal(peak, 4);
  assert.equal(result.phase, 'completed');
  assert.equal(result.materials.filter(item => item.status === 'approved').length, 7);
  assert.equal(f.generated.length, 7);
  const dependent = result.materials.find(item => item.materialId === 'dependent');
  assert.equal(dependent.attachments.length, 2);
  assert.equal(dependent.attachments[1].taskId, 'core');
  assert.equal(dependent.submittedReferences.length, 2);
  assert.equal(dependent.review.outputHash, dependent.outputHash);
  assert.ok(f.changes.some(state => state.materials.some(item => item.imageUrl) && state.materials.some(item => item.status === 'running')));
  assert.doesNotMatch(JSON.stringify(result), /"(?:path|localPath|metadataPath|sourcePagePath)"|data:image|base64/);
  const restored = new AutomaticMediaPipeline(f.options); await restored.init();
  assert.deepEqual(restored.snapshot(), result);
  await restored.execute();
  assert.equal(f.generated.length, 7, 'successful images and reviews survive resume without new paid requests');
  assert.equal((await restored.materialFile('dependent')).contentHash, dependent.outputHash);
  assert.equal(await restored.materialFile('not-a-material'), undefined);
});

test('explicit failed-material retry preserves frozen preparation and attempts, reuses success and waits for the new core image review', async t => {
  let failCore = true;
  const f = await fixture(t, [item('core', { priority: 'core' }), item('dependent', { dependencies: ['core'], referenceTasks: ['core'] }), item('independent')], {
    generate(input) { if (input.prompt === 'core' && failCore) throw new ImageProviderError('image_upstream_http_400', 'failed', 'failed-original-core'); },
  });
  await f.prepare(); const first = await f.pipeline.execute();
  assert.equal(first.materials.find(item => item.materialId === 'core').status, 'failed');
  assert.equal(first.materials.find(item => item.materialId === 'dependent').status, 'blocked');
  const independent = first.materials.find(item => item.materialId === 'independent');
  assert.equal(independent.status, 'approved');
  const before = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const manifest = await readFile(join(f.directory, 'material-jobs.json'), 'utf8');
  const modelCallsBefore = f.calls.length, imagesBefore = f.generated.length;
  const evidence = 'The core request is confirmed terminal HTTP 400 with no output; explicitly allow one retry of that material.';
  const ready = await f.pipeline.retryFailedMaterials({ materialIds: ['core'], evidence });
  assert.equal(ready.phase, 'prepared');
  assert.equal(ready.materials.find(item => item.materialId === 'core').status, 'ready');
  assert.equal(ready.materials.find(item => item.materialId === 'core').requestId, undefined, 'old request identity remains in history, not the new pending attempt');
  assert.deepEqual(ready.materials.find(item => item.materialId === 'independent'), independent);
  assert.equal(f.generated.length, imagesBefore); assert.equal(f.calls.length, modelCallsBefore, 'authorization alone dispatches no media or model work');
  const pending = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.equal(pending.preparationHash, before.preparationHash); assert.equal(pending.manifestHash, before.manifestHash);
  assert.deepEqual(pending.preparation, before.preparation);
  assert.equal(await readFile(join(f.directory, 'material-jobs.json'), 'utf8'), manifest);
  assert.equal(pending.batch.tasks.core.retryHistory[0].record.requestId, 'failed-original-core');
  assert.equal(pending.batch.tasks.core.retryHistory[0].record.error, 'image_upstream_http_400');
  assert.equal(pending.batch.tasks.core.retryHistory[0].evidence, evidence);
  failCore = false;
  const restored = new AutomaticMediaPipeline(f.options); await restored.init();
  const done = await restored.execute();
  assert.equal(done.phase, 'completed');
  assert.equal(f.generated.filter(input => input.prompt === 'core').length, 2);
  assert.equal(f.generated.filter(input => input.prompt === 'independent').length, 1);
  assert.equal(f.generated.filter(input => input.prompt === 'dependent').length, 1);
  assert.deepEqual(f.generated.filter(input => input.prompt === 'core')[0], f.generated.filter(input => input.prompt === 'core')[1]);
  assert.ok(f.calls.slice(modelCallsBefore).every(call => call.purpose === 'image-review'), 'frozen discovery and bindings are reused');
  const core = done.materials.find(item => item.materialId === 'core');
  assert.equal(core.requestId, 'request-core'); assert.equal(core.review.outputHash, core.outputHash);
  await assert.rejects(restored.retryFailedMaterials({ materialIds: ['core'], evidence }), /requires_failed_without_asset/);
  const final = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.deepEqual(final.batch.tasks.core.retryHistory, pending.batch.tasks.core.retryHistory);
});

test('failed-material retry rejects an executing pipeline and frozen manifest changes without changing the original batch', async t => {
  const entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  const f = await fixture(t, [item('core')], { async generate() { entered.resolve(); await release.promise; throw new ImageProviderError('image_upstream_http_400', 'failed', 'failed-core'); } });
  await f.prepare();
  const executing = f.pipeline.execute(); await entered.promise;
  const retry = { materialIds: ['core'], evidence: 'Explicitly authorize one new attempt only after the prior request has ended.' };
  await assert.rejects(f.pipeline.retryFailedMaterials(retry), /media_retry_requires_idle/);
  release.resolve(); await executing;
  const statePath = join(f.directory, 'batch-state.json'), before = await readFile(statePath, 'utf8');
  const manifestPath = join(f.directory, 'material-jobs.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.tasks[0].prompt = 'Changed design must require a new revision';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(f.pipeline.retryFailedMaterials(retry), /media_frozen_mapping_changed/);
  assert.equal(await readFile(statePath, 'utf8'), before);
  assert.equal(f.generated.length, 1);
});

test('single inspected-output correction preserves the design and history, edits only the named image, and reviews the actual correction before dependencies', async t => {
  let rejectCore = true;
  const f = await fixture(t, [item('core', { priority: 'core' }), item('dependent', { dependencies: ['core'], referenceTasks: ['core'] }), item('independent')], {
    invoke(task) {
      if (task.purpose === 'image-review' && task.input.material.id === 'core' && rejectCore) return { status: 'needs_revision',
        outputHash: task.input.outputHash, inspectedReferenceHashes: task.input.referenceHashes,
        evidence: 'The actual output has a thin wordmark and solid oversized ears that conflict with the supplied original.', limitations: [] };
    },
  });
  await f.prepare(); const first = await f.pipeline.execute();
  assert.equal(first.materials.find(item => item.materialId === 'core').status, 'needs_revision');
  assert.equal(first.materials.find(item => item.materialId === 'dependent').status, 'waiting_review');
  const before = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const manifestBefore = JSON.parse(await readFile(join(f.directory, 'material-jobs.json'), 'utf8'));
  const oldRecord = structuredClone(before.batch.tasks.core), oldBytes = await readFile(oldRecord.asset.path);
  const callCount = f.calls.length, imageCount = f.generated.length;
  const correction = { materialId: 'core', instruction: 'Restore the exact official wordmark weight and the original small open ear structure, preserving every other design requirement.',
    evidence: 'An actual view of the first output confirms the incorrect wordmark weight and oversized filled ears.' };
  const ready = await f.pipeline.correctMaterial(correction);
  assert.equal(ready.phase, 'prepared'); assert.equal(ready.materials.find(item => item.materialId === 'core').status, 'ready');
  assert.equal(ready.materials.find(item => item.materialId === 'core').imageUrl, undefined);
  assert.equal(f.calls.length, callCount); assert.equal(f.generated.length, imageCount, 'registration alone does not dispatch work');
  const pending = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const manifestAfter = JSON.parse(await readFile(join(f.directory, 'material-jobs.json'), 'utf8'));
  assert.equal(pending.preparationHash, before.preparationHash); assert.deepEqual(pending.preparation, before.preparation);
  assert.deepEqual(pending.references, before.references); assert.deepEqual(ready.materials.map(item => item.binding), first.materials.map(item => item.binding));
  assert.deepEqual(manifestAfter.tasks.slice(1), manifestBefore.tasks.slice(1));
  assert.deepEqual(pending.batch.tasks.independent, before.batch.tasks.independent);
  assert.deepEqual(pending.batch.tasks.dependent, before.batch.tasks.dependent);
  const history = pending.batch.tasks.core.correctionHistory[0];
  assert.deepEqual(history.record, oldRecord); assert.equal(history.originalManifestFileHash, digest(history.originalManifest));
  assert.equal(history.instruction, correction.instruction); assert.equal(history.editReference.contentHash, oldRecord.asset.contentHash);
  assert.deepEqual(await readFile(oldRecord.asset.path), oldBytes);
  assert.equal(manifestAfter.tasks[0].references.at(-1), oldRecord.asset.path);
  assert.ok(manifestAfter.tasks[0].prompt.startsWith(manifestBefore.tasks[0].prompt)); assert.ok(manifestAfter.tasks[0].prompt.includes(correction.instruction));
  assert.equal(pending.batch.tasks.core.attempt, (oldRecord.attempt ?? 1) + 1);
  const restored = new AutomaticMediaPipeline(f.options); await restored.init();
  await restored.prepare({ plan: f.plan, visuals: f.visuals });
  assert.equal(f.calls.length, callCount, 'frozen preparation does not rediscover or rebind the corrected output');
  rejectCore = false;
  const done = await restored.execute(); assert.equal(done.phase, 'completed');
  assert.equal(f.generated.filter(input => input.prompt === 'core').length, 1);
  assert.equal(f.generated.filter(input => input.prompt.includes(correction.instruction)).length, 1);
  assert.equal(f.generated.filter(input => input.prompt === 'independent').length, 1);
  assert.equal(f.generated.filter(input => input.prompt === 'dependent').length, 1);
  const review = f.calls.slice(callCount).find(task => task.purpose === 'image-review' && task.input.material.id === 'core');
  assert.equal(review.input.visual.prompt, 'core'); assert.equal(review.input.actualSubmittedPrompt, manifestAfter.tasks[0].prompt);
  assert.equal(review.input.qualityCorrections[0].instruction, correction.instruction);
  assert.deepEqual(review.input.qualityCorrections[0].originalReview, oldRecord.review);
  assert.match(review.images.at(-2).label, /旧生成图.*不是官方身份/);
  assert.ok(review.input.referenceHashes.includes(history.editReference.contentHash));
  const final = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.deepEqual(final.batch.tasks.core.correctionHistory, pending.batch.tasks.core.correctionHistory);
  assert.deepEqual(await readFile(oldRecord.asset.path), oldBytes);
  await assert.rejects(restored.correctMaterial(correction), /media_correction_requires_inspected_output/);
});

test('quality correction rejects a corrupt inspected output without mutating the manifest and remains limited after another failed review', async t => {
  const f = await fixture(t, [item('core')], { invoke(task) {
    if (task.purpose === 'image-review') return { status: 'needs_revision', outputHash: task.input.outputHash,
      inspectedReferenceHashes: task.input.referenceHashes, evidence: 'The visible output still fails the official identity outline requirement.', limitations: [] };
  } });
  await f.prepare(); await f.pipeline.execute();
  const saved = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const stateBefore = await readFile(join(f.directory, 'batch-state.json'), 'utf8');
  const manifestBefore = await readFile(join(f.directory, 'material-jobs.json'), 'utf8');
  const correction = { materialId: 'core', instruction: 'Use the original reference outline exactly, retaining the established design.', evidence: 'Actual image review found a visible outline deviation from the attached source.' };
  await writeFile(saved.batch.tasks.core.asset.path, 'tampered');
  await assert.rejects(f.pipeline.correctMaterial(correction), /saved_asset_changed/);
  assert.equal(await readFile(join(f.directory, 'batch-state.json'), 'utf8'), stateBefore);
  assert.equal(await readFile(join(f.directory, 'material-jobs.json'), 'utf8'), manifestBefore);
  await writeFile(saved.batch.tasks.core.asset.path, png);
  await f.pipeline.correctMaterial(correction); await f.pipeline.execute();
  assert.equal(f.pipeline.snapshot().materials[0].status, 'needs_revision');
  await assert.rejects(f.pipeline.correctMaterial(correction), /correction_limit_reached/);
  assert.equal(f.generated.length, 2);
});

test('local official-source postprocessing keeps paid history and frozen design, then reviews exact new bytes without generating that material again', async t => {
  let rejectCore = true;
  const f = await fixture(t, [item('core'), item('dependent', { dependencies: ['core'], referenceTasks: ['core'] })], { invoke(task) {
    if (task.purpose === 'image-review' && task.input.material.id === 'core' && rejectCore) return { status: 'needs_revision', outputHash: task.input.outputHash,
      inspectedReferenceHashes: task.input.referenceHashes, evidence: 'Actual original comparison finds an incorrect brand wordmark on this image.', limitations: [] };
  } });
  await f.prepare(); await f.pipeline.execute();
  const before = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const original = structuredClone(before.batch.tasks.core), source = before.state.references.find(item => item.brandId === 'b');
  const staging = join(f.directory, 'postprocess-staging'); await mkdir(staging);
  const outputPath = join(staging, 'fixture.png');
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#0033ff' } }).png().toBuffer();
  await writeFile(outputPath, bytes);
  const input = { materialId: 'core', expectedOutputHash: original.asset.contentHash, sourceReferenceId: source.referenceId,
    outputPath, processing: { tool: 'fixture-compositor', parameters: { officialLogoOverlay: { x: 0, y: 0 } } }, evidence: 'A fixture local compositor applied the registered official wordmark without another generated request.' };
  const callCount = f.calls.length, generated = f.generated.length;
  const pending = await f.pipeline.registerPostprocess(input);
  assert.equal(pending.materials[0].status, 'succeeded'); assert.equal(pending.materials[0].outputHash, digest(bytes));
  assert.equal(pending.materials[0].requestId, undefined); assert.equal(pending.materials[0].model, undefined);
  assert.equal(pending.materials[0].review, undefined); assert.equal(f.calls.length, callCount); assert.equal(f.generated.length, generated);
  const saved = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.deepEqual(saved.preparation, before.preparation); assert.equal(saved.preparationHash, before.preparationHash); assert.equal(saved.manifestHash, before.manifestHash);
  assert.deepEqual(saved.batch.tasks.dependent, before.batch.tasks.dependent);
  const current = saved.batch.tasks.core;
  assert.equal(current.asset.kind, 'local-postprocess'); assert.equal(current.asset.generationStatus, 'postprocessed');
  assert.equal(current.asset.requestId, undefined); assert.equal(current.asset.model, undefined); assert.equal(current.attempt, original.attempt);
  assert.deepEqual(current.postprocessHistory[0].record, original); assert.equal(current.postprocessHistory[0].source.contentHash, source.contentHash);
  assert.equal(current.postprocessHistory[0].outputHash, digest(bytes)); assert.deepEqual(await readFile(current.asset.path), bytes);
  assert.deepEqual(JSON.parse(await readFile(current.asset.metadataPath, 'utf8')), current.asset);
  const restored = new AutomaticMediaPipeline(f.options); await restored.init(); rejectCore = false;
  const done = await restored.execute(); assert.equal(done.phase, 'completed');
  assert.equal(f.generated.filter(input => input.prompt === 'core').length, 1); assert.equal(f.generated.filter(input => input.prompt === 'dependent').length, 1);
  const review = f.calls.slice(callCount).find(task => task.purpose === 'image-review' && task.input.material.id === 'core');
  assert.equal(review.input.productionMethod, 'local-postprocess'); assert.equal(review.input.outputHash, digest(bytes));
  assert.equal(review.input.postprocessing[0].sourceHash, source.contentHash); assert.deepEqual(review.input.postprocessing[0].processing, input.processing);
  assert.deepEqual(review.input.actualSubmittedReferences, []); assert.deepEqual(await readFile(original.asset.path), png);
  await assert.rejects(restored.registerPostprocess(input), /requires_rejected_output/);
});

test('postprocess registration rejects unbound identity, escaped or linked paths, wrong size and changed source before publishing an asset', async t => {
  const f = await fixture(t, [item('core')], { invoke(task) {
    if (task.purpose === 'image-review') return { status: 'needs_revision', outputHash: task.input.outputHash,
      inspectedReferenceHashes: task.input.referenceHashes, evidence: 'The actual wordmark needs an exact original-source replacement.', limitations: [] };
  } });
  await f.prepare(); await f.pipeline.execute();
  const before = await readFile(join(f.directory, 'batch-state.json'), 'utf8');
  const saved = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const source = saved.references.find(item => saved.state.references.find(value => value.referenceId === item.referenceId)?.brandId === 'b');
  const staging = join(f.directory, 'postprocess-staging'); await mkdir(staging);
  const path = join(staging, 'candidate.png'), changed = await sharp({ create: { width: 2, height: 1, channels: 4, background: '#0033ff' } }).png().toBuffer();
  await writeFile(path, changed);
  const input = { materialId: 'core', expectedOutputHash: saved.batch.tasks.core.asset.contentHash, sourceReferenceId: source.referenceId, outputPath: path,
    processing: { tool: 'fixture', parameters: { x: 0 } }, evidence: 'Fixture explicit official original replacement is awaiting validation.' };
  await assert.rejects(f.pipeline.registerPostprocess({ ...input, sourceReferenceId: 'unbound-source' }), /official_identity_required/);
  await assert.rejects(f.pipeline.registerPostprocess({ ...input, outputPath: source.localPath }), /outside_staging/);
  const linked = join(staging, 'linked.png'); await symlink(path, linked);
  await assert.rejects(f.pipeline.registerPostprocess({ ...input, outputPath: linked }), /symlink_rejected/);
  await assert.rejects(f.pipeline.registerPostprocess(input), /output_mismatch/);
  await writeFile(source.localPath, changed);
  await assert.rejects(f.pipeline.registerPostprocess(input), /source_changed/);
  assert.equal(await readFile(join(f.directory, 'batch-state.json'), 'utf8'), before); assert.equal(f.generated.length, 1);
});

test('plan prefetch joins initial discovery and overlaps final prompt preparation without duplicate supplementation', async t => {
  const initialStarted = deferred(), releaseInitial = deferred(), supplementalStarted = deferred(), releaseSupplemental = deferred();
  let initialCount = 0, supplementalCount = 0;
  const f = await fixture(t, [item('core')], {
    async invoke(task) {
      if (task.purpose !== 'reference-discovery') return;
      if (task.input.materialPlan) {
        supplementalCount += 1; if (supplementalCount === 2) supplementalStarted.resolve();
        await releaseSupplemental.promise;
      } else {
        initialCount += 1; if (initialCount === 2) initialStarted.resolve();
        await releaseInitial.promise;
      }
    },
  });
  const discovery = f.pipeline.discover({ brands });
  await initialStarted.promise;
  const prefetch = f.pipeline.prefetchPlanReferences({ plan: f.plan, context: 'Unified design, before copy and prompts' });
  await new Promise(done => setImmediate(done));
  assert.equal(supplementalCount, 0, 'plan-specific search waits for actual initial references');
  releaseInitial.resolve();
  await supplementalStarted.promise;
  await discovery;
  const savedEarly = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.deepEqual(savedEarly.supplementaryInput.plan, f.plan);
  assert.equal(savedEarly.preparationHash, undefined);
  assert.equal(savedEarly.preparation, undefined);
  assert.deepEqual(savedEarly.state.materials, []);
  await assert.rejects(f.pipeline.execute(), /media_prepare_required/);
  const finalVisuals = [{ materialId: 'core', prompt: 'Final prompt, written while reference search is running' }];
  const preparing = f.pipeline.prepare({ plan: f.plan, visuals: finalVisuals });
  const joinedPrefetch = f.pipeline.prefetchPlanReferences({ plan: f.plan, context: 'Later same-plan context' });
  await new Promise(done => setImmediate(done));
  assert.equal(supplementalCount, 2);
  assert.equal(f.calls.filter(call => call.purpose === 'reference-binding').length, 0);
  assert.equal(f.generated.length, 0);
  releaseSupplemental.resolve();
  const [, , prepared] = await Promise.all([prefetch, joinedPrefetch, preparing]);
  assert.equal(supplementalCount, 2, 'prepare and repeated prefetch reuse the same two brand calls');
  assert.equal(f.calls.filter(call => call.purpose === 'reference-binding').length, 1);
  assert.deepEqual(f.calls.find(call => call.purpose === 'reference-binding').input.materialVisuals, finalVisuals);
  assert.equal(prepared.materials[0].status, 'ready');
  assert.equal(f.generated.length, 0, 'reference prefetch and binding never generate an image');
  const restored = new AutomaticMediaPipeline(f.options);
  await restored.prefetchPlanReferences({ plan: f.plan });
  await restored.prepare({ plan: f.plan, visuals: finalVisuals });
  assert.equal(supplementalCount, 2, 'completed plan prefetch survives restart');
  assert.equal(f.calls.filter(call => call.purpose === 'reference-binding').length, 1);
});

test('different plans cannot join in-flight reference prefetch or mutate its saved design', async t => {
  const started = deferred(), release = deferred(); let supplementalCount = 0;
  const f = await fixture(t, [item('core')], {
    async invoke(task) {
      if (task.purpose === 'reference-discovery' && task.input.materialPlan) {
        supplementalCount += 1; if (supplementalCount === 2) started.resolve();
        await release.promise;
      }
    },
  });
  await f.pipeline.discover({ brands });
  const work = f.pipeline.prefetchPlanReferences({ plan: f.plan });
  await started.promise;
  const changed = structuredClone(f.plan); changed.items[0].design = 'Changed identity and design';
  await assert.rejects(f.pipeline.prefetchPlanReferences({ plan: changed }), /media_plan_changed_use_new_revision/);
  await assert.rejects(f.pipeline.prepare({ plan: changed, visuals: f.visuals }), /media_plan_changed_use_new_revision/);
  assert.equal(supplementalCount, 2);
  const pending = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.deepEqual(pending.supplementaryInput.plan, f.plan);
  assert.equal(pending.preparationHash, undefined);
  assert.equal(f.calls.some(call => call.purpose === 'reference-binding'), false);
  release.resolve(); await work;
  const restored = new AutomaticMediaPipeline(f.options);
  await assert.rejects(restored.prefetchPlanReferences({ plan: changed }), /media_plan_changed_use_new_revision/);
  assert.equal(f.generated.length, 0);
});

test('paused plan prefetch resumes inspection of downloaded originals without duplicate downloads', async t => {
  const inspectionStarted = deferred(), releaseInspection = deferred();
  const controller = new AbortController(); let initialInspectionAttempts = 0, planInspectionAttempts = 0;
  const f = await fixture(t, [item('core')], {
    async invoke(task) {
      if (task.purpose === 'reference-discovery' && task.input.materialPlan) return {
        candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/plan-page`,
          imageUrl: `https://example.com/${task.input.brandId}/plan-source.png`, subject: 'Plan-specific identity', version: 'Plan release',
          publisher: 'Fixture official', title: 'Plan original', sourceClass: 'official', purpose: 'Current design identity' }], limitations: [],
      };
      if (task.purpose === 'reference-inspection') {
        if (task.input.reference.version !== 'Plan release') { initialInspectionAttempts += 1; return; }
        planInspectionAttempts += 1;
        if (task.signal === controller.signal) {
          if (planInspectionAttempts === 2) inspectionStarted.resolve();
          await releaseInspection.promise;
          task.signal.throwIfAborted();
        }
      }
    },
  });
  await f.pipeline.discover({ brands });
  const work = f.pipeline.prefetchPlanReferences({ plan: f.plan }, controller.signal);
  await inspectionStarted.promise;
  controller.abort('user_pause'); releaseInspection.resolve();
  const paused = await work;
  assert.equal(paused.phase, 'paused');
  assert.equal(f.collected.length, 4);
  assert.equal(paused.references.filter(reference => reference.version === 'Plan release').every(reference => !reference.inspection), true);
  const savedPaused = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.equal(savedPaused.supplementaryCompleted, undefined);
  assert.equal(savedPaused.preparationHash, undefined);
  const restored = new AutomaticMediaPipeline(f.options);
  const resumed = await restored.prefetchPlanReferences({ plan: f.plan });
  assert.equal(f.collected.length, 4, 'registered source/page pairs are never downloaded again');
  assert.equal(initialInspectionAttempts, 2, 'completed original inspections are reused');
  assert.equal(planInspectionAttempts, 4, 'the two interrupted inspections are actually retried');
  assert.ok(resumed.references.every(reference => reference.inspection?.identityVerified));
  await restored.prepare({ plan: f.plan, visuals: f.visuals });
  assert.equal(planInspectionAttempts, 4);
  assert.equal(f.generated.length, 0);
});

test('a visually similar image with no actual source-page link cannot become official identity evidence', async t => {
  const f = await fixture(t, [item('identity')], { noImageLink: true });
  const prepared = await f.prepare();
  assert.ok(prepared.references.every(ref => ref.inspection.identityVerified === false));
  assert.equal(prepared.materials[0].status, 'blocked');
  assert.match(prepared.materials[0].reason, /原始来源/);
  const result = await f.pipeline.execute();
  assert.equal(result.phase, 'partial'); assert.equal(f.generated.length, 0);
});

test('empty real sources block exact identities while an explicitly original independent item still completes', async t => {
  const f = await fixture(t, [item('identity'), item('original')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [], limitations: ['Fixture has no observed source.'] };
      if (task.purpose === 'reference-binding') return { bindings: ['identity', 'original'].map(id => ({ materialId: id, referenceIds: [], referenceTasks: [],
        identityTargets: id === 'identity' ? [{ subject: 'Missing character', assetType: 'character', referenceIds: [] }] : [], identityRequired: id === 'identity', identityReferenceIds: [], identityRequirements: id === 'identity' ? ['Official element'] : [],
        rationale: id === 'original' ? 'An explicitly original geometric scene without branded identifiers.' : 'Requires actual official identity.', status: 'ready', reason: '' })), limitations: [] };
    },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(result.materials[0].status, 'blocked'); assert.equal(result.materials[1].status, 'approved');
  assert.deepEqual(f.generated.map(request => request.prompt), ['original']);
  assert.equal(result.phase, 'partial');
});

test('pause stops new dispatch, saves all already submitted results, and resumes without repeating them', async t => {
  const startedFour = deferred(), release = deferred(); let count = 0;
  const controller = new AbortController();
  const f = await fixture(t, Array.from({ length: 6 }, (_, index) => item(`item-${index}`)), {
    async generate() { count += 1; if (count === 4) startedFour.resolve(); await release.promise; },
  });
  await f.prepare(); const work = f.pipeline.execute(controller.signal);
  await startedFour.promise; controller.abort(); release.resolve();
  const paused = await work;
  assert.equal(paused.phase, 'paused'); assert.equal(f.generated.length, 4);
  assert.equal(paused.materials.filter(item => item.imageUrl).length, 4, 'in-flight image results are preserved after pause');
  const restored = new AutomaticMediaPipeline(f.options); await restored.init();
  const resumed = await restored.execute();
  assert.equal(resumed.phase, 'completed'); assert.equal(f.generated.length, 6);
  assert.equal(new Set(f.generated.map(request => request.prompt)).size, 6);
});

test('unknown paid outcomes remain reserved and cannot be automatically resubmitted after restart', async t => {
  const f = await fixture(t, Array.from({ length: 6 }, (_, index) => item(`item-${index}`)), {
    generate(input) { throw new ImageProviderError('image_upstream_timeout', 'unknown', `request-${input.prompt}`); },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(f.generated.length, 4); assert.equal(result.phase, 'partial');
  assert.equal(result.materials.filter(item => item.status === 'unknown').length, 4);
  assert.equal(result.materials.filter(item => item.status === 'waiting_capacity').length, 2);
  const restored = new AutomaticMediaPipeline(f.options); await restored.execute();
  assert.equal(f.generated.length, 4);
});

test('a rejected shared output stays visible and keeps its dependent generation waiting', async t => {
  const f = await fixture(t, [item('core'), item('child', { dependencies: ['core'], referenceTasks: ['core'] })], {
    invoke(task) {
      if (task.purpose === 'image-review') return { status: 'needs_revision', outputHash: task.input.outputHash,
        inspectedReferenceHashes: task.input.referenceHashes, evidence: 'The actual element outline differs visibly from the attached original fixture.', limitations: [] };
    },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(result.materials[0].status, 'needs_revision'); assert.ok(result.materials[0].imageUrl);
  assert.equal(result.materials[1].status, 'waiting_review'); assert.equal(f.generated.length, 1);
  await f.pipeline.execute(); assert.equal(f.generated.length, 1, 'needs-revision never triggers automatic paid regeneration');
});

test('review must return the exact output and inspected attachment hashes', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'image-review') return { status: 'approved', outputHash: '0'.repeat(64),
        inspectedReferenceHashes: [], evidence: 'A false fixture review that did not inspect the actual attachments.', limitations: [] };
    },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(result.phase, 'partial'); assert.equal(result.materials[0].status, 'succeeded');
  assert.equal(result.materials[0].review, undefined);
  assert.equal(result.materials[0].reason, 'image_batch_review_unavailable');
});

test('changed frozen reference bytes stop generation and changed prepared designs require a new revision', async t => {
  const f = await fixture(t, [item('core')]);
  const prepared = await f.prepare();
  const source = await f.pipeline.referenceFile(prepared.references.find(ref => ref.brandId === 'b').referenceId);
  await writeFile(source.path, Buffer.concat([png, Buffer.from('changed')]));
  const result = await f.pipeline.execute();
  assert.equal(result.phase, 'partial'); assert.equal(f.generated.length, 0);
  await assert.rejects(f.pipeline.referenceFile(prepared.references.find(ref => ref.brandId === 'b').referenceId), /media_registered_file_changed/);
  await assert.rejects(f.pipeline.prepare({ plan: f.plan, visuals: [{ materialId: 'core', prompt: 'Different revision' }] }), /media_plan_changed_use_new_revision/);
});

test('binding coverage failures prevent all paid work, and unselected dependencies are not silently added', async t => {
  const f = await fixture(t, [item('one'), item('two')], {
    invoke(task) { if (task.purpose === 'reference-binding') return { bindings: [], limitations: [] }; },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.ok(result.materials.every(item => item.status === 'blocked')); assert.equal(f.generated.length, 0);
  const dependency = await fixture(t, [item('optional-core', { priority: 'optional' }), item('child', { dependencies: ['optional-core'], referenceTasks: ['optional-core'] })]);
  const state = await dependency.prepare();
  assert.equal(state.materials[0].status, 'out_of_scope'); assert.equal(state.materials[1].status, 'blocked');
  await dependency.pipeline.execute(); assert.equal(dependency.generated.length, 0);
});

test('explicit selection can include optional items; unconfigured image capability remains accurately partial', async t => {
  const f = await fixture(t, [item('optional', { priority: 'optional' })]);
  await f.pipeline.discover({ brands });
  await f.pipeline.prepare({ plan: f.plan, visuals: f.visuals, selectedMaterialIds: ['optional'] });
  const result = await f.pipeline.execute(); assert.equal(result.phase, 'completed'); assert.equal(f.generated.length, 1);
  const noImages = await fixture(t, [item('core')]);
  const pipeline = new AutomaticMediaPipeline({ ...noImages.options, imageProvider: undefined });
  await pipeline.discover({ brands }); await pipeline.prepare({ plan: noImages.plan, visuals: noImages.visuals });
  const partial = await pipeline.execute(); assert.equal(partial.phase, 'partial'); assert.equal(noImages.generated.length, 0);
  assert.ok(partial.limitations.some(item => item.includes('未配置')));
});

test('source-page-only discovery uses real host-extracted candidates and visually verifies them without guessing URLs or exceeding the existing budget', async t => {
  const pageCalls = [];
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/page`, imageUrl: '',
        subject: 'Requested fixture character costume', version: 'Release 1', title: 'Observed official page', publisher: 'Official fixture', sourceClass: 'official', purpose: 'Exact costume identity' }], limitations: ['CLI fetch unavailable; host should read the observed page.'] };
    },
    async discoverPage(input) {
      pageCalls.push(input);
      return { schemaVersion: 1, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl, sourcePageContentHash: 'a'.repeat(64),
        pageRetrievedAt: new Date().toISOString(), sourcePagePath: '/fixture-only/source.html', metadataPath: '/fixture-only/discovery.json',
        title: 'Observed fixture page', publisher: 'Official fixture', excerpt: '<img src="actual.png">',
        candidates: Array.from({ length: 3 }, (_, index) => ({ imageUrl: `${input.sourcePageUrl}/observed-${index}.png`, source: 'img', label: 'Observed artwork', observedTag: '<img>' })) };
    },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(result.phase, 'completed'); assert.equal(pageCalls.length, 2, 'supplemental search reuses the already downloaded source page');
  assert.equal(f.collected.length, 6, 'three actual candidates per brand, not a page-count multiplication');
  assert.equal(result.discoveryPages.length, 2);
  assert.ok(f.collected.every(input => input.imageUrl.includes('/observed-')));
  assert.equal(f.calls.filter(task => task.purpose === 'reference-inspection').length, 6);
  assert.doesNotMatch(JSON.stringify(result), /fixture-only|sourcePagePath|metadataPath/);
});

test('source-page-only SPA gaps remain partial with the observed source URL retained and no fabricated images', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: 'https://example.com/official-spa', imageUrl: '',
        subject: 'Official fixture', version: 'Release 1', title: 'Official SPA', publisher: 'Official fixture', sourceClass: 'official', purpose: 'Identity' }], limitations: [] };
    },
    async discoverPage(input) { return { schemaVersion: 1, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl,
      sourcePageContentHash: 'b'.repeat(64), pageRetrievedAt: new Date().toISOString(), sourcePagePath: '/fixture-only/spa.html', metadataPath: '/fixture-only/discovery.json',
      title: 'Official SPA', publisher: 'Official fixture', excerpt: '<div id="root"></div>', candidates: [] }; },
  });
  await f.prepare(); const result = await f.pipeline.execute();
  assert.equal(result.phase, 'partial'); assert.equal(f.collected.length, 0); assert.equal(f.generated.length, 0);
  assert.ok(result.limitations.some(message => message.includes('https://example.com/official-spa') && message.includes('HTML中没有')));
});

test('a draft revision inherits verified source bytes and original inspections, then binds and reviews with separate corrections without new discovery', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-inspection') return { status: 'verified', sourceClass: 'official', sourceRelationship: 'verified', identityVerified: true, targetMatch: 'matched', assetType: 'character',
        subject: task.input.reference.subject, version: 'Release 1', evidence: 'Historical fixture inspection asserted a pink bow on the subject hat.', limitations: [],
        imageHash: task.input.imageHash, sourcePageHash: task.input.sourcePageHash };
    },
  });
  await f.prepare();
  const originalBytes = await readFile(join(f.directory, 'automation.json'));
  const original = JSON.parse(originalBytes), callCount = f.calls.length, collectionCount = f.collected.length;
  const directory = join(f.directory, 'v2'), correctedPlan = structuredClone(f.plan);
  correctedPlan.items[0].design = 'Corrected to the visible pink hat band only.';
  const correction = 'Actual source review corrects the old pink-bow claim to a pink hat band; original inspection text remains historical.';
  const revised = new AutomaticMediaPipeline({ ...f.options, revision: 2, directory });
  const inherited = await revised.inheritVerifiedReferences(f.pipeline, { plan: correctedPlan, corrections: [correction] });
  assert.equal(inherited.revision, 2); assert.deepEqual(inherited.materials, []);
  assert.equal(f.calls.length, callCount); assert.equal(f.collected.length, collectionCount); assert.equal(f.generated.length, 0);
  assert.ok(inherited.limitations.some(value => value.includes(correction)));
  assert.ok(inherited.limitations.some(value => value.includes('不是新增来源')));
  for (const reference of inherited.references) {
    const previous = original.state.references.find(value => value.referenceId === reference.referenceId);
    assert.deepEqual(reference.inspection, previous.inspection);
    assert.match(reference.imageUrl, /\?v=2$/);
    const file = await revised.referenceFile(reference.referenceId);
    assert.ok(file.path.startsWith(join(directory, 'references')));
    assert.equal(digest(await readFile(file.path)), reference.contentHash);
  }
  const saved = JSON.parse(await readFile(join(directory, 'automation.json'), 'utf8'));
  for (const key of ['preparation', 'preparationHash', 'manifestHash', 'manifestPath', 'bindingAttempted', 'batch']) assert.equal(saved[key], undefined, key);
  assert.equal(saved.supplementaryCompleted, true);
  assert.equal(saved.supplementaryPlanHash, digest(JSON.stringify(correctedPlan)));
  assert.deepEqual(saved.sourceInheritance.corrections, [correction]);
  const restarted = new AutomaticMediaPipeline({ ...f.options, revision: 2, directory });
  await restarted.discover({ brands });
  await restarted.prepare({ plan: correctedPlan, visuals: f.visuals, context: correction });
  assert.equal(f.calls.length, callCount + 1, 'only new binding runs; inherited discovery, supplementary collection and inspection are not repeated');
  const binding = f.calls.at(-1);
  assert.equal(binding.purpose, 'reference-binding'); assert.deepEqual(binding.input.sourceReviewCorrections, [correction]);
  assert.equal(binding.input.materialPlan.items[0].design, correctedPlan.items[0].design);
  const result = await restarted.execute(); assert.equal(result.phase, 'completed');
  assert.deepEqual(f.calls.findLast(call => call.purpose === 'image-review').input.sourceReviewCorrections, [correction]);
  assert.deepEqual(await readFile(join(f.directory, 'automation.json')), originalBytes, 'the old revision and inspection history are untouched');
});

test('draft source inheritance rejects incomplete collection, paid outcomes, corrupt originals and changed scope without altering the old revision', async t => {
  const f = await fixture(t, [item('core')]);
  const make = name => new AutomaticMediaPipeline({ ...f.options, revision: 2, directory: join(f.directory, name) });
  const input = { plan: f.plan, corrections: ['Source review corrected a visible fixture detail.'] };
  await f.pipeline.discover({ brands });
  await assert.rejects(make('incomplete').inheritVerifiedReferences(f.pipeline, input), /media_inheritance_sources_incomplete/);
  await f.prepare();
  const changed = structuredClone(f.plan); changed.items[0].id = 'different-material';
  await assert.rejects(make('scope').inheritVerifiedReferences(f.pipeline, { ...input, plan: changed }), /media_inheritance_scope_changed/);
  const source = await f.pipeline.referenceFile(f.pipeline.snapshot().references[0].referenceId);
  const oldBytes = await readFile(join(f.directory, 'automation.json'));
  await writeFile(source.path, Buffer.from('corrupted original'));
  await assert.rejects(make('corrupt').inheritVerifiedReferences(f.pipeline, input), /media_registered_file_changed/);
  assert.deepEqual(await readFile(join(f.directory, 'automation.json')), oldBytes);
  await writeFile(source.path, png);
  await make('corrupt').inheritVerifiedReferences(f.pipeline, input); // Staging was cleaned after the failed copy.
  await f.pipeline.execute();
  await assert.rejects(make('paid').inheritVerifiedReferences(f.pipeline, input), /media_inheritance_after_paid_work/);
  const pending = await fixture(t, [item('core')]); await pending.prepare();
  await writeFile(join(pending.directory, 'batch-state.json'), JSON.stringify({ tasks: { core: { status: 'unknown', requestId: 'already-submitted' } } }));
  await assert.rejects(new AutomaticMediaPipeline({ ...pending.options, revision: 2, directory: join(pending.directory, 'new') })
    .inheritVerifiedReferences(pending.pipeline, { plan: pending.plan, corrections: input.corrections }), /media_inheritance_after_paid_work/);
});

test('cancelled inheritance remains retryable and omits rejected references without rewriting their historical inspection', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-inspection' && task.input.reference.brandId === 'a') return { status: 'rejected', sourceClass: 'third_party', sourceRelationship: 'verified', identityVerified: false, targetMatch: 'mismatched', assetType: 'logo',
        subject: task.input.reference.subject, version: 'Release 1', evidence: 'This fixture source does not depict the requested identity.', limitations: [], imageHash: task.input.imageHash, sourcePageHash: task.input.sourcePageHash };
    },
  });
  await f.prepare();
  const revised = new AutomaticMediaPipeline({ ...f.options, revision: 2, directory: join(f.directory, 'new') });
  const input = { plan: f.plan, corrections: ['Only the already verified subject is usable for this amendment.'] };
  const controller = new AbortController(); controller.abort('fixture-cancel');
  await assert.rejects(revised.inheritVerifiedReferences(f.pipeline, input, controller.signal), error => error === 'fixture-cancel');
  const state = await revised.inheritVerifiedReferences(f.pipeline, input);
  assert.equal(state.references.length, 1); assert.equal(state.references[0].brandId, 'b');
  assert.equal(f.pipeline.snapshot().references.find(item => item.brandId === 'a').inspection.status, 'rejected');
});

test('explicit material aspect ratios reach the frozen queue while omitted ratios keep 4:3 and invalid values never bind', async t => {
  const f = await fixture(t, [item('hero'), item('default')]);
  await f.pipeline.discover({ brands });
  const visuals = f.visuals.map(value => value.materialId === 'hero' ? { ...value, aspectRatio: '3:4' } : value);
  await f.pipeline.prepare({ plan: f.plan, visuals });
  const manifest = JSON.parse(await readFile(join(f.directory, 'material-jobs.json'), 'utf8'));
  assert.deepEqual(manifest.tasks.map(task => [task.id, task.ratio]), [['hero', '3:4'], ['default', '4:3']]);
  await f.pipeline.execute();
  assert.equal(f.generated.find(request => request.prompt === 'hero').ratio, '3:4');
  assert.equal(f.generated.find(request => request.prompt === 'default').ratio, '4:3');
  const invalid = await fixture(t, [item('invalid')]); await invalid.pipeline.discover({ brands });
  await assert.rejects(invalid.pipeline.prepare({ plan: invalid.plan, visuals: [{ materialId: 'invalid', prompt: 'invalid', aspectRatio: '4:5' }] }), /media_invalid_aspect_ratio/);
  assert.equal(invalid.calls.some(call => call.purpose === 'reference-binding'), false); assert.equal(invalid.generated.length, 0);
});

test('draft inheritance copies the actual associated discovery pages with their original hashes and retrieval dates', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/page`, imageUrl: '',
        subject: 'Official fixture original', version: 'Release 1', title: 'Actual saved source page', publisher: 'Fixture official', sourceClass: 'official', purpose: 'Identity' }], limitations: [] };
    },
    async discoverPage(input) {
      const root = join(input.outputDir, `page-${randomUUID()}`), html = '<html><img src="https://example.com/observed.png"></html>';
      const result = { schemaVersion: 1, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl,
        sourcePageContentHash: digest(html), pageRetrievedAt: '2026-09-06T00:00:00.000Z', sourcePagePath: join(root, 'source.html'), metadataPath: join(root, 'discovery.json'),
        title: 'Actual saved source page', publisher: 'Fixture official', excerpt: html,
        candidates: [{ imageUrl: 'https://example.com/observed.png', source: 'img', label: 'Observed original', observedTag: '<img>' }] };
      await mkdir(root, { recursive: true }); await writeFile(result.sourcePagePath, html); await writeFile(result.metadataPath, JSON.stringify(result));
      return result;
    },
  });
  await f.prepare();
  const old = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  const directory = join(f.directory, 'next');
  const revised = new AutomaticMediaPipeline({ ...f.options, revision: 2, directory });
  await revised.inheritVerifiedReferences(f.pipeline, { plan: f.plan, corrections: ['Source review refined one described detail using these same original pixels.'] });
  const saved = JSON.parse(await readFile(join(directory, 'automation.json'), 'utf8'));
  assert.equal(saved.discoveredPages.length, 2);
  for (const page of saved.discoveredPages) {
    const previous = old.discoveredPages.find(value => value.sourcePageUrl === page.sourcePageUrl);
    assert.equal(page.sourcePageContentHash, previous.sourcePageContentHash); assert.equal(page.pageRetrievedAt, previous.pageRetrievedAt);
    assert.ok(page.sourcePagePath.startsWith(join(directory, 'source-pages')));
    assert.equal(digest(await readFile(page.sourcePagePath)), page.sourcePageContentHash);
    assert.equal(JSON.parse(await readFile(page.metadataPath, 'utf8')).sourcePagePath, page.sourcePagePath);
  }
});

test('semantic selection can reach a character after site chrome and cannot invent image addresses', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/character`, imageUrl: '',
        subject: 'Target character', version: 'Release 1', title: 'Official character page', publisher: 'Publisher', sourceClass: 'official', purpose: 'Full character shape' }], limitations: [] };
      if (task.purpose === 'reference-selection') {
        assert.ok(task.input.candidates.some(candidate => candidate.imageUrl.endsWith('/header-logo.png')));
        const character = task.input.candidates.find(candidate => candidate.observedTag.includes('ipPreviewImage'));
        return { candidateIds: character ? [character.candidateId] : [], rationale: 'Character preview is a better candidate than publisher logo or section headings.' };
      }
    },
    async discoverPage(input) {
      assert.equal(input.maxCandidates, 64);
      return { schemaVersion: 1, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl,
        sourcePageContentHash: 'a'.repeat(64), pageRetrievedAt: new Date().toISOString(), sourcePagePath: '/fixture/source.html', metadataPath: '/fixture/discovery.json', title: 'Character page', publisher: 'Publisher', excerpt: '',
        candidates: ['header-logo', 'heading', 'slogan', 'character', 'wordmark'].map((name, index) => ({ imageUrl: `${input.sourcePageUrl}/${name}.png`, source: 'img', label: '', observedTag: index === 3 ? '<img id="ipPreviewImage">' : '<img>' })) };
    },
  });
  await f.pipeline.discover({ brands });
  assert.equal(f.collected.length, 2);
  assert.ok(f.collected.every(candidate => candidate.imageUrl.endsWith('/character.png')));
  assert.ok(f.pipeline.snapshot().references.every(reference => reference.inspection.targetMatch === 'matched'));
  assert.equal(f.generated.length, 0);
});

test('a wrong publisher logo is rejected even if the model says verified, then a bounded recovery obtains the character', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') {
        const recovering = task.input.knownReferences.some(reference => reference.inspection?.targetMatch === 'mismatched');
        return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/page`, imageUrl: `https://example.com/${task.input.brandId}/${recovering ? 'character' : 'publisher-logo'}.png`,
          subject: 'Target character', version: 'Release 1', title: 'Official page', publisher: 'Publisher', sourceClass: 'official', purpose: 'Character identity' }], limitations: [] };
      }
      if (task.purpose === 'reference-inspection' && task.input.reference.sourceImageUrl.endsWith('/publisher-logo.png')) return {
        status: 'verified', identityVerified: true, sourceClass: 'official', sourceRelationship: 'verified', targetMatch: 'mismatched', assetType: 'logo',
        subject: 'Publisher company logo', version: 'Release 1', evidence: 'Actual attached image is the company wordmark, not the requested character.', limitations: [], imageHash: task.input.imageHash, sourcePageHash: task.input.sourcePageHash };
    },
  });
  const state = await f.pipeline.discover({ brands });
  assert.equal(f.calls.filter(task => task.purpose === 'reference-discovery').length, 4);
  const rejected = state.references.filter(reference => reference.sourceImageUrl.endsWith('/publisher-logo.png'));
  assert.ok(rejected.every(reference => reference.inspection.status === 'rejected' && !reference.inspection.identityVerified));
  assert.equal(state.references.filter(reference => reference.inspection.identityVerified).length, 2);
  const restored = new AutomaticMediaPipeline(f.options), before = f.calls.length;
  await restored.discover({ brands });
  assert.equal(f.calls.length, before, 'restart reuses completed rounds and does not repeat discovery');
});

test('an official matching logo cannot satisfy a character target or disable its required identity gate', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-inspection') return { status: 'verified', identityVerified: true, targetMatch: 'matched', assetType: 'logo',
        sourceClass: 'official', sourceRelationship: 'verified', subject: 'Official company logo', version: 'Release 1',
        evidence: 'The attached source is a valid official logo, not a character rendering.', limitations: [], imageHash: task.input.imageHash, sourcePageHash: task.input.sourcePageHash };
      if (task.purpose === 'reference-binding') {
        const id = task.input.references[0].referenceId;
        return { bindings: [{ materialId: 'core', referenceIds: [id], referenceTasks: [], identityRequired: false, identityReferenceIds: [id], identityRequirements: ['Character silhouette'],
          identityTargets: [{ subject: 'Target character', assetType: 'character', referenceIds: [id] }], rationale: 'Incorrect model approval fixture.', status: 'ready', reason: '' }], limitations: [] };
      }
    },
  });
  await f.prepare();
  const state = await f.pipeline.execute();
  assert.equal(state.materials[0].binding.identityRequired, true);
  assert.equal(state.materials[0].binding.status, 'blocked');
  assert.match(state.materials[0].binding.reason, /character/);
  assert.equal(f.generated.length, 0);
});

test('failed subject search has a persisted two-round bound and never creates speculative images', async t => {
  const f = await fixture(t, [item('core')], { invoke(task) {
    if (task.purpose === 'reference-discovery') return { candidates: [], limitations: ['No real source found.'] };
  } });
  await f.pipeline.discover({ brands });
  assert.equal(f.calls.length, 4);
  const restored = new AutomaticMediaPipeline(f.options);
  await restored.discover({ brands });
  assert.equal(f.calls.length, 4);
  const saved = JSON.parse(await readFile(join(f.directory, 'automation.json'), 'utf8'));
  assert.equal(saved.discoveryRounds['initial-a'], 2);
  assert.equal(saved.discoveryRounds['initial-b'], 2);
  assert.equal(f.collected.length, 0);
});

test('a selector cannot introduce an unobserved candidate or cause unbounded downloads', async t => {
  const f = await fixture(t, [item('core')], {
    invoke(task) {
      if (task.purpose === 'reference-discovery') return { candidates: [{ sourcePageUrl: `https://example.com/${task.input.brandId}/page`, imageUrl: '', subject: 'Character', version: '1', title: 'Page', publisher: 'Publisher', sourceClass: 'official', purpose: 'Identity' }], limitations: [] };
      if (task.purpose === 'reference-selection') return { candidateIds: ['999'], rationale: 'Invalid out-of-pool model choice.' };
    },
    async discoverPage(input) { return { schemaVersion: 1, sourcePageUrl: input.sourcePageUrl, sourcePageFinalUrl: input.sourcePageUrl,
      sourcePageContentHash: 'a'.repeat(64), pageRetrievedAt: '2026-09-06', sourcePagePath: '/fixture/source.html', metadataPath: '/fixture/discovery.json', title: 'Page', publisher: 'Publisher', excerpt: '',
      candidates: [{ imageUrl: 'https://example.com/observed.png', source: 'img', label: '', observedTag: '<img>' }] }; }
  });
  await f.pipeline.discover({ brands });
  assert.equal(f.collected.length, 0);
  assert.equal(f.calls.filter(task => task.purpose === 'reference-selection').length, 4);
  assert.deepEqual(f.pipeline.snapshot().discovery, { a: 'failed', b: 'failed' });
});
