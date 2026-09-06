import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { exportSession } from '../scripts/export-session.ts';

const execute = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';
const sid = 'session-12345678-1234-1234-1234-123456789abc';
const stages = ['profile-a', 'profile-b', 'ideation-a', 'ideation-b', 'design-a', 'design-b', 'copy-a', 'visual-b', 'review-a'];
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'collider-export-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputs = join(root, 'outputs'), images = join(outputs, 'images'), mediaRoot = join(outputs, 'sessions', sid, 'media', 'v1');
  const referenceId = 'reference-12345678-1234-1234-1234-123456789abc';
  const referenceRoot = join(mediaRoot, 'references', referenceId);
  const imageRoot = join(images, 'image-12345678-1234-1234-1234-123456789abc');
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dd6633' } }).png().toBuffer();
  const page = '<html><title>Actual source</title><img src="https://example.com/reference.png"></html>';
  const reference = { schemaVersion: 1, referenceId, sourcePageUrl: 'https://example.com/source', sourcePageFinalUrl: 'https://example.com/source',
    sourcePageContentHash: hash(page), pageRetrievedAt: '2026-09-06T00:00:00.000Z', imageUrl: 'https://example.com/reference.png', imageFinalUrl: 'https://example.com/reference.png',
    retrievedAt: '2026-09-06T00:00:00.000Z', subject: 'fixture source', version: 'v1', contentHash: hash(image), mimeType: 'image/png', width: 16, height: 16,
    sourceClass: 'official', localPath: join(referenceRoot, 'reference.png'), metadataPath: join(referenceRoot, 'reference.json'), sourcePagePath: join(referenceRoot, 'source.html') };
  const asset = { assetId: 'image-12345678-1234-1234-1234-123456789abc', path: join(imageRoot, 'image.png'), metadataPath: join(imageRoot, 'asset.json'),
    contentHash: hash(image), mimeType: 'image/png', requestId: 'actual-request-id', model: 'fixture', generationStatus: 'succeeded',
    referenceInputs: [{ contentHash: hash(image), mimeType: 'image/png', bytes: image.length }] };
  const review = { status: 'approved', outputHash: hash(image), evidence: 'Fixture visual review of actual reference and output bytes.', reviewedAt: '2026-09-06T00:00:00.000Z' };
  const material = { materialId: 'cup', name: '实际杯身概念', priority: 'core', status: 'approved', imageUrl: `/api/sessions/${sid}/media/materials/cup?v=1`,
    outputHash: hash(image), review, binding: { materialId: 'cup', status: 'ready', referenceIds: [referenceId], referenceTasks: [], identityRequired: false, mappingHash: 'fixture' } };
  const state = { version: 1, sessionId: sid, revision: 1, updatedAt: '2026-09-06T00:00:00.000Z', phase: 'completed',
    discovery: { a: 'completed', b: 'completed' }, references: [{ ...reference, imageUrl: `/api/sessions/${sid}/media/references/${referenceId}?v=1` }], materials: [material], limitations: [], concurrency: 4 };
  const batch = { version: 1, manifestHash: 'fixture', tasks: { cup: { status: 'succeeded', asset, review,
    references: [{ source: 'file', path: reference.localPath, contentHash: reference.contentHash }] } } };
  const media = { version: 1, state, references: [reference], batch };
  const plan = { scopeNote: '首轮一件实际物料', productAnchor: { coreProduct: '杯身' }, items: [{ id: 'cup', name: '实际杯身概念', priority: 'core', dependencies: [] }] };
  const pins = ['brand-profile', 'collab-ideation', 'design-spec', 'campaign-copy', 'visual-production', 'quality-review'].map(id => ({ id, content: `Full original ${id}`, digest: hash(`Full original ${id}`), version: 'test' }));
  const agentId = 'media-image-review-0123456789abcdef', runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const execution = { transport: 'grok-cli', revision: 1, agentId, runId, state: 'completed' };
  const session = { id: sid, title: '库迪 × 迪士尼 · 测试', revision: 1, status: 'completed', mode: 'live', autoProduce: true, automation: state,
    brands: [{ id: 'a', name: '库迪', description: 'fixture', files: [] }, { id: 'b', name: '迪士尼', description: 'fixture', files: [] }], goal: '真实物料导出测试', constraints: ['完整保存文案'],
    concepts: [], messages: [{ revision: 1, execution, content: 'actual review', kind: 'skill', status: 'done' }],
    proposal: { sections: [{ title: '文案', skill: 'campaign-copy', content: '完整文案不可截断' }], materialPlan: plan,
      materialVisuals: [{ materialId: 'cup', prompt: '完整提示词不可截断' }], reviewStatus: 'passed', pendingConfirmations: ['生产参数待确定'] } };
  const saved = { schemaVersion: 1, session, pins, records: stages.map(key => ({ key, revision: 1, skillDigest: pins[0].digest,
    result: { section: `${key} · 完整阶段正文`, ...(key === 'review-a' ? { verdict: 'pass' } : {}) } })) };
  const sessionPath = join(outputs, 'sessions', `${sid}.json`), mediaPath = join(mediaRoot, 'automation.json');
  const runRoot = join(outputs, 'grok-agents', sid, 'v1', agentId, runId);
  const attachmentPath = join(runRoot, `attachment-1-${hash(image).slice(0, 16)}.png`);
  for (const path of [referenceRoot, imageRoot, runRoot]) await mkdir(path, { recursive: true });
  for (const [path, bytes] of [[reference.localPath, image], [reference.sourcePagePath, page], [reference.metadataPath, encode(reference)],
    [asset.path, image], [asset.metadataPath, encode(asset)], [attachmentPath, image], [join(runRoot, 'execution.json'), encode(execution)],
    [join(runRoot, 'result.json'), encode({ status: 'approved', outputHash: hash(image) })],
    [join(runRoot, 'attachments.json'), encode([{ path: attachmentPath, hash: hash(image), mimeType: 'image/png', label: 'actual image' }])],
    [join(runRoot, 'prompt.json'), 'DO NOT EXPORT BASE64 OR PRIVATE PROMPT'], [join(runRoot, 'auth.json'), 'DO NOT EXPORT SECRET'],
    [join(mediaRoot, 'material-jobs.json'), encode({ version: 1, tasks: [{ id: 'cup', prompt: '完整提示词', references: [reference.localPath] }] })]]) await writeFile(path, bytes);
  async function save() { await writeFile(sessionPath, encode(saved)); await writeFile(mediaPath, encode(media)); }
  await save();
  return { root, outputs, mediaRoot, reference, image, asset, runRoot, attachmentPath, saved, media, sessionPath, mediaPath, save,
    options: { sessionId: sid, outputDir: join(root, 'package'), outputsDir: outputs } };
}

test('offline exporter creates a portable zip of real files, full copy and original visual evidence without changing source state', async t => {
  const f = await fixture(t), before = await readFile(f.sessionPath);
  const result = await exportSession(f.options);
  assert.equal(result.status, 'complete'); assert.equal(result.delivered, 1); assert.deepEqual(result.issues, []);
  assert.deepEqual(await readFile(f.sessionPath), before);
  const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceSessionHash, hash(before));
  assert.equal(manifest.materials[0].file, 'materials/cup.png');
  assert.deepEqual(await readFile(join(result.directory, 'materials/cup.png')), f.image);
  assert.match(await readFile(join(result.directory, 'copy.md'), 'utf8'), /copy-a · 完整阶段正文/);
  assert.match(await readFile(join(result.directory, 'material-visuals.json'), 'utf8'), /完整提示词不可截断/);
  const sums = (await readFile(join(result.directory, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  for (const line of sums) { const [expected, path] = line.split('  '); assert.equal(hash(await readFile(join(result.directory, path))), expected, path); }
  assert.equal(hash(await readFile(result.archive)), result.archiveHash);
  const listing = (await execute('unzip', ['-Z1', result.archive])).stdout;
  assert.match(listing, /materials\/cup.png/); assert.match(listing, /attachments.json/);
  assert.doesNotMatch(listing, /prompt.json|auth.json|task.txt/);
  const metadata = await readFile(join(result.directory, 'evidence/assets/cup.json'), 'utf8');
  assert.doesNotMatch(metadata, new RegExp(f.root));
  const jobs = JSON.parse(await readFile(join(result.directory, 'evidence/material-jobs.json'), 'utf8'));
  assert.match(jobs.tasks[0].references[0], /^references\//);
});

test('partial output keeps failed and optional items visible and never claims a missing image is delivered', async t => {
  const f = await fixture(t);
  f.media.state.phase = 'partial'; f.media.state.materials[0].status = 'failed'; delete f.media.batch.tasks.cup.asset;
  delete f.media.state.materials[0].outputHash; delete f.media.state.materials[0].review;
  f.media.state.materials.push({ materialId: 'optional', name: '范围外物料', priority: 'optional', status: 'out_of_scope' });
  f.saved.session.status = 'paused'; f.saved.session.proposal.reviewStatus = 'unverified'; await f.save();
  const result = await exportSession(f.options);
  assert.equal(result.status, 'partial'); assert.equal(result.delivered, 0);
  assert.ok(result.issues.some(value => value.includes('cup')));
  assert.match(await readFile(join(result.directory, 'README.md'), 'utf8'), /部分导出/);
  assert.match(await readFile(join(result.directory, 'manifest.json'), 'utf8'), /范围外物料/);
});

test('external draft corrections retain original and revised text as separate portable evidence', async t => {
  const f = await fixture(t);
  f.saved.productionDraftAmendments = [{ id: 'amendment-example', source: 'external-review',
    fromRevision: 1, toRevision: 2, evidence: 'Source image review corrected a background accessory attribution.',
    records: { 'visual-b': { original: { section: 'original model output: pink bow' }, result: { section: 'reviewed draft: pink hat band' } } },
    selectedConceptText: { conceptId: 'concept-1', original: { description: 'pink bow' }, result: { description: 'pink hat band' } } }];
  f.media.sourceInheritance = { revision: 1, corrections: ['Original inspection retained; worn hat band is visible.'],
    sourceStateHash: hash('old state'), referenceIds: [f.reference.referenceId] };
  await f.save();
  const result = await exportSession(f.options);
  const corrections = JSON.parse(await readFile(join(result.directory, 'evidence/production-draft-amendments.json'), 'utf8'));
  assert.deepEqual(corrections, f.saved.productionDraftAmendments);
  const mediaEvidence = JSON.parse(await readFile(join(result.directory, 'evidence/media.json'), 'utf8'));
  assert.deepEqual(mediaEvidence.sourceInheritance, f.media.sourceInheritance);
  const originalExecutionResult = JSON.parse(await readFile(join(result.directory,
    'evidence/cli/grok-agents/v1/media-image-review-0123456789abcdef/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/result.json'), 'utf8'));
  assert.equal(originalExecutionResult.status, 'approved');
  const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(file => file.path === 'evidence/production-draft-amendments.json'));
});

test('transparent CLI references export original bytes and the actual opaque presentation with distinct hashes', async t => {
  const f = await fixture(t);
  const source = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 4, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const presented = await sharp(source).flatten({ background: '#ffffff' }).png().toBuffer();
  const sourcePath = join(f.runRoot, `source-attachment-1-${hash(source).slice(0, 16)}.png`);
  const presentedPath = join(f.runRoot, `attachment-1-${hash(presented).slice(0, 16)}.png`);
  await writeFile(sourcePath, source); await writeFile(presentedPath, presented);
  await writeFile(join(f.runRoot, 'attachments.json'), encode([{ path: presentedPath, hash: hash(presented), mimeType: 'image/png',
    sourcePath, sourceHash: hash(source), label: 'faithful alpha presentation', presentation: { type: 'alpha-composite', background: '#ffffff' } }]));
  const result = await exportSession(f.options);
  const dest = join(result.directory, 'evidence/cli/grok-agents/v1/media-image-review-0123456789abcdef/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  const [attachment] = JSON.parse(await readFile(join(dest, 'attachments.json'), 'utf8'));
  assert.notEqual(attachment.hash, attachment.sourceHash);
  assert.equal(hash(await readFile(join(result.directory, attachment.path))), hash(presented));
  assert.equal(hash(await readFile(join(result.directory, attachment.sourcePath))), hash(source));
  assert.equal(attachment.presentation.background, '#ffffff');
});

test('quality correction exports the rejected real image and accepts it only as a traceable correction input', async t => {
  const f = await fixture(t);
  const oldId = 'image-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const oldRoot = join(f.outputs, 'images', oldId);
  const oldImage = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#115577' } }).png().toBuffer();
  const oldAsset = { ...f.asset, assetId: oldId, path: join(oldRoot, 'image.png'), metadataPath: join(oldRoot, 'asset.json'),
    contentHash: hash(oldImage), requestId: 'rejected-original-request' };
  await mkdir(oldRoot); await writeFile(oldAsset.path, oldImage); await writeFile(oldAsset.metadataPath, encode(oldAsset));
  f.media.batch.tasks.cup.correctionHistory = [{ id: 'correction-example', instruction: 'Restore the original wordmark geometry.', evidence: 'Visible wordmark mismatch in actual output.',
    record: { status: 'succeeded', asset: oldAsset, review: { status: 'needs_revision', outputHash: oldAsset.contentHash, evidence: 'Wrong wordmark', reviewedAt: '2026-09-06T00:00:00Z' } },
    originalManifest: encode({ version: 1, tasks: [{ id: 'cup', prompt: 'original design', references: [f.reference.localPath] }] }),
    originalTask: { references: [{ source: 'file', path: f.reference.localPath, contentHash: f.reference.contentHash }] },
    editReference: { source: 'file', path: oldAsset.path, contentHash: oldAsset.contentHash } }];
  f.media.batch.tasks.cup.references.push({ source: 'file', path: oldAsset.path, contentHash: oldAsset.contentHash });
  f.asset.referenceInputs.push({ contentHash: oldAsset.contentHash, mimeType: 'image/png', bytes: oldImage.length });
  await writeFile(f.asset.metadataPath, encode(f.asset)); await f.save();
  const result = await exportSession(f.options);
  assert.equal(result.status, 'complete', result.issues.join('\n'));
  const oldExport = join(result.directory, 'evidence/corrections/cup/attempt-1/image.png');
  assert.deepEqual(await readFile(oldExport), oldImage);
  const batch = JSON.parse(await readFile(join(result.directory, 'evidence/batch-state.json'), 'utf8'));
  assert.equal(batch.tasks.cup.correctionHistory[0].record.asset.path, 'evidence/corrections/cup/attempt-1/image.png');
  assert.equal(batch.tasks.cup.correctionHistory[0].record.review.status, 'needs_revision');
  assert.equal(batch.tasks.cup.correctionHistory[0].record.asset.requestId, 'rejected-original-request');
  assert.equal(hash(await readFile(join(result.directory, 'materials/cup.png'))), f.asset.contentHash);
});

async function localPostprocess(f) {
  const prior = structuredClone(f.media.batch.tasks.cup);
  prior.review = { ...prior.review, status: 'needs_revision', evidence: 'Actual source wordmark mismatch.' };
  const id = 'image-bbbbbbbb-cccc-dddd-eeee-ffffffffffff', directory = join(f.outputs, 'images', id);
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#eeeeee' } }).png().toBuffer();
  const asset = { kind: 'local-postprocess', generationStatus: 'postprocessed', reviewStatus: 'unverified',
    assetId: id, path: join(directory, 'image.png'), metadataPath: join(directory, 'asset.json'), contentHash: hash(bytes),
    mimeType: 'image/png', createdAt: '2026-09-06T00:01:00.000Z' };
  await mkdir(directory); await writeFile(asset.path, bytes); await writeFile(asset.metadataPath, encode(asset));
  const review = { ...prior.review, status: 'approved', outputHash: asset.contentHash, evidence: 'Actual derived pixels inspected.' };
  const history = { record: prior, source: { source: 'file', path: f.reference.localPath, contentHash: f.reference.contentHash },
    processing: { tool: 'sharp', parameters: { method: 'alpha-composite', left: 2, top: 4, width: 8 } },
    evidence: 'User authorized pasting the original official wordmark.', authorizedAt: asset.createdAt, outputHash: asset.contentHash, manifestHash: 'fixture' };
  f.media.batch.tasks.cup = { status: 'succeeded', asset, review, references: prior.references, postprocessHistory: [history] };
  Object.assign(f.media.state.materials[0], { status: 'approved', outputHash: asset.contentHash, review });
  await f.save();
  return { prior, asset, bytes, history };
}

test('local postprocessing exports exact derived pixels, official source and paid history without inventing a new paid request', async t => {
  const f = await fixture(t), local = await localPostprocess(f);
  const earlierId = 'image-cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa', earlierRoot = join(f.outputs, 'images', earlierId);
  const earlierBytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#115577' } }).png().toBuffer();
  const earlier = { ...f.asset, assetId: earlierId, path: join(earlierRoot, 'image.png'), metadataPath: join(earlierRoot, 'asset.json'),
    contentHash: hash(earlierBytes), requestId: 'first-paid-request' };
  await mkdir(earlierRoot); await writeFile(earlier.path, earlierBytes); await writeFile(earlier.metadataPath, encode(earlier));
  local.history.record.correctionHistory = [{ record: { status: 'succeeded', asset: earlier,
    review: { status: 'needs_revision', outputHash: earlier.contentHash, evidence: 'First paid result rejected.' } },
    instruction: 'Preserve earlier correction history', originalManifest: '{}', editReference: { source: 'file', path: earlier.path, contentHash: earlier.contentHash } }];
  await f.save();
  const result = await exportSession(f.options);
  assert.equal(result.status, 'complete', result.issues.join('\n'));
  assert.deepEqual(await readFile(join(result.directory, 'materials/cup.png')), local.bytes);
  const current = JSON.parse(await readFile(join(result.directory, 'evidence/assets/cup.json'), 'utf8'));
  assert.equal(current.generationStatus, 'postprocessed');
  for (const field of ['model', 'requestId', 'responsesModel', 'providerRequestId', 'providerResponseId']) assert.equal(field in current, false);
  const audit = 'audit/postprocess/cup/operation-1';
  assert.deepEqual(await readFile(join(result.directory, audit, 'image.png')), f.image);
  assert.deepEqual(await readFile(join(result.directory, audit, 'source.png')), f.image);
  const processing = JSON.parse(await readFile(join(result.directory, audit, 'processing.json'), 'utf8'));
  assert.equal(processing.outputHash, local.asset.contentHash);
  assert.equal(processing.inputHash, f.asset.contentHash);
  assert.equal(processing.sourceHash, f.reference.contentHash);
  assert.deepEqual(processing.parameters, local.history.processing.parameters);
  const history = JSON.parse(await readFile(join(result.directory, audit, 'history.json'), 'utf8'));
  assert.equal(history.record.asset.requestId, 'actual-request-id');
  assert.equal(history.record.review.status, 'needs_revision');
  assert.equal(history.record.correctionHistory[0].record.asset.requestId, 'first-paid-request');
  assert.deepEqual(await readFile(join(result.directory, history.record.correctionHistory[0].record.asset.path)), earlierBytes);
  const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.materials[0].productionKind, 'local-postprocess');
  assert.equal(manifest.files.find(file => file.path === 'materials/cup.png').kind, 'local-postprocess-image');
  const batch = JSON.parse(await readFile(join(result.directory, 'evidence/batch-state.json'), 'utf8'));
  assert.equal(batch.tasks.cup.postprocessHistory[0].outputHash, local.asset.contentHash);
  assert.equal(batch.tasks.cup.review.outputHash, local.asset.contentHash);
});

test('local postprocessing refuses forged paid identity or source hashes and does not inherit the previous image approval', async t => {
  for (const failure of ['paid', 'source', 'old-review']) {
    const f = await fixture(t), local = await localPostprocess(f);
    if (failure === 'paid') {
      local.asset.model = 'fake-paid-model'; await writeFile(local.asset.metadataPath, encode(local.asset));
    } else if (failure === 'source') local.history.source.contentHash = '0'.repeat(64);
    else f.media.batch.tasks.cup.review.outputHash = f.asset.contentHash;
    await f.save();
    if (failure === 'old-review') {
      const result = await exportSession(f.options);
      assert.equal(result.status, 'partial'); assert.equal(result.delivered, 0);
    } else await assert.rejects(exportSession(f.options), failure === 'paid' ? /export_metadata_identity_mismatch/ : /export_invalid_postprocess_history/);
  }
});

test('downstream references accept a locally postprocessed asset only with approval of its exact new hash', async t => {
  const f = await fixture(t), local = await localPostprocess(f);
  const id = 'image-dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb', directory = join(f.outputs, 'images', id);
  const asset = { ...f.asset, assetId: id, path: join(directory, 'image.png'), metadataPath: join(directory, 'asset.json'),
    requestId: 'downstream-paid-request', referenceInputs: [{ contentHash: local.asset.contentHash, mimeType: 'image/png', bytes: local.bytes.length }] };
  await mkdir(directory); await writeFile(asset.path, f.image); await writeFile(asset.metadataPath, encode(asset));
  const review = { status: 'approved', outputHash: asset.contentHash, evidence: 'Downstream actual pixels inspected.' };
  f.media.batch.tasks.bag = { status: 'succeeded', asset, review,
    references: [{ source: 'task', taskId: 'cup', path: local.asset.path, contentHash: local.asset.contentHash }] };
  f.media.state.materials.push({ ...f.media.state.materials[0], materialId: 'bag', name: '下游外带袋', outputHash: asset.contentHash, review });
  f.saved.session.proposal.materialPlan.items.push({ id: 'bag', name: '下游外带袋', priority: 'core', dependencies: ['cup'] });
  f.saved.session.proposal.materialVisuals.push({ materialId: 'bag', prompt: 'Use the approved shared cup.' });
  await f.save();
  const approved = await exportSession(f.options);
  assert.equal(approved.status, 'complete', approved.issues.join('\n')); assert.equal(approved.delivered, 2);
  f.media.batch.tasks.cup.review.outputHash = f.asset.contentHash;
  await f.save();
  const stale = await exportSession({ ...f.options, outputDir: join(f.root, 'stale-package') });
  assert.equal(stale.status, 'partial');
  assert.ok(stale.issues.some(value => value.includes('已通过共用图：bag')));
});

test('active sessions and mismatched media revisions are refused before creating an export', async t => {
  const f = await fixture(t);
  f.saved.session.status = 'running'; await f.save();
  await assert.rejects(exportSession(f.options), /export_session_still_running/);
  f.saved.session.status = 'completed'; f.media.state.revision = 2; await f.save();
  await assert.rejects(exportSession(f.options), /export_media_revision_mismatch/);
  await assert.rejects(readFile(join(f.options.outputDir, 'manifest.json')), { code: 'ENOENT' });
});

test('registered image corruption fails closed and removes only the new incomplete destination', async t => {
  const f = await fixture(t);
  await writeFile(f.asset.path, 'changed actual bytes');
  await assert.rejects(exportSession(f.options), /export_registered_hash_mismatch/);
  await assert.rejects(readdir(f.options.outputDir), { code: 'ENOENT' });
  assert.equal(await readFile(f.asset.path, 'utf8'), 'changed actual bytes');
});

test('saved path traversal and symlinked originals cannot expose arbitrary local files', async t => {
  const f = await fixture(t), secret = join(f.root, 'secret.txt');
  await writeFile(secret, 'private outside source roots');
  const original = f.reference.localPath;
  f.reference.localPath = secret; f.reference.contentHash = hash('private outside source roots'); await f.save();
  await assert.rejects(exportSession(f.options), /export_reference_path_mismatch/);
  f.reference.localPath = original; f.reference.contentHash = hash(f.image); await f.save();
  await rm(original); await symlink(secret, original);
  await assert.rejects(exportSession(f.options), /export_symlink_rejected/);
  assert.equal(await readFile(secret, 'utf8'), 'private outside source roots');
});

test('existing exports are preserved and source-overlapping destinations are refused', async t => {
  const f = await fixture(t);
  await mkdir(f.options.outputDir); await writeFile(join(f.options.outputDir, 'keep.txt'), 'existing user file');
  await assert.rejects(exportSession(f.options), /export_destination_exists/);
  assert.equal(await readFile(join(f.options.outputDir, 'keep.txt'), 'utf8'), 'existing user file');
  await assert.rejects(exportSession({ ...f.options, outputDir: f.mediaRoot }), /export_output_overlaps_source/);
  const sourceAlias = join(f.root, 'source-alias'); await symlink(f.mediaRoot, sourceAlias);
  await assert.rejects(exportSession({ ...f.options, outputDir: join(sourceAlias, 'new-package') }), /export_output_overlaps_source/);
});

test('missing source pages or actual CLI attachments make the package partial', async t => {
  const f = await fixture(t);
  await rm(f.reference.sourcePagePath); await rm(f.attachmentPath);
  const result = await exportSession(f.options);
  assert.equal(result.status, 'partial');
  assert.ok(result.issues.some(value => value.includes('来源原件或来源页缺失')));
  assert.ok(result.issues.some(value => value.includes('CLI 真实看图附件缺失')));
});

test('failed historical CLI attempts keep research evidence and safe diagnostics without downgrading successful final delivery', async t => {
  const f = await fixture(t);
  const failedRun = '11111111-2222-3333-4444-555555555555', successRun = '66666666-7777-8888-9999-aaaaaaaaaaaa';
  const agentId = 'research-a';
  const diagnostic = { stopReason: 'end_turn', schemaError: true, sessionMatches: true, structuredObject: false,
    schemaFailure: { kind: 'public_field_constraints', fieldLengths: { message: 14, section: 0 }, issues: ['section_below_min_length'] } };
  const webEvidence = { attempts: [{ attempt: 1, runId: failedRun, availableTools: ['web_search', 'web_fetch'],
    calls: [{ callId: 'actual-call', name: 'web_search', status: 'completed' }], outcome: 'executed' }] };
  for (const [runId, state] of [[failedRun, 'failed'], [successRun, 'completed']]) {
    const directory = join(f.outputs, 'grok-agents', sid, 'v1', agentId, runId);
    const execution = { transport: 'grok-cli', agentId, revision: 1, runId, state, reasoningEffort: 'low', metrics: { attempt: 1, reasoningEffort: 'low' } };
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'execution.json'), encode(execution));
    await writeFile(join(directory, 'research-evidence.json'), encode(webEvidence));
    await writeFile(join(directory, 'diagnostics.json'), encode(diagnostic));
    if (state === 'completed') await writeFile(join(directory, 'result.json'), encode({ section: '最终真实研究成果' }));
    await writeFile(join(directory, 'prompt.json'), 'PRIVATE RAW PROMPT MUST STAY OUT');
    f.saved.session.messages.push({ revision: 1, execution, status: state === 'failed' ? 'error' : 'done', content: state });
  }
  // A failed visual setup can have no image attachments at all; the completed
  // fixture inspection remains present and proves the final accepted output.
  const visualAgent = 'media-image-review-fedcba9876543210';
  const visualRoot = join(f.outputs, 'grok-agents', sid, 'v1', visualAgent, failedRun);
  await mkdir(visualRoot, { recursive: true });
  await writeFile(join(visualRoot, 'execution.json'), encode({ transport: 'grok-cli', agentId: visualAgent, revision: 1, runId: failedRun, state: 'failed' }));
  await f.save();
  const result = await exportSession(f.options);
  assert.equal(result.status, 'complete'); assert.deepEqual(result.issues, []);
  for (const runId of [failedRun, successRun]) {
    const directory = join(result.directory, 'evidence/cli/grok-agents/v1', agentId, runId);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'diagnostics.json'), 'utf8')), diagnostic);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'research-evidence.json'), 'utf8')), webEvidence);
    const execution = JSON.parse(await readFile(join(directory, 'execution.json'), 'utf8'));
    assert.equal(execution.reasoningEffort, 'low'); assert.equal(execution.metrics.reasoningEffort, 'low');
    await assert.rejects(readFile(join(directory, 'prompt.json')), { code: 'ENOENT' });
  }
});

test('authorized retry history retains the original failed request and latest accepted success in the exported batch evidence', async t => {
  const f = await fixture(t);
  const history = { attempt: 1, record: { status: 'failed', requestId: 'original-failed-request', error: 'image_upstream_http_502',
    references: [{ source: 'file', path: f.reference.localPath, contentHash: f.reference.contentHash }], diagnostics: { requestMs: 4321, totalMs: 5000 } },
    manifestHash: 'original-manifest-hash', taskHash: 'original-task-hash', evidence: '用户已授权对确认失败项再执行一次。', authorizedAt: '2026-09-06T00:01:00.000Z' };
  f.media.batch.tasks.cup.attempt = 2; f.media.batch.tasks.cup.attemptId = 'second-attempt-id';
  f.media.batch.tasks.cup.retryHistory = [history];
  await f.save();
  const result = await exportSession(f.options);
  assert.equal(result.status, 'complete'); assert.equal(result.delivered, 1);
  const batch = JSON.parse(await readFile(join(result.directory, 'evidence/batch-state.json'), 'utf8'));
  const task = batch.tasks.cup;
  assert.equal(task.attempt, 2); assert.equal(task.attemptId, 'second-attempt-id');
  assert.equal(task.status, 'succeeded'); assert.equal(task.asset.requestId, 'actual-request-id');
  assert.equal(task.review.status, 'approved'); assert.equal(task.review.outputHash, f.asset.contentHash);
  assert.deepEqual(task.retryHistory, [{ ...history, record: { ...history.record, references: [{ ...history.record.references[0],
    path: `references/${f.reference.referenceId}/original.png` }] } }]);
});
