import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { ImageProviderError, referenceDataUrl, validateImageRequest } from './openai-image-provider.ts';
import type { ImageAsset, ImageDiagnostics, ImageProgress, ImageProvider, ImageRequest } from './openai-image-provider.ts';
import { MAX_IMAGE_CONCURRENCY, reconcileUnknownImageRequest } from './image-queue.ts';

export type ImageBatchReference = { source: 'file' | 'task'; path: string; contentHash: string; taskId?: string };
export type ImageBatchTask = { id: string; request: ImageRequest; dependencies: string[]; referenceTasks: string[]; references: ImageBatchReference[] };
export type ImageBatchPlan = { version: 1; manifestHash: string; tasks: ImageBatchTask[] };
export type LocalPostprocessAsset = { kind: 'local-postprocess'; generationStatus: 'postprocessed'; assetId: string;
  path: string; metadataPath: string; contentHash: string; mimeType: string; createdAt: string; reviewStatus: 'unverified' };
export type ImageBatchAsset = ImageAsset | LocalPostprocessAsset;
export type ImageBatchReview = { status: 'approved' | 'needs_revision'; outputHash: string; evidence: string; reviewedAt: string; reviewer?: string };
export type ImageBatchRecord = {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'blocked' | 'waiting_review' | 'waiting_capacity';
  references?: ImageBatchReference[];
  asset?: ImageBatchAsset;
  error?: string;
  requestId?: string | null;
  diagnostics?: ImageDiagnostics;
  attempt?: number;
  attemptId?: string;
  retryHistory?: ImageBatchRetry[];
  correctionHistory?: ImageBatchQualityCorrection[];
  postprocessHistory?: ImageBatchPostprocess[];
  review?: ImageBatchReview;
  reviewHistory?: ImageBatchReview[];
  reconciliation?: { outcome: 'succeeded' | 'failed' | 'cancelled'; evidence: string; reconciledAt: string };
};
export type ImageBatchRetry = { attempt: number; record: Omit<ImageBatchRecord, 'retryHistory'>;
  manifestHash: string; taskHash: string; evidence: string; authorizedAt: string };
export type ImageBatchQualityCorrection = { id: string; originalManifest: string; originalManifestFileHash: string;
  originalTask: Omit<ImageBatchTask, 'request'> & { request: Omit<ImageRequest, 'references'> };
  record: Omit<ImageBatchRecord, 'correctionHistory'>; manifestHash: string; correctedManifestHash: string;
  taskHash: string; correctedTaskHash: string; editReference: ImageBatchReference; instruction: string; evidence: string; authorizedAt: string };
export type ImageBatchPostprocess = { record: Omit<ImageBatchRecord, 'postprocessHistory'>; source: ImageBatchReference;
  processing: { tool: string; parameters: unknown }; evidence: string; authorizedAt: string; outputHash: string; manifestHash: string };
export type ImageBatchState = { version: 1; manifestHash: string; updatedAt: string;
  status?: 'completed' | 'in_progress' | 'waiting_review' | 'waiting_capacity' | 'incomplete'; tasks: Record<string, ImageBatchRecord> };
export class ImageBatchError extends Error {
  constructor(code: string) { super(code); this.name = 'ImageBatchError'; }
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
function strings(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.length > 0) || new Set(value).size !== value.length) {
    throw new ImageBatchError('image_batch_invalid_list');
  }
  return value as string[];
}

async function fileReference(path: string): Promise<{ dataUrl: string; evidence: ImageBatchReference }> {
  if ((await stat(path)).size > 6 * 1024 * 1024) throw new ImageBatchError('image_batch_reference_too_large');
  const bytes = await readFile(path);
  return { dataUrl: referenceDataUrl(bytes), evidence: { source: 'file', path, contentHash: hash(bytes) } };
}

/** Resolve and validate every local reference before any potentially billable work.
 * Manifest references are paths, never remote URLs or embedded base64.
 */
export async function loadImageBatchPlan(manifestPath: string): Promise<ImageBatchPlan> {
  const path = resolve(manifestPath);
  try { await stat(`${path}.quality-correction.json`); throw new ImageBatchError('image_batch_correction_transaction_incomplete'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if ((await stat(path)).size > 4 * 1024 * 1024) throw new ImageBatchError('image_batch_manifest_too_large');
  let manifest: unknown;
  try { manifest = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new ImageBatchError('image_batch_invalid_manifest'); }
  if (!object(manifest) || manifest.version !== 1 || !Array.isArray(manifest.tasks) || !manifest.tasks.length || manifest.tasks.length > 256) {
    throw new ImageBatchError('image_batch_invalid_manifest');
  }
  const tasks: ImageBatchTask[] = [];
  for (const value of manifest.tasks) {
    if (!object(value) || !validId(value.id) || tasks.some(task => task.id === value.id)) throw new ImageBatchError('image_batch_invalid_task_id');
    const dependencies = strings(value.dependencies), referenceTasks = strings(value.referenceTasks), paths = strings(value.references);
    if (paths.length + referenceTasks.length > 4 || paths.some(path => /^[a-z][a-z0-9+.-]*:/i.test(path))) {
      throw new ImageBatchError('image_batch_invalid_references');
    }
    const references = await Promise.all(paths.map(path => fileReference(resolve(dirname(manifestPath), path))));
    const request: ImageRequest = { prompt: value.prompt as string, negativePrompt: value.negativePrompt as string | undefined,
      ratio: value.ratio as ImageRequest['ratio'], detail: value.detail as ImageRequest['detail'], references: references.map(reference => reference.dataUrl) };
    validateImageRequest(request);
    tasks.push({ id: value.id, request, dependencies, referenceTasks, references: references.map(reference => reference.evidence) });
  }
  const ids = new Set(tasks.map(task => task.id));
  for (const task of tasks) {
    if (task.dependencies.some(id => !ids.has(id) || id === task.id) || task.referenceTasks.some(id => !task.dependencies.includes(id))) {
      throw new ImageBatchError('image_batch_invalid_dependency');
    }
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (task: ImageBatchTask) => {
    if (visiting.has(task.id)) throw new ImageBatchError('image_batch_dependency_cycle');
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const id of task.dependencies) visit(tasks.find(task => task.id === id)!);
    visiting.delete(task.id); visited.add(task.id);
  };
  tasks.forEach(visit);
  // Fingerprint actual bytes as well as their paths. A changed source cannot reuse
  // old successful results just because the manifest filename stayed the same.
  const manifestHash = hash(JSON.stringify(tasks.map(task => ({ ...task,
    request: { ...task.request, ratio: task.request.ratio ?? '1:1', detail: task.request.detail ?? '2K', references: undefined } }))));
  return { version: 1, manifestHash, tasks };
}

function validateState(value: unknown, plan: ImageBatchPlan): ImageBatchState {
  if (!object(value) || value.version !== 1 || value.manifestHash !== plan.manifestHash || !object(value.tasks)
    || Object.keys(value.tasks).length !== plan.tasks.length) throw new ImageBatchError('image_batch_state_mismatch');
  const statuses = ['pending', 'running', 'succeeded', 'failed', 'unknown', 'blocked', 'waiting_review', 'waiting_capacity'];
  for (const task of plan.tasks) {
    const record = value.tasks[task.id];
    if (!object(record) || typeof record.status !== 'string' || !statuses.includes(record.status)
      || (record.status === 'succeeded' && (!object(record.asset) || typeof record.asset.path !== 'string' || typeof record.asset.contentHash !== 'string'))
      || (record.attempt !== undefined && (!Number.isInteger(record.attempt) || Number(record.attempt) < 1
        || Number(record.attempt) > (Array.isArray(record.correctionHistory) && record.correctionHistory.length === 1 ? 3 : 2)))
      || (record.retryHistory !== undefined && (!Array.isArray(record.retryHistory) || record.retryHistory.length > 1
        || record.retryHistory.some(entry => !object(entry) || entry.attempt !== 1 || !object(entry.record) || entry.record.status !== 'failed'
          || typeof entry.evidence !== 'string' || typeof entry.manifestHash !== 'string' || typeof entry.taskHash !== 'string')))
      || (record.correctionHistory !== undefined && (!Array.isArray(record.correctionHistory) || record.correctionHistory.length !== 1
        || record.correctionHistory.some(entry => !object(entry) || typeof entry.id !== 'string' || !object(entry.record)
          || entry.record.status !== 'succeeded' || !object(entry.record.asset) || !object(entry.record.review) || entry.record.review.status !== 'needs_revision'
          || typeof entry.originalManifest !== 'string' || !object(entry.originalTask) || !object(entry.editReference)
          || typeof entry.evidence !== 'string' || typeof entry.instruction !== 'string' || typeof entry.correctedManifestHash !== 'string')))
      || (record.postprocessHistory !== undefined && (!Array.isArray(record.postprocessHistory) || record.postprocessHistory.length !== 1
        || record.postprocessHistory.some(entry => !object(entry) || !object(entry.record) || !object(entry.record.asset)
          || !object(entry.source) || !object(entry.processing) || typeof entry.outputHash !== 'string' || typeof entry.evidence !== 'string')))) {
      throw new ImageBatchError('image_batch_invalid_state');
    }
  }
  return value as ImageBatchState;
}

function replaceRecord(state: ImageBatchState, id: string, next: ImageBatchRecord) {
  const previous = state.tasks[id];
  state.tasks[id] = { ...(previous.attempt === undefined ? {} : { attempt: previous.attempt }),
    ...(previous.attemptId ? { attemptId: previous.attemptId } : {}),
    ...(previous.retryHistory ? { retryHistory: previous.retryHistory } : {}), ...next };
  if (previous.correctionHistory) state.tasks[id].correctionHistory = previous.correctionHistory;
  if (previous.postprocessHistory) state.tasks[id].postprocessHistory = previous.postprocessHistory;
  if (previous.reviewHistory) state.tasks[id].reviewHistory = previous.reviewHistory;
}

function reopenResolvedDependencies(state: ImageBatchState, plan: ImageBatchPlan, roots?: Set<string>) {
  let changed: boolean;
  do {
    changed = false;
    for (const task of plan.tasks) {
      const record = state.tasks[task.id];
      if (record.status !== 'blocked' || record.error !== 'image_batch_dependency_unavailable' || record.requestId || record.asset
        || !task.dependencies.length || (roots && !task.dependencies.some(id => roots.has(id)))
        || task.dependencies.some(id => ['failed', 'unknown', 'blocked'].includes(state.tasks[id].status))) continue;
      replaceRecord(state, task.id, { status: 'pending' }); roots?.add(task.id); changed = true;
    }
  } while (changed);
}

async function verifiedAsset(asset: ImageBatchAsset): Promise<Buffer> {
  let bytes: Buffer;
  try { bytes = await readFile(asset.path); }
  catch { throw new ImageBatchError('image_batch_saved_asset_missing'); }
  if (hash(bytes) !== asset.contentHash) throw new ImageBatchError('image_batch_saved_asset_changed');
  return bytes;
}

async function saveState(statePath: string, state: ImageBatchState) {
  state.updatedAt = new Date().toISOString();
  const records = Object.values(state.tasks);
  state.status = records.every(record => record.status === 'succeeded') ? 'completed'
    : records.some(record => ['pending', 'running'].includes(record.status)) ? 'in_progress'
    : records.some(record => record.status === 'waiting_capacity') ? 'waiting_capacity'
    : records.some(record => record.status === 'waiting_review') ? 'waiting_review' : 'incomplete';
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(state, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, statePath);
  } finally { await rm(temporary, { force: true }); }
}

/** Called only after an agent/person has actually inspected the generated image.
 * This records evidence; it does not perform or infer a visual review itself.
 */
export async function recordImageBatchReview(options: { statePath: string; taskId: string; outputHash: string;
  evidence: string; status?: 'approved' | 'needs_revision'; reviewer?: string }): Promise<ImageBatchState> {
  if (!validId(options.taskId) || !/^[a-f0-9]{64}$/.test(options.outputHash)
    || typeof options.evidence !== 'string' || options.evidence.trim().length < 10 || options.evidence.length > 4000
    || (options.status !== undefined && !['approved', 'needs_revision'].includes(options.status))
    || (options.reviewer !== undefined && (typeof options.reviewer !== 'string' || !options.reviewer.trim() || options.reviewer.length > 200))) throw new ImageBatchError('image_batch_invalid_review');
  const statePath = resolve(options.statePath), lockPath = `${statePath}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const state = JSON.parse(await readFile(statePath, 'utf8')) as ImageBatchState;
    if (state.version !== 1 || !object(state.tasks)) throw new ImageBatchError('image_batch_invalid_state');
    const record = state.tasks[options.taskId];
    if (record?.status !== 'succeeded' || !record.asset || record.asset.contentHash !== options.outputHash) throw new ImageBatchError('image_batch_review_asset_mismatch');
    await verifiedAsset(record.asset);
    if (record.review) record.reviewHistory = [...(record.reviewHistory ?? []), structuredClone(record.review)];
    record.review = { status: options.status ?? 'approved', outputHash: options.outputHash,
      evidence: options.evidence.trim(), reviewedAt: new Date().toISOString(), ...(options.reviewer ? { reviewer: options.reviewer.trim() } : {}) };
    await saveState(statePath, state);
    return state;
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

/** Reconcile a confirmed terminal outcome without issuing a replacement request.
 * A successful recovery must supply the provider's actual saved asset and hash.
 */
export async function reconcileImageBatchUnknown(options: { statePath: string; taskId: string;
  outcome: 'succeeded' | 'failed' | 'cancelled'; evidence: string; asset?: ImageAsset }): Promise<ImageBatchState> {
  if (!validId(options.taskId) || !['succeeded', 'failed', 'cancelled'].includes(options.outcome)
    || typeof options.evidence !== 'string' || options.evidence.trim().length < 10 || options.evidence.length > 4000) throw new ImageBatchError('image_batch_invalid_reconciliation');
  const statePath = resolve(options.statePath), lockPath = `${statePath}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const state = JSON.parse(await readFile(statePath, 'utf8')) as ImageBatchState;
    if (state.version !== 1 || !object(state.tasks)) throw new ImageBatchError('image_batch_invalid_state');
    const record = state.tasks[options.taskId];
    if (record?.status !== 'unknown') throw new ImageBatchError('image_batch_reconciliation_requires_unknown');
    if (options.outcome === 'succeeded') {
      if (!options.asset || options.asset.generationStatus !== 'succeeded'
        || (record.requestId && options.asset.requestId !== record.requestId)) throw new ImageBatchError('image_batch_reconciliation_asset_mismatch');
      await verifiedAsset(options.asset);
      record.status = 'succeeded'; record.asset = options.asset; delete record.error;
    } else { record.status = 'failed'; record.error = `image_batch_reconciled_${options.outcome}`; }
    record.reconciliation = { outcome: options.outcome, evidence: options.evidence.trim(), reconciledAt: new Date().toISOString() };
    await saveState(statePath, state);
    if (record.requestId) reconcileUnknownImageRequest({ requestId: record.requestId, outcome: options.outcome, evidence: options.evidence });
    return state;
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

/** Explicitly authorize one new attempt for named terminal failures. This only
 * journals pending work; a separate run submits it using the unchanged plan.
 * Unknown outcomes must first be reconciled, and existing images are never retried.
 */
export async function retryFailedImageBatchTasks(plan: ImageBatchPlan, options: {
  statePath: string; taskIds: string[]; evidence: string;
}): Promise<ImageBatchState> {
  if (!Array.isArray(options.taskIds) || !options.taskIds.length || options.taskIds.length > 16
    || !options.taskIds.every(validId) || new Set(options.taskIds).size !== options.taskIds.length
    || typeof options.evidence !== 'string' || options.evidence.trim().length < 10 || options.evidence.length > 4000) {
    throw new ImageBatchError('image_batch_invalid_retry');
  }
  const statePath = resolve(options.statePath), lockPath = `${statePath}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const state = validateState(JSON.parse(await readFile(statePath, 'utf8')), plan);
    // Validate the whole named selection and its current source bytes before
    // mutating anything, so one ineligible item cannot partially authorize work.
    for (const id of options.taskIds) {
      const task = plan.tasks.find(task => task.id === id), record = state.tasks[id];
      if (!task || record?.status !== 'failed' || record.asset || record.review) throw new ImageBatchError('image_batch_retry_requires_failed_without_asset');
      if (record.error === 'image_upstream_declined') throw new ImageBatchError('image_batch_retry_upstream_declined');
      if ((record.attempt ?? 1) >= 2 || record.retryHistory?.length || record.correctionHistory?.length) throw new ImageBatchError('image_batch_retry_limit_reached');
      for (const reference of task.references) {
        if ((await fileReference(reference.path)).evidence.contentHash !== reference.contentHash) throw new ImageBatchError('image_batch_reference_changed');
      }
    }
    const authorizedAt = new Date().toISOString();
    for (const id of options.taskIds) {
      const task = plan.tasks.find(task => task.id === id)!;
      const { retryHistory: _history, ...record } = structuredClone(state.tasks[id]);
      const taskHash = hash(JSON.stringify({ ...task, request: { ...task.request,
        ratio: task.request.ratio ?? '1:1', detail: task.request.detail ?? '2K', references: undefined } }));
      state.tasks[id] = { status: 'pending', attempt: 2, attemptId: randomUUID(), retryHistory: [{
        attempt: 1, record, manifestHash: plan.manifestHash, taskHash, evidence: options.evidence.trim(), authorizedAt,
      }] };
    }
    reopenResolvedDependencies(state, plan, new Set(options.taskIds));
    await saveState(statePath, state);
    return state;
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

/** Authorize one narrowly scoped edit of an actually rejected image. The old
 * request, output and review remain evidence, separately from failed retries.
 * A durable journal blocks readers if a process stops between the two renames. */
export async function registerImageBatchQualityCorrection(plan: ImageBatchPlan, options: {
  manifestPath: string; statePath: string; taskId: string; instruction: string; evidence: string;
}): Promise<{ plan: ImageBatchPlan; state: ImageBatchState; manifestHash: string }> {
  if (!validId(options.taskId) || typeof options.instruction !== 'string' || options.instruction.trim().length < 10 || options.instruction.length > 3000
    || typeof options.evidence !== 'string' || options.evidence.trim().length < 10 || options.evidence.length > 4000) throw new ImageBatchError('image_batch_invalid_quality_correction');
  const statePath = resolve(options.statePath), manifestPath = resolve(options.manifestPath), lockPath = `${statePath}.lock`;
  if (statePath === manifestPath) throw new ImageBatchError('image_batch_invalid_quality_correction');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked'); throw error; }
  const id = randomUUID(), stagedManifest = `${manifestPath}.${id}.tmp`, journalPath = `${manifestPath}.quality-correction.json`;
  const write = async (path: string, contents: string) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  };
  let originalManifest: string | undefined, originalState: string | undefined, journalWritten = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), operation: 'quality-correction' }));
    const currentPlan = await loadImageBatchPlan(manifestPath);
    if (currentPlan.manifestHash !== plan.manifestHash) throw new ImageBatchError('image_batch_state_mismatch');
    originalState = await readFile(statePath, 'utf8');
    const state = validateState(JSON.parse(originalState), currentPlan);
    if (Object.values(state.tasks).some(record => ['running', 'unknown'].includes(record.status))) throw new ImageBatchError('image_batch_correction_requires_idle');
    const task = currentPlan.tasks.find(task => task.id === options.taskId), record = state.tasks[options.taskId];
    if (!task || record?.status !== 'succeeded' || !record.asset || record.asset.generationStatus !== 'succeeded' || record.postprocessHistory?.length || record.review?.status !== 'needs_revision'
      || record.review.outputHash !== record.asset.contentHash) throw new ImageBatchError('image_batch_correction_requires_rejected_asset');
    if (record.correctionHistory?.length) throw new ImageBatchError('image_batch_correction_limit_reached');
    if (task.references.length + task.referenceTasks.length + 1 > 4) throw new ImageBatchError('image_batch_correction_reference_limit');
    const descendants = new Set([task.id]);
    for (let changed = true; changed;) {
      changed = false;
      for (const candidate of currentPlan.tasks) if (!descendants.has(candidate.id) && candidate.dependencies.some(id => descendants.has(id))) {
        descendants.add(candidate.id); changed = true;
      }
    }
    for (const descendant of descendants) if (descendant !== task.id) {
      const downstream = state.tasks[descendant];
      if (downstream.asset || downstream.correctionHistory?.length || downstream.retryHistory?.some(entry => entry.record.asset)) throw new ImageBatchError('image_batch_correction_has_generated_dependents');
    }
    await verifiedAsset(record.asset);
    const editReference = await fileReference(resolve(record.asset.path));
    if (editReference.evidence.contentHash !== record.asset.contentHash) throw new ImageBatchError('image_batch_saved_asset_changed');
    for (const reference of record.references ?? []) {
      if ((await fileReference(reference.path)).evidence.contentHash !== reference.contentHash) throw new ImageBatchError('image_batch_reference_changed');
    }
    originalManifest = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(originalManifest) as { version: 1; tasks: Record<string, unknown>[] };
    const target = manifest.tasks.find(item => item.id === task.id)!;
    target.prompt = `${task.request.prompt}\n\nEXPLICIT QUALITY CORRECTION — edit the previously generated output appended as the final local reference. Preserve the original identity references, product structure, composition and all other requirements. The prior output is an edit base, not an identity authority. Correct only these observed defects:\n${options.instruction.trim()}`;
    target.references = [...strings(target.references), editReference.evidence.path];
    await write(stagedManifest, JSON.stringify(manifest, null, 2) + '\n');
    const correctedPlan = await loadImageBatchPlan(stagedManifest);
    const { references: _dataUrls, ...request } = task.request;
    const originalTask = JSON.parse(JSON.stringify({ ...task, request })) as ImageBatchQualityCorrection['originalTask'];
    const history: ImageBatchQualityCorrection = { id: `correction-${id}`, originalManifest, originalManifestFileHash: hash(originalManifest),
      originalTask, record: structuredClone(record), manifestHash: currentPlan.manifestHash, correctedManifestHash: correctedPlan.manifestHash,
      taskHash: hash(JSON.stringify(originalTask)), correctedTaskHash: hash(JSON.stringify({ ...correctedPlan.tasks.find(item => item.id === task.id)!,
        request: { ...correctedPlan.tasks.find(item => item.id === task.id)!.request, references: undefined } })), editReference: editReference.evidence,
      instruction: options.instruction.trim(), evidence: options.evidence.trim(), authorizedAt: new Date().toISOString() };
    state.manifestHash = correctedPlan.manifestHash;
    state.tasks[task.id] = { status: 'pending', attempt: (record.attempt ?? 1) + 1, attemptId: randomUUID(),
      ...(record.retryHistory ? { retryHistory: structuredClone(record.retryHistory) } : {}), correctionHistory: [history] };
    // No submitted work is reopened. Existing waiting dependents re-evaluate
    // against the replacement's exact output approval when the queue resumes.
    await write(journalPath, JSON.stringify({ version: 1, correctionId: history.id, statePath, manifestPath,
      previousManifestHash: currentPlan.manifestHash, correctedManifestHash: correctedPlan.manifestHash,
      previousManifestFileHash: hash(originalManifest), previousStateHash: hash(originalState), authorizedAt: history.authorizedAt }, null, 2) + '\n');
    journalWritten = true;
    await rename(stagedManifest, manifestPath);
    await saveState(statePath, state);
    await rm(journalPath);
    journalWritten = false;
    return { plan: correctedPlan, state, manifestHash: correctedPlan.manifestHash };
  } catch (error) {
    if (journalWritten && originalManifest !== undefined && originalState !== undefined) {
      // Roll back a caught storage failure. If rollback itself fails, retain the
      // journal so no loader can silently run a partly committed correction.
      await write(manifestPath, originalManifest); await write(statePath, originalState); await rm(journalPath, { force: true });
    }
    throw error;
  } finally { await rm(stagedManifest, { force: true }); await lock.close(); await rm(lockPath, { force: true }); }
}

/** Register an explicitly prepared local derivative, never a supplier result.
 * The host verifies source identity; this layer verifies bytes and the exact
 * rejected predecessor, then requires a fresh visual check of the derivative. */
export async function registerImageBatchPostprocess(plan: ImageBatchPlan, options: {
  statePath: string; taskId: string; expectedOutputHash: string; asset: LocalPostprocessAsset;
  source: ImageBatchReference; processing: { tool: string; parameters: unknown }; evidence: string;
}): Promise<ImageBatchState> {
  const jsonSafe = (value: unknown, depth = 0): boolean => depth <= 20 && (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value) || Array.isArray(value) && value.every(item => jsonSafe(item, depth + 1))
    || object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.values(value).every(item => jsonSafe(item, depth + 1)));
  const asset = options.asset;
  if (!validId(options.taskId) || !/^[a-f0-9]{64}$/.test(options.expectedOutputHash) || !object(asset)
    || asset.kind !== 'local-postprocess' || asset.generationStatus !== 'postprocessed' || asset.reviewStatus !== 'unverified'
    || Object.keys(asset).some(key => !['kind', 'generationStatus', 'assetId', 'path', 'metadataPath', 'contentHash', 'mimeType', 'createdAt', 'reviewStatus'].includes(key))
    || !validId(asset.assetId) || typeof asset.path !== 'string' || typeof asset.metadataPath !== 'string' || !/^[a-f0-9]{64}$/.test(asset.contentHash)
    || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) || typeof asset.createdAt !== 'string' || !Number.isFinite(Date.parse(asset.createdAt))
    || !object(options.source) || options.source.source !== 'file' || options.source.taskId !== undefined || typeof options.source.path !== 'string' || !/^[a-f0-9]{64}$/.test(options.source.contentHash)
    || !object(options.processing) || typeof options.processing.tool !== 'string' || !options.processing.tool.trim() || options.processing.tool.length > 200
    || !jsonSafe(options.processing.parameters) || JSON.stringify(options.processing.parameters).length > 20000
    || typeof options.evidence !== 'string' || options.evidence.trim().length < 10 || options.evidence.length > 4000) throw new ImageBatchError('image_batch_invalid_postprocess');
  const statePath = resolve(options.statePath), lockPath = `${statePath}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked'); throw error; }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), operation: 'local-postprocess' }));
    const state = validateState(JSON.parse(await readFile(statePath, 'utf8')), plan), record = state.tasks[options.taskId];
    if (Object.values(state.tasks).some(item => ['running', 'unknown'].includes(item.status))) throw new ImageBatchError('image_batch_postprocess_requires_idle');
    if (!record || record.status !== 'succeeded' || !record.asset || record.review?.status !== 'needs_revision'
      || record.asset.contentHash !== options.expectedOutputHash || record.review.outputHash !== options.expectedOutputHash) throw new ImageBatchError('image_batch_postprocess_requires_rejected_asset');
    if (record.postprocessHistory?.length) throw new ImageBatchError('image_batch_postprocess_limit_reached');
    if (asset.contentHash === options.expectedOutputHash || resolve(asset.path) === resolve(record.asset.path)
      || resolve(asset.metadataPath) === resolve(record.asset.metadataPath) || asset.assetId === record.asset.assetId) throw new ImageBatchError('image_batch_postprocess_must_preserve_original');
    const descendants = new Set([options.taskId]);
    for (let changed = true; changed;) { changed = false;
      for (const item of plan.tasks) if (!descendants.has(item.id) && item.dependencies.some(id => descendants.has(id))) { descendants.add(item.id); changed = true; }
    }
    if ([...descendants].some(id => id !== options.taskId && (state.tasks[id].asset || state.tasks[id].correctionHistory?.length || state.tasks[id].postprocessHistory?.length))) throw new ImageBatchError('image_batch_postprocess_has_generated_dependents');
    for (const task of plan.tasks) for (const reference of task.references) if ((await fileReference(reference.path)).evidence.contentHash !== reference.contentHash) throw new ImageBatchError('image_batch_reference_changed');
    if ((await fileReference(options.source.path)).evidence.contentHash !== options.source.contentHash) throw new ImageBatchError('image_batch_reference_changed');
    const decode = async (value: ImageBatchAsset) => {
      const bytes = await verifiedAsset(value);
      const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 36_000_000 });
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) !== 1 || `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}` !== value.mimeType) throw new ImageBatchError('image_batch_postprocess_invalid_image');
      const { info } = await image.raw().toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height };
    };
    let oldSize, newSize;
    try { [oldSize, newSize] = await Promise.all([decode(record.asset), decode(asset)]); }
    catch (error) { if (error instanceof ImageBatchError) throw error; throw new ImageBatchError('image_batch_postprocess_invalid_image'); }
    if (oldSize.width !== newSize.width || oldSize.height !== newSize.height) throw new ImageBatchError('image_batch_postprocess_dimensions_changed');
    const history: ImageBatchPostprocess = { record: structuredClone(record), source: structuredClone(options.source), processing: structuredClone(options.processing),
      evidence: options.evidence.trim(), authorizedAt: new Date().toISOString(), outputHash: asset.contentHash, manifestHash: plan.manifestHash };
    const next = { ...record, asset: structuredClone(asset), postprocessHistory: [history] };
    delete next.review; delete next.requestId; delete next.diagnostics; delete next.error;
    state.tasks[options.taskId] = next;
    await saveState(statePath, state);
    return state;
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

/** One persistent state is one batch queue. Never resubmit running/unknown/failed
 * records automatically. The process-wide provider limiter also caps concurrent
 * requests from other batches or web sessions at four.
 */
export async function runImageBatch(plan: ImageBatchPlan, options: {
  provider: ImageProvider;
  statePath: string;
  concurrency?: number;
  reviewConcurrency?: number;
  onProgress?: (taskId: string, progress: ImageProgress) => void;
  signal?: AbortSignal;
  onChange?: (state: ImageBatchState) => void | Promise<void>;
  review?: (task: ImageBatchTask, record: ImageBatchRecord) => Promise<{ status: 'approved' | 'needs_revision'; evidence: string } | undefined>;
}): Promise<ImageBatchState> {
  const concurrency = options.concurrency ?? MAX_IMAGE_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_IMAGE_CONCURRENCY) throw new ImageBatchError('image_batch_invalid_concurrency');
  const reviewConcurrency = options.reviewConcurrency ?? 2;
  if (!Number.isInteger(reviewConcurrency) || reviewConcurrency < 1 || reviewConcurrency > MAX_IMAGE_CONCURRENCY) throw new ImageBatchError('image_batch_invalid_review_concurrency');
  const statePath = resolve(options.statePath), lockPath = `${statePath}.lock`;
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ImageBatchError('image_batch_state_locked');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    let state: ImageBatchState;
    try { state = validateState(JSON.parse(await readFile(statePath, 'utf8')), plan); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state = { version: 1, manifestHash: plan.manifestHash, updatedAt: new Date().toISOString(),
        tasks: Object.fromEntries(plan.tasks.map(task => [task.id, { status: 'pending' }])) };
    }
    const save = async () => {
      await saveState(statePath, state);
      try { await options.onChange?.(structuredClone(state)); } catch { /* An observer cannot fail or repeat paid work. */ }
    };
    for (const record of Object.values(state.tasks)) {
      if (record.status === 'running') { record.status = 'unknown'; record.error = 'image_batch_interrupted_unknown'; }
      if (record.status === 'waiting_capacity') record.status = 'pending';
      if (record.status === 'succeeded') await verifiedAsset(record.asset!);
    }
    reopenResolvedDependencies(state, plan);
    await save();
    const active = new Map<string, Promise<{ id: string; record: ImageBatchRecord }>>();
    const activeReviews = new Map<string, Promise<{ reviewId: string; review?: ImageBatchRecord['review']; error?: string }>>();
    const reviewedThisRun = new Set<string>();
    const execute = async (task: ImageBatchTask): Promise<{ id: string; record: ImageBatchRecord }> => {
      const references = [...task.references];
      let submitted = false;
      try {
        const dataUrls: string[] = [];
        for (const reference of task.references) {
          const current = await fileReference(reference.path);
          if (current.evidence.contentHash !== reference.contentHash) throw new ImageBatchError('image_batch_reference_changed');
          dataUrls.push(current.dataUrl);
        }
        for (const id of task.referenceTasks) {
          const asset = state.tasks[id].asset!;
          dataUrls.push(referenceDataUrl(await verifiedAsset(asset)));
          references.push({ source: 'task', taskId: id, path: asset.path, contentHash: asset.contentHash });
        }
        validateImageRequest({ ...task.request, references: dataUrls });
        if (options.signal?.aborted) return { id: task.id, record: { status: 'pending', references } };
        submitted = true;
        const asset = await options.provider.generate({ ...task.request, references: dataUrls }, progress => {
          try { options.onProgress?.(task.id, progress); } catch { /* Observers cannot repeat or fail paid work. */ }
        });
        if (state.tasks[task.id].retryHistory?.some(entry => entry.record.requestId && entry.record.requestId === asset.requestId)) {
          throw new ImageBatchError('image_batch_retry_request_id_reused');
        }
        const corrections = state.tasks[task.id].correctionHistory ?? [];
        if (corrections.some(entry => !asset.requestId || [entry.record.requestId, entry.record.asset?.generationStatus === 'succeeded' ? entry.record.asset.requestId : undefined].includes(asset.requestId))) {
          throw new ImageProviderError('image_batch_correction_request_id_reused', 'unknown', asset.requestId ?? null);
        }
        if (corrections.some(entry => entry.record.asset?.path === asset.path || entry.record.asset?.assetId === asset.assetId)) {
          throw new ImageProviderError('image_batch_correction_asset_reused', 'unknown', asset.requestId);
        }
        for (const entry of corrections) await verifiedAsset(entry.record.asset!);
        await verifiedAsset(asset);
        return { id: task.id, record: { status: 'succeeded', references, asset } };
      } catch (error) {
        const correctionReused = error instanceof ImageProviderError && error.requestId
          && state.tasks[task.id].correctionHistory?.some(entry => [entry.record.requestId, entry.record.asset?.generationStatus === 'succeeded' ? entry.record.asset.requestId : undefined].includes(error.requestId));
        const reusedRequestId = error instanceof ImageProviderError && error.requestId
          && (state.tasks[task.id].retryHistory?.some(entry => entry.record.requestId === error.requestId) || correctionReused);
        const status = reusedRequestId ? 'unknown' : error instanceof ImageProviderError && error.code === 'image_provider_waiting_capacity' ? 'waiting_capacity'
          : error instanceof ImageProviderError ? error.generationStatus : submitted ? 'unknown' : 'failed';
        return { id: task.id, record: { status, references,
          error: reusedRequestId ? correctionReused ? 'image_batch_correction_request_id_reused' : 'image_batch_retry_request_id_reused'
            : error instanceof ImageProviderError ? error.code : error instanceof ImageBatchError ? error.message : 'image_batch_task_error',
          ...(error instanceof ImageProviderError ? { requestId: error.requestId, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) } : {}) } };
      }
    };
    const review = async (task: ImageBatchTask, record: ImageBatchRecord) => {
      try {
        const result = await options.review!(task, structuredClone(record));
        if (!result) return { reviewId: task.id };
        if (!['approved', 'needs_revision'].includes(result.status) || typeof result.evidence !== 'string'
          || result.evidence.trim().length < 10 || result.evidence.length > 4000) throw new ImageBatchError('image_batch_invalid_review');
        await verifiedAsset(record.asset!);
        return { reviewId: task.id, review: { ...result, outputHash: record.asset!.contentHash, reviewedAt: new Date().toISOString() } };
      } catch { return { reviewId: task.id, error: 'image_batch_review_unavailable' }; }
    };
    try {
      for (;;) {
        // Bound review admission separately from generation. Shared outputs that
        // an unsubmitted image actually needs as references go ahead of queued
        // decorative outputs; ordinary ordering dependencies need no image review.
        // Succeeded records are the durable queue, so pause/restart needs no new state.
        if (options.review && !options.signal?.aborted) {
          const neededReferences = new Set(plan.tasks
            .filter(task => ['pending', 'waiting_review', 'waiting_capacity'].includes(state.tasks[task.id].status))
            .flatMap(task => task.referenceTasks));
          const readyReviews = plan.tasks.filter(task => {
            const record = state.tasks[task.id];
            return record.status === 'succeeded' && !record.review && !reviewedThisRun.has(task.id);
          }).sort((a, b) => Number(neededReferences.has(b.id)) - Number(neededReferences.has(a.id)))
            .slice(0, Math.max(0, reviewConcurrency - activeReviews.size));
          for (const task of readyReviews) {
            if (options.signal?.aborted) break;
            reviewedThisRun.add(task.id); activeReviews.set(task.id, review(task, state.tasks[task.id]));
          }
        }
        // Propagate blocked dependencies without spending a generation slot.
        let changed = false;
        do {
          changed = false;
          for (const task of plan.tasks) {
            if (['pending', 'waiting_review'].includes(state.tasks[task.id].status) && task.dependencies.some(id => ['failed', 'unknown', 'blocked'].includes(state.tasks[id].status))) {
              replaceRecord(state, task.id, { status: 'blocked', error: 'image_batch_dependency_unavailable' }); changed = true;
            }
          }
        } while (changed);
        for (const task of plan.tasks) {
          if (!['pending', 'waiting_review'].includes(state.tasks[task.id].status)) continue;
          const reviewDependencies = new Set([...task.referenceTasks, ...task.dependencies.filter(id => state.tasks[id].correctionHistory?.length || state.tasks[id].postprocessHistory?.length)]);
          const reviewMissing = [...reviewDependencies].some(id => {
            const upstream = state.tasks[id];
            return upstream.status === 'succeeded' && (upstream.review?.status !== 'approved'
              || upstream.review.outputHash !== upstream.asset!.contentHash);
          });
          replaceRecord(state, task.id, reviewMissing ? { status: 'waiting_review', error: 'image_batch_reference_review_required' } : { status: 'pending' });
        }
        do {
          changed = false;
          for (const task of plan.tasks) {
            if (state.tasks[task.id].status === 'pending' && task.dependencies.some(id => state.tasks[id].status === 'waiting_review')) {
              replaceRecord(state, task.id, { status: 'waiting_review', error: 'image_batch_dependency_waiting_review' }); changed = true;
            }
          }
        } while (changed);
        const unknownCount = Object.values(state.tasks).filter(record => record.status === 'unknown').length;
        const ready = options.signal?.aborted ? [] : plan.tasks.filter(task => state.tasks[task.id].status === 'pending'
          && task.dependencies.every(id => state.tasks[id].status === 'succeeded')).slice(0, Math.max(0, concurrency - active.size - unknownCount));
        for (const task of ready) replaceRecord(state, task.id, { status: 'running', references: [...task.references,
          ...task.referenceTasks.map(id => ({ source: 'task' as const, taskId: id, path: state.tasks[id].asset!.path,
            contentHash: state.tasks[id].asset!.contentHash }))] });
        // Persist intent BEFORE launch, so an interrupted process never mistakes
        // a potentially submitted paid request for a fresh pending task.
        if (!ready.length && !active.size && !activeReviews.size && !options.signal?.aborted) {
          for (const record of Object.values(state.tasks)) if (record.status === 'pending') {
            record.status = 'waiting_capacity'; record.error = 'image_batch_unknown_capacity_reserved';
          }
        }
        await save();
        for (const task of ready) {
          if (options.signal?.aborted) replaceRecord(state, task.id, { status: 'pending' });
          else active.set(task.id, execute(task));
        }
        if (ready.length && options.signal?.aborted) await save();
        if (!active.size && !activeReviews.size) break;
        const completed = await Promise.race([...active.values(), ...activeReviews.values()]);
        if ('reviewId' in completed) {
          activeReviews.delete(completed.reviewId);
          if (completed.review) { state.tasks[completed.reviewId].review = completed.review; delete state.tasks[completed.reviewId].error; }
          if (completed.error) state.tasks[completed.reviewId].error = completed.error;
        } else {
          active.delete(completed.id);
          replaceRecord(state, completed.id, completed.record);
        }
      }
      return state;
    } finally {
      // If journaling fails, let existing work finish without releasing the batch
      // lock early. Durable running entries then require outcome reconciliation.
      await Promise.allSettled([...active.values(), ...activeReviews.values()]);
    }
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
