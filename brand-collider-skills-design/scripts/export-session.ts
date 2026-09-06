import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import type { Session, RuntimeInfo } from '../src/collider-types.ts';
import type { AutomaticMediaState } from '../src/automation-types.ts';
import type { VisualReference, DiscoveredReferencePage } from '../src/visual-reference.ts';
import type { ImageBatchAsset, ImageBatchRecord, ImageBatchState } from '../src/providers/image-batch.ts';

const execute = promisify(execFile);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const sessionPattern = /^session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const stages = ['profile-a', 'profile-b', 'ideation-a', 'ideation-b', 'design-a', 'design-b', 'copy-a', 'visual-b', 'review-a'];
const inside = (root: string, path: string) => path.startsWith(root + sep);
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
async function canonicalTarget(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    return join(await canonicalTarget(dirname(path)), basename(path));
  }
}
type StageRecord = { key: string; revision: number; skillDigest: string; result: { section: string; verdict?: string; [key: string]: unknown } };
type Snapshot = { schemaVersion: number; session: Session; records: StageRecord[]; pins: RuntimeInfo['skills']; productionDraftAmendments?: Record<string, unknown>[] };
type MediaSaved = { version: number; state: AutomaticMediaState; references: VisualReference[]; discoveredPages?: DiscoveredReferencePage[];
  batch?: ImageBatchState; preparationHash?: string; manifestHash?: string; preparation?: unknown; sourceInheritance?: Record<string, unknown> };
type Entry = { path: string; sha256: string; bytes: number; kind: string; sourceSha256?: string };
export type ExportOptions = { sessionId: string; outputDir: string; outputsDir?: string; imageDir?: string };

/** Local, offline export. Only registered files under explicitly chosen storage
 * roots are readable; no runtime initialization, environment loading or network. */
export async function exportSession(options: ExportOptions) {
  if (!sessionPattern.test(options.sessionId)) throw new Error('export_invalid_session_id');
  const outputs = resolve(options.outputsDir ?? 'outputs');
  const sessions = join(outputs, 'sessions');
  const images = resolve(options.imageDir ?? join(outputs, 'images'));
  const output = resolve(options.outputDir), archive = `${output}.zip`;
  const canonicalOutput = await canonicalTarget(output), canonicalOutputs = await realpath(outputs);
  const sourceRoots = await Promise.all([sessions, images, join(outputs, 'grok-agents'), join(outputs, 'cli-agents')].map(canonicalTarget));
  if (canonicalOutput === canonicalOutputs || inside(canonicalOutput, canonicalOutputs) || sourceRoots
    .some(root => canonicalOutput === root || inside(root, canonicalOutput) || inside(canonicalOutput, root))) throw new Error('export_output_overlaps_source');
  const sourceSnapshots = new Map<string, string>();

  async function checkedPath(root: string, path: string) {
    const target = resolve(path);
    if (!inside(root, target)) throw new Error('export_path_outside_registered_root');
    // Reject symlinked parents as well as the final file. Do not follow a saved
    // path through another session, credential directory, or external volume.
    let current = root;
    if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error('export_unsafe_source_root');
    for (const part of relative(root, target).split(sep)) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('export_symlink_rejected');
    }
    return target;
  }
  async function read(root: string, path: string, maximum = 50 * 1024 * 1024) {
    const target = await checkedPath(root, path);
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > maximum) throw new Error('export_invalid_file');
      const bytes = await file.readFile();
      if (bytes.length > maximum) throw new Error('export_invalid_file');
      return bytes;
    } finally { await file.close(); }
  }
  async function snapshot(root: string, path: string) {
    const bytes = await read(root, path, 16 * 1024 * 1024);
    sourceSnapshots.set(path, digest(bytes));
    return JSON.parse(bytes.toString('utf8'));
  }
  const sessionPath = join(sessions, `${options.sessionId}.json`);
  const saved = await snapshot(outputs, sessionPath) as Snapshot;
  const session = saved.session;
  if (saved.schemaVersion !== 1 || session?.id !== options.sessionId || !Number.isInteger(session.revision) || session.revision < 1
    || !Array.isArray(saved.records) || !Array.isArray(saved.pins) || !Array.isArray(session.messages)) throw new Error('export_invalid_session_snapshot');
  if (session.status === 'running' || session.messages.some(message => message.revision === session.revision && message.execution?.state === 'running')) {
    throw new Error('export_session_still_running');
  }
  const mediaRoot = join(sessions, session.id, 'media', `v${session.revision}`);
  let media: MediaSaved | undefined;
  const issues: string[] = [];
  const issue = (value: string) => { if (!issues.includes(value)) issues.push(value); };
  if (session.autoProduce) {
    try { media = await snapshot(outputs, join(mediaRoot, 'automation.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue('当前版缺少已保存的素材状态。'); }
    if (media && (media.version !== 1 || media.state?.sessionId !== session.id || media.state.revision !== session.revision
      || !Array.isArray(media.references) || !Array.isArray(media.state.materials))) throw new Error('export_media_revision_mismatch');
    if (media && ['collecting', 'binding', 'generating', 'reviewing'].includes(media.state.phase)) throw new Error('export_media_still_running');
    if (media && JSON.stringify(media.state) !== JSON.stringify(session.automation)) throw new Error('export_media_snapshot_not_synchronized');
  } else issue('此会话没有逐件自动制作记录；不能作为完整物料包验收。');
  // Reserve a new destination, never replace an earlier package.
  await mkdir(dirname(output), { recursive: true });
  for (const path of [output, archive, `${archive}.sha256`]) {
    try { await lstat(path); throw new Error('export_destination_exists'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  await mkdir(output, { mode: 0o700 });
  const temporaryZip = join(dirname(output), `.export-${randomUUID()}.zip`);
  const entries: Entry[] = [];
  const pathMap = new Map<string, string>();
  let totalBytes = 0, archiveCreated = false;
  try {
    async function put(path: string, bytes: string | Buffer, kind: string, sourceSha256?: string) {
      if (isAbsolute(path) || path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('export_invalid_package_path');
      const data = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
      totalBytes += data.length;
      if (totalBytes > 512 * 1024 * 1024) throw new Error('export_package_too_large');
      await mkdir(dirname(join(output, path)), { recursive: true, mode: 0o700 });
      await writeFile(join(output, path), data, { flag: 'wx', mode: 0o600 });
      entries.push({ path, bytes: data.length, sha256: digest(data), kind, ...(sourceSha256 ? { sourceSha256 } : {}) });
      return path;
    }
    async function copy(root: string, source: string, destination: string, kind: string, expected: string, raster = false) {
      if (!shaPattern.test(expected)) throw new Error('export_missing_registered_hash');
      const bytes = await read(root, source);
      if (digest(bytes) !== expected) throw new Error('export_registered_hash_mismatch');
      if (raster) {
        const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: 36_000_000 });
        const metadata = await decoder.metadata();
        if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('export_invalid_raster');
        await decoder.stats();
      }
      pathMap.set(resolve(source), destination);
      return put(destination, bytes, kind);
    }
    function portable(value: unknown): unknown {
      if (typeof value === 'string' && isAbsolute(value) && pathMap.has(resolve(value))) return pathMap.get(resolve(value));
      if (Array.isArray(value)) return value.map(portable);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
        ['path', 'localPath', 'metadataPath', 'sourcePath', 'sourcePagePath', 'manifestPath'].includes(key) && typeof child === 'string'
          ? pathMap.get(resolve(child)) ?? '[local path not included]' : portable(child)]));
      return value;
    }
    async function evidenceJson(root: string, source: string, destination: string, validate?: (value: Record<string, unknown>) => boolean) {
      const bytes = await read(root, source, 16 * 1024 * 1024);
      const value = JSON.parse(bytes.toString('utf8'));
      if (validate && !validate(value)) throw new Error('export_metadata_identity_mismatch');
      await put(destination, json(portable(value)), 'evidence', digest(bytes));
    }
    function assetMetadataMatches(value: Record<string, unknown>, asset: ImageBatchAsset) {
      if (value.assetId !== asset.assetId || value.contentHash !== asset.contentHash || value.generationStatus !== asset.generationStatus) return false;
      if (asset.generationStatus === 'postprocessed') {
        const paidFields = ['requestId', 'model', 'responsesModel', 'providerRequestId', 'providerResponseId'];
        return asset.kind === 'local-postprocess' && value.kind === 'local-postprocess'
          && !paidFields.some(key => key in asset || key in value);
      }
      return value.requestId === asset.requestId;
    }
    async function historicalAsset(asset: ImageBatchAsset, destination: string) {
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[asset.mimeType];
      if (!/^image-[a-f0-9-]{36}$/.test(asset.assetId) || !extension
        || asset.path !== join(images, asset.assetId, `image.${extension}`)
        || asset.metadataPath !== join(images, asset.assetId, 'asset.json')) throw new Error('export_history_asset_path_mismatch');
      if (!pathMap.has(resolve(asset.path))) {
        await copy(images, asset.path, `${destination}/image.${extension}`, 'image-history', asset.contentHash, true);
        pathMap.set(asset.metadataPath, `${destination}/asset.json`);
        await evidenceJson(images, asset.metadataPath, `${destination}/asset.json`, value => assetMetadataMatches(value, asset));
      }
    }
    async function nestedCorrectionHistory(record: ImageBatchRecord, destination: string, depth = 0) {
      if (depth > 8) throw new Error('export_history_too_deep');
      for (const [index, correction] of (record.correctionHistory ?? []).entries()) {
        const asset = correction.record.asset;
        if (!asset || correction.record.review?.status !== 'needs_revision'
          || correction.record.review.outputHash !== asset.contentHash) throw new Error('export_invalid_correction_history');
        await historicalAsset(asset, `${destination}/corrections/attempt-${index + 1}`);
        await nestedCorrectionHistory(correction.record, `${destination}/corrections/attempt-${index + 1}`, depth + 1);
      }
    }
    const records = saved.records.filter(record => stages.includes(record.key));
    for (const record of records) {
      if (!Number.isInteger(record.revision) || record.revision > session.revision || record.revision < 1) throw new Error('export_invalid_record_revision');
      await put(`stages/${record.key}.md`, `# ${record.key}\n\n原成果版本：${record.revision}\n\n${record.result.section}\n`, 'stage');
    }
    for (const key of stages) if (!records.some(record => record.key === key)) issue(`缺少主阶段成果：${key}。`);
    const copyStage = records.find(record => record.key === 'copy-a');
    if (copyStage) await put('copy.md', copyStage.result.section + '\n', 'copy');
    const finalReview = records.find(record => record.key === 'review-a');
    if (finalReview) await put('review.md', finalReview.result.section + '\n', 'review');
    const plan = session.proposal?.materialPlan, visuals = session.proposal?.materialVisuals;
    await put('material-plan.json', json(plan ?? null), 'plan');
    await put('material-visuals.json', json(visuals ?? []), 'visual-plan');
    if (!plan?.items.length) issue('缺少逐件物料计划。');
    for (const item of plan?.items ?? []) if (!visuals?.some(visual => visual.materialId === item.id && visual.prompt.trim())) issue(`缺少逐件视觉提示词：${item.id}。`);
    for (const pin of saved.pins) {
      if (!idPattern.test(pin.id) || digest(pin.content) !== pin.digest) throw new Error('export_skill_snapshot_hash_mismatch');
      await put(`skills/${pin.id}.md`, pin.content, 'skill', pin.digest);
    }
    if (saved.pins.length !== 6) issue('原始 Skill 快照不完整。');
    await put('skills/index.json', json(saved.pins.map(({ content: _content, ...pin }) => pin)), 'skill-index');
    const referenceFiles: Record<string, string> = {};
    for (const reference of media?.references ?? []) {
      if (!idPattern.test(reference.referenceId)) throw new Error('export_invalid_reference_id');
      const sourceRoot = join(mediaRoot, 'references', reference.referenceId);
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[reference.mimeType];
      if (!extension) throw new Error('export_invalid_reference_mime');
      // The host's fixed filenames, not arbitrary paths embedded in metadata.
      const sourceImage = join(sourceRoot, `reference.${extension}`), sourcePage = join(sourceRoot, 'source.html');
      if (reference.localPath !== sourceImage || reference.sourcePagePath !== sourcePage || reference.metadataPath !== join(sourceRoot, 'reference.json')) {
        throw new Error('export_reference_path_mismatch');
      }
      try {
        referenceFiles[reference.referenceId] = await copy(outputs, sourceImage, `references/${reference.referenceId}/original.${extension}`, 'reference-image', reference.contentHash, true);
        await copy(outputs, sourcePage, `references/${reference.referenceId}/source.html`, 'source-page', reference.sourcePageContentHash);
        pathMap.set(reference.metadataPath, `references/${reference.referenceId}/reference.json`);
        await evidenceJson(outputs, reference.metadataPath, `references/${reference.referenceId}/reference.json`, value =>
          value.referenceId === reference.referenceId && value.contentHash === reference.contentHash && value.sourcePageContentHash === reference.sourcePageContentHash);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        issue(`来源原件或来源页缺失：${reference.referenceId}。`);
      }
    }
    for (const [index, page] of (media?.discoveredPages ?? []).entries()) {
      if (!inside(join(mediaRoot, 'source-pages'), resolve(page.sourcePagePath)) || basename(page.sourcePagePath) !== 'source.html') throw new Error('export_discovery_path_mismatch');
      try { await copy(outputs, page.sourcePagePath, `source-pages/page-${index + 1}.html`, 'source-page', page.sourcePageContentHash); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue(`检索来源页原件缺失：${index + 1}。`); }
    }
    const materials = [];
    for (const item of media?.state.materials ?? []) {
      if (!idPattern.test(item.materialId)) throw new Error('export_invalid_material_id');
      const record = media?.batch?.tasks[item.materialId];
      let file: string | undefined;
      if (record?.asset) {
        const asset = record.asset;
        if (!/^image-[a-f0-9-]{36}$/.test(asset.assetId)) throw new Error('export_invalid_asset_id');
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[asset.mimeType];
        if (!extension || asset.path !== join(images, asset.assetId, `image.${extension}`) || asset.metadataPath !== join(images, asset.assetId, 'asset.json')) {
          throw new Error('export_asset_path_mismatch');
        }
        if (asset.contentHash !== item.outputHash) throw new Error('export_material_hash_mismatch');
        try {
          file = await copy(images, asset.path, `materials/${item.materialId}.${extension}`,
            asset.generationStatus === 'postprocessed' ? 'local-postprocess-image' : 'generated-image', asset.contentHash, true);
          pathMap.set(asset.metadataPath, `evidence/assets/${item.materialId}.json`);
          await evidenceJson(images, asset.metadataPath, `evidence/assets/${item.materialId}.json`, value =>
            assetMetadataMatches(value, asset));
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue(`产图或生成元数据缺失：${item.materialId}。`); }
      }
      for (const [index, correction] of (record?.correctionHistory ?? []).entries()) {
        const historical = correction.record.asset;
        if (!historical || correction.record.review?.status !== 'needs_revision'
          || correction.record.review.outputHash !== historical.contentHash) throw new Error('export_invalid_correction_history');
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[historical.mimeType];
        if (!/^image-[a-f0-9-]{36}$/.test(historical.assetId) || !extension
          || historical.path !== join(images, historical.assetId, `image.${extension}`)
          || historical.metadataPath !== join(images, historical.assetId, 'asset.json')) throw new Error('export_correction_asset_path_mismatch');
        const destination = `evidence/corrections/${item.materialId}/attempt-${index + 1}`;
        try {
          await copy(images, historical.path, `${destination}/image.${extension}`, 'rejected-image-history', historical.contentHash, true);
          pathMap.set(historical.metadataPath, `${destination}/asset.json`);
          await evidenceJson(images, historical.metadataPath, `${destination}/asset.json`, value =>
            assetMetadataMatches(value, historical));
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue(`纠正前的真实产图或元数据缺失：${item.materialId}。`); }
      }
      if (record?.asset?.generationStatus === 'postprocessed' && record.postprocessHistory?.length !== 1) throw new Error('export_missing_postprocess_history');
      for (const [index, history] of (record?.postprocessHistory ?? []).entries()) {
        const prior = history.record.asset;
        const source = media?.references.find(reference => reference.localPath === history.source.path
          && reference.contentHash === history.source.contentHash && reference.sourceClass === 'official');
        if (!prior || !history.record.review || history.record.review.outputHash !== prior.contentHash
          || history.outputHash !== record?.asset?.contentHash || !source || history.source.source !== 'file'
          || !history.processing?.tool || !history.processing.parameters || !history.evidence || !history.authorizedAt) throw new Error('export_invalid_postprocess_history');
        const destination = `audit/postprocess/${item.materialId}/operation-${index + 1}`;
        try {
          await historicalAsset(prior, destination);
          await nestedCorrectionHistory(history.record, destination);
          const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[source.mimeType];
          await copy(outputs, source.localPath, `${destination}/source.${extension}`, 'postprocess-official-source', source.contentHash, true);
          await put(`${destination}/review.json`, json(history.record.review), 'postprocess-prior-review');
          await put(`${destination}/processing.json`, json(portable({ ...history.processing, authorizedAt: history.authorizedAt,
            sourceHash: source.contentHash, inputHash: prior.contentHash, outputHash: history.outputHash, evidence: history.evidence })), 'postprocess-operation');
          await put(`${destination}/history.json`, json(portable(history)), 'postprocess-history');
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue(`本地后期原图、官方来源或处理证据缺失：${item.materialId}。`); }
      }
      const approved = item.status === 'approved' && !!file && !!item.outputHash && item.review?.status === 'approved'
        && item.review.outputHash === item.outputHash && record?.review?.outputHash === item.outputHash && record.review.status === 'approved';
      if (item.status !== 'out_of_scope' && !approved) issue(`未完成已检查的实际交付：${item.materialId}（${item.status}）。`);
      if (item.status !== 'out_of_scope' && (!item.binding || item.binding.status !== 'ready')) issue(`缺少有效参考绑定：${item.materialId}。`);
      for (const referenceId of item.binding?.referenceIds ?? []) if (!referenceFiles[referenceId]) issue(`绑定参考原件未进入导出包：${item.materialId}/${referenceId}。`);
      if (item.binding?.identityRequired) {
        const identities = item.binding.identityReferenceIds ?? [];
        if (!identities.length || identities.some(id => {
          const reference = media?.state.references.find(value => value.referenceId === id);
          const inspection = reference?.inspection;
          return !reference || !referenceFiles[id] || !inspection?.identityVerified || inspection.status !== 'verified'
            || inspection.imageHash !== reference.contentHash || inspection.sourcePageHash !== reference.sourcePageContentHash;
        })) issue(`准确身份来源证据不完整：${item.materialId}。`);
      }
      if (record?.asset && record.asset.generationStatus !== 'postprocessed'
        && (record.references?.length ?? 0) !== (record.asset.referenceInputs?.length ?? 0)) issue(`实际提交参考的数量证据不一致：${item.materialId}。`);
      for (const reference of record?.references ?? []) {
        const original = media?.references.find(value => value.localPath === reference.path && value.contentHash === reference.contentHash);
        const upstream = reference.taskId ? media?.batch?.tasks[reference.taskId] : undefined;
        const correctionInput = record?.correctionHistory?.some(entry => entry.record.asset?.path === reference.path
          && entry.record.asset.contentHash === reference.contentHash && entry.record.review?.status === 'needs_revision'
          && entry.record.review.outputHash === reference.contentHash && pathMap.has(resolve(reference.path)));
        const postprocessInput = record?.asset?.generationStatus === 'postprocessed' && record.postprocessHistory?.some(entry =>
          entry.record.asset?.path === reference.path && entry.record.asset.contentHash === reference.contentHash
          && entry.record.review?.outputHash === reference.contentHash && pathMap.has(resolve(reference.path)));
        if (reference.source === 'file' ? (!original || !referenceFiles[original.referenceId]) && !correctionInput && !postprocessInput
          : !upstream?.asset || upstream.asset.path !== reference.path || upstream.asset.contentHash !== reference.contentHash
            || upstream.review?.status !== 'approved' || upstream.review.outputHash !== reference.contentHash) issue(`实际附图无法对应已登记的来源或已通过共用图：${item.materialId}。`);
      }
      materials.push({ ...item, file: file ?? null, acceptedForDelivery: approved, design: plan?.items.find(value => value.id === item.materialId),
        productionKind: record?.asset?.generationStatus === 'postprocessed' ? 'local-postprocess' : record?.asset ? 'model-generation' : null,
        visual: visuals?.find(value => value.materialId === item.materialId) });
    }
    for (const item of plan?.items ?? []) if (!materials.some(value => value.materialId === item.id)) issue(`物料计划尚未进入实际制作状态：${item.id}。`);
    // Include only evidence files from this session's current or retained stage
    // revisions. Never copy a provider home, prompt/base64, auth or raw stdout.
    const revisions = new Set([session.revision, ...records.map(record => record.revision)]);
    const exportedRuns = new Set<string>();
    for (const transportRoot of ['grok-agents', 'cli-agents']) for (const revision of revisions) {
      const revisionRoot = join(outputs, transportRoot, session.id, `v${revision}`);
      let agents;
      try { agents = await readdir(await checkedPath(outputs, revisionRoot), { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; continue; }
      for (const agent of agents) {
        if (!agent.isDirectory() || !/^[a-z][a-z0-9-]{0,79}$/.test(agent.name)) continue;
        const agentRoot = join(revisionRoot, agent.name);
        for (const run of await readdir(await checkedPath(outputs, agentRoot), { withFileTypes: true })) {
          if (!run.isDirectory() || !uuidPattern.test(run.name)) continue;
          const runRoot = join(agentRoot, run.name), destination = `evidence/cli/${transportRoot}/v${revision}/${agent.name}/${run.name}`;
          const executionPath = join(runRoot, 'execution.json');
          let execution;
          try { execution = JSON.parse((await read(outputs, executionPath)).toString('utf8')); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; issue(`CLI 执行证据缺失：${agent.name}/${run.name}。`); continue; }
          if (execution.runId !== run.name || execution.revision !== revision || execution.agentId !== agent.name) throw new Error('export_cli_identity_mismatch');
          if (['running', 'starting'].includes(execution.state)) throw new Error('export_cli_still_running');
          const attachmentsPath = join(runRoot, 'attachments.json');
          try {
            const attachments = JSON.parse((await read(outputs, attachmentsPath)).toString('utf8'));
            if (!Array.isArray(attachments) || attachments.length > 12) throw new Error('export_invalid_cli_attachments');
            for (const attachment of attachments) {
              const name = basename(attachment.path);
              if (!/^attachment-[1-9]\d*-[a-f0-9]{16}\.(png|jpg|webp)$/.test(name) || attachment.path !== join(runRoot, name)) throw new Error('export_cli_attachment_path_mismatch');
              await copy(outputs, attachment.path, `${destination}/${name}`, 'cli-image-attachment', attachment.hash, true);
              if (attachment.sourcePath !== undefined || attachment.sourceHash !== undefined) {
                if (typeof attachment.sourcePath !== 'string' || !/^[a-f0-9]{64}$/.test(attachment.sourceHash ?? '')) throw new Error('export_invalid_cli_source_attachment');
                if (attachment.sourcePath === attachment.path) {
                  if (attachment.sourceHash !== attachment.hash) throw new Error('export_cli_source_hash_mismatch');
                } else {
                  const sourceName = basename(attachment.sourcePath);
                  if (!/^source-attachment-[1-9]\d*-[a-f0-9]{16}\.(png|jpg|webp)$/.test(sourceName)
                    || attachment.sourcePath !== join(runRoot, sourceName)) throw new Error('export_cli_source_attachment_path_mismatch');
                  await copy(outputs, attachment.sourcePath, `${destination}/${sourceName}`, 'cli-original-image', attachment.sourceHash, true);
                }
              }
            }
            await evidenceJson(outputs, attachmentsPath, `${destination}/attachments.json`);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            // A failed setup may never have prepared images. Preserve that
            // failed execution, but only successful inspections require a full
            // image evidence set; final delivery still checks current outcomes.
            if (execution.state === 'completed' && /^media-(reference-inspection|image-review)-/.test(agent.name)) issue(`CLI 真实看图附件缺失：${agent.name}/${run.name}。`);
          }
          for (const name of ['execution.json', 'result.json', 'discovery-evidence.json', 'research-evidence.json', 'diagnostics.json']) {
            try { await evidenceJson(outputs, join(runRoot, name), `${destination}/${name}`); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
              if (name === 'result.json' && execution.state === 'completed') issue(`已完成 CLI 的结构化结果缺失：${agent.name}/${run.name}。`);
            }
          }
          exportedRuns.add(run.name);
        }
      }
    }
    for (const message of session.messages) if (message.execution && revisions.has(message.execution.revision)
      && ['grok-cli', 'codex-cli'].includes(message.execution.transport) && !exportedRuns.has(message.execution.runId)) issue(`会话引用的 CLI 证据未找到：${message.execution.runId}。`);
    if (media?.batch) await put('evidence/batch-state.json', json(portable(media.batch)), 'batch-state');
    if (media) {
      try {
        const manifestPath = join(mediaRoot, 'material-jobs.json');
        const manifest = JSON.parse((await read(outputs, manifestPath)).toString('utf8'));
        for (const task of manifest.tasks ?? []) task.references = (task.references ?? []).map((path: string) => pathMap.get(resolve(path)) ?? '[reference not included]');
        await put('evidence/material-jobs.json', json(manifest), 'execution-manifest');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; if (materials.some(item => item.file)) issue('缺少生成任务清单。'); }
      await put('evidence/media.json', json(portable({ state: media.state, preparationHash: media.preparationHash, manifestHash: media.manifestHash,
        references: media.references, discoveredPages: media.discoveredPages, sourceInheritance: media.sourceInheritance })), 'media-evidence');
    }
    if (!materials.some(item => item.status !== 'out_of_scope')) issue('当前没有进入制作范围的物料。');
    if (session.status !== 'completed' || media?.state.phase !== 'completed') issue('当前会话或逐件制作尚未全部完成。');
    if (finalReview?.revision !== session.revision || finalReview?.result.verdict !== 'pass' || session.proposal?.reviewStatus !== 'passed') issue('当前版最终总审尚未通过。');
    const complete = issues.length === 0;
    const portableSession = { id: session.id, title: session.title, revision: session.revision, status: session.status, mode: session.mode, model: session.model,
      brands: session.brands, goal: session.goal, constraints: session.constraints, concepts: session.concepts, selectedConceptId: session.selectedConceptId,
      selectionSource: session.selectionSource, proposal: session.proposal, createdAt: session.createdAt, updatedAt: session.updatedAt };
    await put('session.json', json(portableSession), 'session');
    await put('evidence/stage-results.json', json(records), 'stage-results');
    if (saved.productionDraftAmendments?.length) {
      await put('evidence/production-draft-amendments.json', json(portable(saved.productionDraftAmendments)), 'draft-amendments');
    }
    await put('evidence/public-dialogue.json', json(session.messages), 'public-dialogue');
    await put('proposal.md', [`# ${session.title}`, 'AI 概念设计 · 非官方联名', `版本：${session.revision}\n\n${session.goal}`,
      `## 当前标准\n${session.constraints.map(value => `- ${value}`).join('\n')}`, ...(session.proposal?.sections ?? []).map(section => `## ${section.title}\n${section.content}`),
      `## 待确认\n${(session.proposal?.pendingConfirmations ?? []).map(value => `- ${value}`).join('\n')}`].join('\n\n') + '\n', 'proposal');
    await put('README.md', [`# ${session.title} · 物料导出`, `会话：${session.id} · 当前版本：${session.revision}`,
      complete ? '**当前制作范围的文件与已保存审查证据齐全。**' : '**部分导出，尚不能作为整套完成交付。**',
      '[完整方案](proposal.md) · [完整文案](copy.md) · [逐件设计](material-plan.json) · [完整提示词](material-visuals.json) · [最终总审](review.md) · [机器索引](manifest.json)',
      '## 实际物料', ...materials.map(item => `- ${item.name}（${item.materialId}）：${item.status} / ${item.acceptedForDelivery ? '已保存检查通过' : '未计为验收完成'}${item.productionKind === 'local-postprocess' ? '；本地后期（未新增模型生图请求）' : ''}${item.file ? `；[真实文件](${item.file})` : ''}`),
      '## 缺口与边界', ...(issues.length ? issues.map(value => `- ${value}`) : ['- 当前导出未发现缺件或记录哈希冲突。']),
      ...((media?.state.limitations ?? []).map(value => `- ${value}`)),
      '- 这是非官方概念效果图及其工作证据；机器检查不等于人工签署、品牌授权或生产认证。原始、模型提交后可能预处理的参考哈希分别记录，不能据此声称供应商完整采用参考。',
      '- 没有生成的可编辑设计源文件、刀版或视频不会伪造进包；这些不属于现有逐件概念图输出能力。',
      '- 来源网页 HTML 是原始证据，可能含网页脚本；建议以文本方式核对，不运行其中指令。',
      '- CLI 仅导出执行/结果/研究与素材网页执行证明/安全诊断/真实附件白名单；执行元数据完整保留。未复制提示词、ACP base64 文件、原始进程输出、环境或凭据。',
      '- evidence/material-jobs.json 与 batch-state.json 是可携带证据，路径已经改为包根相对路径，不是可直接重跑的付费批次。',
      '- 在包根运行 shasum -a 256 -c SHA256SUMS 可核验全部索引文件。'].join('\n\n') + '\n', 'index');
    await put('manifest.json', json({ schemaVersion: 'local-session-export-1.0', sessionId: session.id, revision: session.revision,
      exportedAt: new Date().toISOString(), status: complete ? 'complete' : 'partial', issues, sourceSessionHash: sourceSnapshots.get(sessionPath),
      sourceSnapshots: [...sourceSnapshots].map(([path, sha256]) => ({ path: relative(outputs, path).split(sep).join('/'), sha256 })),
      materials, referenceFiles, files: [...entries] }), 'manifest');
    await put('SHA256SUMS', entries.map(entry => `${entry.sha256}  ${entry.path}\n`).join(''), 'checksums');
    // A concurrent continue/revision invalidates this export; never combine two
    // versions or publish an intermediate copy as a finished package.
    for (const [path, expected] of sourceSnapshots) if (digest(await read(outputs, path, 16 * 1024 * 1024)) !== expected) throw new Error('export_source_changed_during_copy');
    await execute('zip', ['-q', '-r', temporaryZip, '.'], { cwd: output, timeout: 60000, maxBuffer: 1024 * 1024 });
    await chmod(temporaryZip, 0o600);
    for (const [path, expected] of sourceSnapshots) if (digest(await read(outputs, path, 16 * 1024 * 1024)) !== expected) throw new Error('export_source_changed_during_copy');
    await copyFile(temporaryZip, archive, constants.COPYFILE_EXCL); archiveCreated = true;
    const zipFile = await open(archive, 'r');
    let archiveHash: string;
    try { const hash = createHash('sha256'); for await (const chunk of zipFile.readableWebStream()) hash.update(Buffer.from(chunk)); archiveHash = hash.digest('hex'); }
    finally { await zipFile.close(); }
    await writeFile(`${archive}.sha256`, `${archiveHash}  ${basename(archive)}\n`, { flag: 'wx', mode: 0o600 });
    return { directory: output, archive, archiveHash, status: complete ? 'complete' as const : 'partial' as const, materials: materials.length,
      delivered: materials.filter(item => item.acceptedForDelivery).length, issues };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    if (archiveCreated) await rm(archive, { force: true });
    throw error;
  } finally { await rm(temporaryZip, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { session: { type: 'string' }, out: { type: 'string' }, outputs: { type: 'string' }, 'image-dir': { type: 'string' }, help: { type: 'boolean' } }, strict: true });
    if (values.help) console.log('Usage: node scripts/export-session.ts --session session-UUID --out /absolute/new-package [--outputs /absolute/outputs] [--image-dir /absolute/images]\nOffline only. Refuses active/changing sessions and existing destinations. Exports partial evidence honestly when deliverables are incomplete; prints status and gaps. Does not generate, retry or alter the session.');
    else {
      if (!values.session || !values.out) throw new Error('export_requires_session_and_out');
      console.log(json(await exportSession({ sessionId: values.session, outputDir: values.out, outputsDir: values.outputs, imageDir: values['image-dir'] })));
    }
  } catch (error) { console.error(error instanceof Error ? error.message : 'export_failed'); process.exitCode = 1; }
}
