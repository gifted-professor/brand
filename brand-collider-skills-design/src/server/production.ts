import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, isAbsolute, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ProductionAsset, ProductionLaneId, ProductionNode, ProductionNodeKind, ProductionProject, ProductionProjectSummary, ProductionStatus } from '../production-types.ts';
import type { ColliderRuntime } from './runtime.ts';
import { RuntimeError } from './text-provider.ts';

export const PRODUCTION_PROJECT_ID = 'manner-hok-20260905';
export const PRODUCTION_SOURCE_THREAD = '01a0705b-7ddf-7573-94ba-b1b03b838991';
type Data = Record<string, unknown>;
type FileRecord = { relativePath: string; mtimeMs: number; asset: ProductionAsset };
type FileResult = { handle: FileHandle; size: number; mtimeMs: number; path: string };
const data = (value: unknown): Data => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) ?? '';
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);
const inside = (root: string, path: string) => path.startsWith(root + sep);
const MIME: Record<string, [ProductionAsset['kind'], string]> = {
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'],
  '.webp': ['image', 'image/webp'], '.gif': ['image', 'image/gif'], '.avif': ['image', 'image/avif'],
  '.mp4': ['video', 'video/mp4'], '.m4v': ['video', 'video/mp4'], '.mov': ['video', 'video/quicktime'], '.webm': ['video', 'video/webm'],
  '.mp3': ['audio', 'audio/mpeg'], '.wav': ['audio', 'audio/wav'], '.ogg': ['audio', 'audio/ogg'], '.m4a': ['audio', 'audio/mp4'],
  '.md': ['document', 'text/markdown; charset=utf-8'], '.txt': ['document', 'text/plain; charset=utf-8'], '.json': ['document', 'application/json; charset=utf-8'],
  '.csv': ['document', 'text/csv; charset=utf-8'], '.pdf': ['document', 'application/pdf'], '.svg': ['document', 'image/svg+xml'],
  '.docx': ['document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.xlsx': ['document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], '.zip': ['archive', 'application/zip'],
};
const LANES: ProductionProject['lanes'] = [
  { id: 'strategy', label: '品牌与方向', description: '真实品牌依据、主方案与储备方向' },
  { id: 'story', label: '故事与文案', description: '故事母本、传播主线与字稿' },
  { id: 'materials', label: '产品与物料', description: '逐件设计、结构与各面展示' },
  { id: 'media', label: '视觉与传播', description: '真实图片、参考板与传播画面' },
  { id: 'video', label: '视频筹备', description: '脚本、分镜与实际媒体文件' },
  { id: 'review', label: '审查与交付', description: '保留真实审查结论与下载资料' },
];

function safeRelative(value: string) {
  if (!value || isAbsolute(value) || value.includes('\\') || value.includes('\0')) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..' && !part.startsWith('.')
    && !/(?:^|[._-])(?:env|keys?|secrets?|credentials?|logs?)(?:[._-]|$)/i.test(part))
    && !/(?:provider|request|response)(?:[-_.].*)?\.(?:json|txt|log)$/i.test(basename(value))
    && Boolean(MIME[extname(value).toLowerCase()]);
}
function materialState(item: Data, assets: ProductionAsset[]): [ProductionStatus, string] {
  const execution = text(item.executionStatus), review = text(item.reviewStatus);
  const reviewLabel = review === 'reviewed_with_limits' ? '已审阅·保留限制' : '审查未确认';
  if (execution === 'out_of_scope') return ['planned', '本轮不生成'];
  if (/failed|error/.test(execution)) return ['failed', '制作失败'];
  if (/needs_revision|rejected/.test(review)) return ['needs_revision', '需要修改'];
  if (/generating|running|drafting|in_progress/.test(execution)) return ['running', assets.length ? '制作中 · 已有阶段文件' : '制作中 · 等待文件'];
  if (assets.length) {
    const status = item.family === 'reference' ? 'reference' : 'available';
    return [status, `${execution === 'saved' ? '已保存 / ' : item.family === 'reference' ? '参考素材 · ' : '已有文件 · '}${reviewLabel}`];
  }
  if (/completed|available|succeeded|saved/.test(execution)) return ['unverified', '文件缺失或尚未写完'];
  return ['planned', '待制作'];
}
function familyKind(family: string): [ProductionNodeKind, ProductionLaneId] {
  if (family === 'story') return ['story', 'story'];
  if (family === 'physical') return ['material', 'materials'];
  if (family === 'campaign' || family === 'reference') return ['image', 'media'];
  if (family === 'video') return ['video', 'video'];
  if (family === 'audio') return ['audio', 'video'];
  if (family === 'video_prep' || family === 'storyboard') return ['document', 'video'];
  if (family === 'review') return ['review', 'review'];
  return ['document', 'materials'];
}
function materialFilePriority(file: Data, primaryFile = ''): number {
  const role = text(file.role), path = text(file.path), priority = text(file.priority);
  if (primaryFile && path === primaryFile) return -2;
  if (priority === 'appendix' || /(?:^|[\s_-])appendix(?:$|[\s_-])/i.test(role)) return 2;
  if (priority === 'primary') return -1;
  if (priority === 'supporting') return 1;
  const visual = ['image', 'video'].includes(MIME[extname(path).toLowerCase()]?.[0] ?? '');
  if (visual && (/^effects\//i.test(path) || /(?:^|[\s_-])(?:effects?|hero|render(?:ed|ing)?)(?:$|[\s_-])/i.test(role))) return 0;
  return 1;
}

/** Read-only adapter. Only this explicitly authorized project is exposed. */
export class ProductionRepository {
  readonly root: string;
  #jsonSnapshots = new Map<string, Data>();
  #registry = new Map<string, FileRecord>();
  #loading?: Promise<ProductionProject>;
  constructor(root: string) { this.root = resolve(root); }
  #assertProject(id: string) { if (id !== PRODUCTION_PROJECT_ID) throw new RuntimeError('未找到此制作项目。', 404); }
  async #open(relativePath: string): Promise<FileResult | undefined> {
    if (!safeRelative(relativePath)) return;
    let handle: FileHandle | undefined;
    try {
      const root = await realpath(this.root), target = resolve(root, relativePath);
      if (!inside(root, target)) return;
      const actual = await realpath(target);
      if (!inside(root, actual)) return;
      handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.size <= 0) { await handle.close(); return; }
      return { handle, size: info.size, mtimeMs: info.mtimeMs, path: actual };
    } catch { await handle?.close().catch(() => {}); return; }
  }
  async #read(relativePath: string, limit = 2 * 1024 * 1024): Promise<{ value: string; mtimeMs: number } | undefined> {
    const file = await this.#open(relativePath);
    if (!file) return;
    try {
      if (file.size > limit) return;
      const value = (await file.handle.readFile()).toString('utf8');
      if (value.includes('\uFFFD') || !value.trim()) return;
      return { value, mtimeMs: file.mtimeMs };
    } finally { await file.handle.close(); }
  }
  async #json(path: string, notes: Set<string>): Promise<Data> {
    const source = await this.#read(path);
    if (source) {
      try {
        const value = JSON.parse(source.value);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
        this.#jsonSnapshots.set(path, value);
        return value;
      } catch { /* A producer may be between truncate and write. */ }
    }
    if (this.#jsonSnapshots.has(path)) {
      notes.add(`${path} 正在写入或暂不可读，使用最近一次完整清单；文件可用性已重新核对。`);
      return this.#jsonSnapshots.get(path)!;
    }
    return {};
  }
  async #asset(path: string, registry: Map<string, FileRecord>, notes: Set<string>, dimensions?: Data): Promise<ProductionAsset | undefined> {
    const file = await this.#open(path);
    if (!file) return;
    try {
      const extension = extname(path).toLowerCase(), [kind, mimeType] = MIME[extension];
      const header = Buffer.alloc(Math.min(64, file.size)), tail = Buffer.alloc(Math.min(12, file.size));
      await file.handle.read(header, 0, header.length, 0);
      await file.handle.read(tail, 0, tail.length, file.size - tail.length);
      let valid = true, width: number | undefined, height: number | undefined;
      if (extension === '.png') {
        valid = header.length >= 24 && header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          && header.toString('ascii', 12, 16) === 'IHDR' && tail.toString('ascii', 4, 8) === 'IEND';
        if (valid) { width = header.readUInt32BE(16); height = header.readUInt32BE(20); valid = width > 0 && height > 0; }
      } else if (extension === '.jpg' || extension === '.jpeg') valid = header[0] === 255 && header[1] === 216 && tail.at(-2) === 255 && tail.at(-1) === 217;
      else if (extension === '.webp') valid = header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' && header.readUInt32LE(4) + 8 <= file.size;
      else if (extension === '.gif') valid = /^GIF8[79]a/.test(header.toString('ascii')) && tail.at(-1) === 0x3b;
      else if (['.mp4', '.m4v', '.mov', '.m4a', '.avif'].includes(extension)) valid = header.toString('ascii', 4, 8) === 'ftyp' && header.readUInt32BE(0) <= file.size;
      else if (extension === '.webm') valid = header.subarray(0, 4).equals(Buffer.from([26,69,223,163]));
      else if (extension === '.wav') valid = header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE';
      else if (extension === '.ogg') valid = header.toString('ascii', 0, 4) === 'OggS';
      else if (extension === '.mp3') valid = header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 255 && (header[1] & 0xe0) === 0xe0);
      else if (extension === '.pdf') valid = header.toString('ascii', 0, 5) === '%PDF-';
      else if (['.zip', '.docx', '.pptx', '.xlsx'].includes(extension)) valid = header.toString('ascii', 0, 2) === 'PK';
      else if (extension === '.svg') {
        // SVG remains an attachment, never an inline image or imported text context.
        const svgHead = Buffer.alloc(Math.min(8192, file.size));
        await file.handle.read(svgHead, 0, svgHead.length, 0);
        valid = file.size <= 64 * 1024 * 1024 && /<svg(?:\s|>)/i.test(svgHead.toString('utf8'));
      }
      else {
        if (file.size > 2 * 1024 * 1024) valid = false;
        else {
          const content = await file.handle.readFile();
          valid = content.toString('utf8').trim().length > 0 && !content.toString('utf8').includes('\uFFFD');
          if (valid && extension === '.json') { try { JSON.parse(content.toString('utf8')); } catch { valid = false; } }
        }
      }
      if (!valid) { notes.add(`${path} 文件尚未完整或格式无效，未作为可用素材。`); return; }
      const id = `asset-${fingerprint(path)}`, url = `/api/production/projects/${PRODUCTION_PROJECT_ID}/assets/${id}?v=${file.mtimeMs}-${file.size}`;
      let sha256: string | undefined;
      if (extension !== '.svg' && typeof dimensions?.sha256 === 'string' && file.size <= 64 * 1024 * 1024) {
        const bytes = Buffer.alloc(file.size); await file.handle.read(bytes, 0, file.size, 0);
        sha256 = createHash('sha256').update(bytes).digest('hex');
        if (sha256 !== dimensions.sha256) notes.add(`${path} 内容已变化，当前文件哈希与清单不同。`);
      }
      // Dimensions are read from actual PNG bytes; unverified metadata cannot override them.
      const asset: ProductionAsset = { id, name: basename(path), kind, mimeType, size: file.size, url, downloadUrl: `${url}&download=1`,
        ...(width ? { width, height } : {}),
        ...(sha256 ? { sha256 } : {}) };
      registry.set(id, { relativePath: path, mtimeMs: file.mtimeMs, asset });
      return asset;
    } finally { await file.handle.close(); }
  }
  async list(): Promise<ProductionProjectSummary[]> {
    try { const { id, title, summary, brandNames, updatedAt, nodeCount, assetCount } = await this.get(PRODUCTION_PROJECT_ID);
      return [{ id, title, summary, brandNames, updatedAt, nodeCount, assetCount }];
    } catch (error) { if (error instanceof RuntimeError && error.status === 404) return []; throw error; }
  }
  get(id: string): Promise<ProductionProject> {
    this.#assertProject(id);
    if (!this.#loading) this.#loading = this.#load().finally(() => { this.#loading = undefined; });
    return this.#loading.then(project => structuredClone(project));
  }
  async #load(): Promise<ProductionProject> {
    const notes = new Set<string>(['真实文件只读接入；画布节点 ID 由导入器派生，非源任务运行 ID。', '生成状态与审查状态分开呈现；已有图片不表示官方授权、实物打样或生产验收完成。']);
    const registry = new Map<string, FileRecord>(), nodes: ProductionNode[] = [], edges: ProductionProject['edges'] = [];
    const edge = (source: string, target: string, label: string) => { if (source !== target && !edges.some(e => e.source === source && e.target === target)) edges.push({ id: `edge-${fingerprint(`${source}:${target}`)}`, source, target, label }); };
    const register = (path: string, metadata?: Data) => this.#asset(path, registry, notes, metadata);
    const doc = async (id: string, path: string, title: string, lane: ProductionLaneId, kind: ProductionNodeKind = 'document', conceptId?: string) => {
      const source = await this.#read(path); if (!source) return;
      const asset = await register(path); if (!asset) return;
      const node: ProductionNode = { id, title, lane, kind, status: 'available', statusLabel: '已有资料', summary: source.value.replace(/[#*`]/g, '').trim().slice(0, 190),
        content: source.value.slice(0, 40000), ...(conceptId ? { conceptId } : {}), assetIds: [asset.id], sources: [{ label: basename(path), path, assetId: asset.id }] };
      nodes.push(node); return node;
    };
    const brief = await this.#json('brief.json', notes), run = await this.#json('tournament/run.json', notes);
    const oldManifest = await this.#json('materials-v1/manifest.json', notes), materialRun = await this.#json('materials-v1/run.json', notes);
    let entries: string[];
    try { entries = await readdir(this.root); } catch { throw new RuntimeError('制作项目目录尚不可用。', 404); }
    const kits = entries.filter(name => /^campaign-kit-[A-Za-z0-9-]+$/.test(name)).sort().slice(0, 20);
    await doc('brief', 'brief.json', '品牌与合作目标 · 历史 brief', 'strategy', 'brief');
    const briefNode = nodes.find(node => node.id === 'brief');
    if (briefNode) { briefNode.summary = text(run.goal, text(brief.workingGoal, text(brief.originalGoal))); briefNode.statusLabel = '品牌目标依据 · 旧选案状态已失效'; }
    await doc('current', 'CURRENT.md', '当前交付入口与状态说明', 'strategy');
    await doc('research-manner', 'research-manner.md', 'MANNER 品牌研究', 'strategy');
    await doc('research-hok', 'research-hok.md', '王者荣耀品牌研究', 'strategy');
    await doc('research-cases', 'research-cases.md', '合作案例研究', 'strategy');
    await doc('finalists', 'tournament/finalists.md', '两份主方案与一份储备', 'strategy');
    const selected = text(run.userSelectedConceptId);
    for (const [items, reserve] of [[list(run.mainProposals), false], [list(run.reserveProposals), true]] as const) {
      for (const raw of items) {
        const item = data(raw), conceptId = text(item.candidateId); if (!/^[A-Za-z0-9-]+$/.test(conceptId)) continue;
        const design = await this.#json(`materials-v1/design-${conceptId}.json`, notes);
        const designNode = await doc(`design-${conceptId}`, `materials-v1/design-${conceptId}.json`, `${conceptId} 产品设计依据`, 'materials', 'material', conceptId);
        const title = text(item.title, conceptId), statusLabel = selected === conceptId ? '用户已选方向' : reserve ? '储备方向' : '主方案 · 未正式锁案';
        nodes.push({ id: `concept-${conceptId}`, kind: 'concept', lane: 'strategy', title, summary: text(design.product, text(item.status)), status: reserve ? 'unverified' : 'available',
          statusLabel, conceptId, content: jsonText({ proposal: item, design, selectionStatus: statusLabel }), assetIds: [], sources: [{ label: '方案赛马记录', path: 'tournament/run.json' }, { label: '成熟方案全文', path: 'tournament/finalists.md' }] });
        edge('brief', `concept-${conceptId}`, '合作目标'); edge('finalists', `concept-${conceptId}`, '主方案依据');
        if (designNode) edge(`concept-${conceptId}`, designNode.id, '产品展开');
      }
    }
    await doc('copy-pack', 'materials-v1/copy-pack.json', '两案传播字稿', 'story', 'story');
    const compositionSource = new Map<string, string>();
    for (const conceptId of ['I5', 'I3']) {
      const comp = await this.#json(`materials-v1/${conceptId}-composition.json`, notes);
      const sourceId = text(comp.sourceAssetId);
      if (!/^image-[a-f0-9-]+$/.test(sourceId)) continue;
      const sourcePath = `materials-v1/generated/${sourceId}/image.png`, asset = await register(sourcePath);
      if (!asset) continue;
      const id = `source-${conceptId}`; compositionSource.set(conceptId, id);
      nodes.push({ id, kind: 'image', lane: 'media', title: `${conceptId} 选用原始概念图`, summary: '实际生成原图；后续版式复用此图，原始审查状态未确认。', status: 'unverified', statusLabel: '已生成 · 原始审查未确认', conceptId,
        assetIds: [asset.id], sources: [{ label: '原始图片', path: sourcePath, assetId: asset.id }, { label: '合成来源', path: `materials-v1/${conceptId}-composition.json` }] });
      edge(`design-${conceptId}`, id, '设计依据');
    }
    for (const raw of list(oldManifest.deliveredImages).slice(0, 100)) {
      const item = data(raw), path = text(item.path), conceptId = text(item.conceptId);
      if (!safeRelative(path)) continue;
      const asset = await register(`materials-v1/${path}`, item); if (!asset) continue;
      const id = `static-${fingerprint(path)}`, review = text(data(materialRun.visualReview)[conceptId]), needsRevision = review.includes('needs_revision');
      nodes.push({ id, kind: 'image', lane: 'media', title: `${conceptId} ${path.includes('poster') ? '竖版海报' : path.includes('social') ? '社交方图' : '主视觉'}`,
        summary: needsRevision ? '已有概念图与版式；角色识别仍需精修。' : '已有概念图与版式；角色身份、授权与实物执行仍待确认。', status: needsRevision ? 'needs_revision' : 'available', statusLabel: needsRevision ? '已有图片 · 角色需修改' : '已有图片 · 身份未确认', conceptId,
        assetIds: [asset.id], sources: [{ label: '实际交付清单', path: 'materials-v1/manifest.json' }, { label: basename(path), path: `materials-v1/${path}`, assetId: asset.id }, { label: '本地视觉自检', path: 'materials-v1/post-render-review.md' }], tags: ['首轮静态物料'] });
      edge(compositionSource.get(conceptId) ?? `concept-${conceptId}`, id, '图像与版式'); edge('copy-pack', id, '精确字稿');
    }
    const reviewNode = await doc('static-review', 'materials-v1/post-render-review.md', '首轮静态物料审查', 'review', 'review');
    if (reviewNode) { reviewNode.status = jsonText(materialRun.visualReview).includes('needs_revision') ? 'needs_revision' : 'unverified'; reviewNode.statusLabel = '本地自检 · 仍有未确认项'; }
    const archive = await register('materials-v1/materials-package.zip');
    if (archive) nodes.push({ id: 'static-package', kind: 'document', lane: 'review', title: '首轮静态物料下载包', summary: '已有两案六张静态图及其制作说明。', status: 'available', statusLabel: '现成文件包', assetIds: [archive.id], sources: [{ label: archive.name, path: 'materials-v1/materials-package.zip', assetId: archive.id }] });
    let hasSample = false;
    for (const kit of kits) {
      const manifest = await this.#json(`${kit}/manifest.json`, notes);
      if (manifest.schemaVersion !== 'local-campaign-kit-1.0') continue;
      const conceptId = text(manifest.conceptId); if (!/^[A-Za-z0-9-]+$/.test(conceptId)) continue;
      const prefix = `kit-${kit}-`, sample = manifest.selectionStatus === 'sample_not_user_locked'; hasSample ||= sample;
      if (sample) notes.add(`${text(manifest.title, kit)}：制作样板，未由用户正式锁案。`);
      await doc(`${prefix}basis`, `${kit}/production-basis.json`, `${conceptId} 制作样板依据`, 'materials', 'material', conceptId);
      await doc(`${prefix}copy`, `${kit}/copy-deck.json`, `${conceptId} 完整传播字稿`, 'story', 'story', conceptId);
      for (const raw of list(manifest.materials).slice(0, 200)) {
        const item = data(raw), materialId = text(item.materialId); if (!/^[A-Za-z0-9-]+$/.test(materialId)) continue;
        const [kind, lane] = familyKind(text(item.family)), assets: ProductionAsset[] = [];
        const sources: ProductionNode['sources'] = [{ label: '逐件制作清单', path: `${kit}/manifest.json` }];
        const contentParts: string[] = [];
        // Known authored documents may land before the producer updates files[].
        const authored = materialId === 'S01' ? ['story-bible.md'] : materialId === 'B01' ? ['video/video-prep.md', 'video/storyboard.json'] : [];
        const primaryFile = text(item.primaryFile);
        const files = [...list(item.files).map(value => typeof value === 'string' ? { path: value } : data(value)), ...authored.map(path => ({ path })), ...(primaryFile ? [{ path: primaryFile }] : [])]
          .sort((a, b) => materialFilePriority(a, primaryFile) - materialFilePriority(b, primaryFile));
        const seen = new Set<string>();
        let primaryAssetId: string | undefined;
        for (const file of files.slice(0, 100)) {
          const path = text(file.path); if (seen.has(path) || !safeRelative(path)) continue; seen.add(path);
          const asset = await register(`${kit}/${path}`, file); if (!asset) continue;
          assets.push(asset); sources.push({ label: basename(path), path: `${kit}/${path}`, assetId: asset.id });
          if (['image', 'video', 'audio'].includes(asset.kind) && (primaryFile ? path === primaryFile : materialFilePriority(file) <= 0)) primaryAssetId ??= asset.id;
          if (asset.kind === 'document' && ['.md', '.txt', '.json'].includes(extname(path))) {
            const source = await this.#read(`${kit}/${path}`); if (source) contentParts.push(`${basename(path)}\n${source.value.slice(0, 22000)}`);
          }
        }
        const [status, statusLabel] = materialState(item, assets), id = `${prefix}${materialId}`;
        const displayOrder = list(manifest.primaryDisplayOrder).indexOf(materialId);
        const limitations = list(item.limitations).map(value => text(value)).filter(Boolean);
        nodes.push({ id, title: `${materialId} · ${text(item.title, materialId)}`, kind, lane, conceptId, status, statusLabel,
          summary: executionSummary(item, assets.length, limitations), content: [jsonText({ materialId, executionStatus: item.executionStatus, reviewStatus: item.reviewStatus, selectionStatus: manifest.selectionStatus, limitations }), ...contentParts].join('\n\n').slice(0, 60000),
          assetIds: assets.map(asset => asset.id), ...(primaryAssetId ? { primaryAssetId } : {}), ...(displayOrder >= 0 ? { displayOrder } : {}),
          sources, tags: [sample ? '制作样板 · 未正式锁案' : '生产包', text(item.family)] });
        for (const dependency of list(item.dependsOn)) { if (/^[A-Za-z0-9-]+$/.test(text(dependency))) edge(`${prefix}${text(dependency)}`, id, '制作依赖'); }
        if (!list(item.dependsOn).length) edge(`concept-${conceptId}`, id, '方案展开');
        if (materialId === 'V02' && compositionSource.has(conceptId)) edge(compositionSource.get(conceptId)!, id, '复用外观参考');
      }
      // Generated assets can finish before the material manifest is rewritten.
      // Only inspect this package's documented generated/image-UUID/asset.json slots.
      let generated: string[] = [];
      try {
        const root = await realpath(this.root), directory = await realpath(resolve(root, kit, 'generated'));
        if (inside(root, directory)) generated = (await readdir(directory)).filter(name => /^image-[a-f0-9-]+$/.test(name)).slice(0, 100);
      } catch { /* Not every production package contains generated assets. */ }
      for (const name of generated) {
        const path = `${kit}/generated/${name}/image.png`;
        if ([...registry.values()].some(record => record.relativePath === path)) continue;
        const meta = await this.#json(`${kit}/generated/${name}/asset.json`, notes);
        if (meta.generationStatus !== 'succeeded' || meta.assetId !== name) continue;
        const asset = await register(path); if (!asset) continue;
        const id = `${prefix}generated-${name}`;
        nodes.push({ id, kind: 'image', lane: 'media', title: `${conceptId} 新生成参考原图`, summary: '实际生成文件已落地，尚未归入物料清单；不据文件名推断具体用途。',
          status: 'unverified', statusLabel: '已生成 · 待归档与审查', conceptId, assetIds: [asset.id],
          sources: [{ label: '生成原图', path, assetId: asset.id }, { label: '真实资产元数据', path: `${kit}/generated/${name}/asset.json` }],
          content: jsonText({ assetId: name, generationStatus: meta.generationStatus, reviewStatus: meta.reviewStatus, model: meta.model, createdAt: meta.createdAt }), tags: ['待归入物料清单'] });
        edge(`concept-${conceptId}`, id, '真实生成素材');
      }
    }
    const nodeIds = new Set(nodes.map(node => node.id));
    const assets = [...registry.values()].map(record => record.asset);
    if (!nodes.length) throw new RuntimeError('制作项目尚无可读取的资料。', 404);
    const sourceTimes = await Promise.all(['CURRENT.md', 'materials-v1/manifest.json', ...kits.map(kit => `${kit}/manifest.json`)].map(async path => { const file = await this.#open(path); if (!file) return 0; await file.handle.close(); return file.mtimeMs; }));
    this.#registry = registry;
    return { id: PRODUCTION_PROJECT_ID, title: 'MANNER × 王者荣耀', summary: '从品牌研究、两案静态物料到逐件制作与视频筹备的真实项目文件。', brandNames: ['MANNER', '王者荣耀'],
      updatedAt: new Date(Math.max(...sourceTimes, 0)).toISOString(), nodeCount: nodes.length, assetCount: assets.length, sourceThreadId: PRODUCTION_SOURCE_THREAD,
      selectionStatus: selected ? 'selected' : hasSample ? 'sample' : 'unselected', lanes: LANES, nodes, edges: edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)), assets, notes: [...notes] };
  }
  async discuss(id: string, input: unknown, runtime: Pick<ColliderRuntime, 'create'>) {
    const value = data(input);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RuntimeError('讨论输入必须是 JSON 对象。');
    if (value.prompt !== undefined && (typeof value.prompt !== 'string' || value.prompt.length > 2000)) throw new RuntimeError('讨论标准不能超过 2000 字符。');
    if (value.conceptId !== undefined && (typeof value.conceptId !== 'string' || value.conceptId.length > 100)) throw new RuntimeError('讨论方向无效。');
    const project = await this.get(id), conceptId = text(value.conceptId), prompt = text(value.prompt).trim();
    if (conceptId && !project.nodes.some(node => node.conceptId === conceptId)) throw new RuntimeError('该方向不在此制作项目中。', 404);
    const brief = await this.#json('brief.json', new Set()), run = await this.#json('tournament/run.json', new Set());
    const source = jsonText({ kind: 'production-project-context', projectId: id, sourceThreadId: PRODUCTION_SOURCE_THREAD, sourceRoot: this.root,
      importedAt: new Date().toISOString(), discussionConceptId: conceptId || null, selectionStatus: project.selectionStatus,
      note: '作为新对话资料导入；方向 ID 仅表示本次讨论上下文，不代表用户锁案。没有导入或伪造既有 A/B 发言。' });
    const context = project.nodes.filter(node => !conceptId || !node.conceptId || node.conceptId === conceptId)
      .map(node => `${node.title}\n状态：${node.statusLabel ?? node.status}\n${node.content ?? node.summary}\n来源：${node.sources.map(s => s.path).filter(Boolean).join('、')}`).join('\n\n').slice(0, 70000);
    const common = [{ name: 'source.json', text: source }, { name: 'production-context.md', text: context },
      { name: 'brief-history.json', text: `${jsonText(brief).slice(0, 14000)}\n注意：旧选案状态已经失效，当前方案由 production-context.md 与 tournament-run.json 说明。` },
      { name: 'tournament-run.json', text: jsonText(run).slice(0, 14000) || '{}' }];
    const a = await this.#read('research-manner.md'), b = await this.#read('research-hok.md');
    return runtime.create({ mode: 'live', brands: [
      { id: 'a', name: 'MANNER', description: '已有真实项目的品牌资料，事实与待确认项见附件。', files: [...common, ...(a ? [{ name: 'research-manner.md', text: a.value.slice(0, 25000) }] : [])] },
      { id: 'b', name: '王者荣耀', description: '已有真实项目的品牌资料；讨论角色为 AI 品牌视角，非官方代表。', files: b ? [{ name: 'research-hok.md', text: b.value.slice(0, 25000) }] : [{ name: 'source.json', text: source }] },
    ], goal: `${text(run.goal, text(brief.workingGoal, '继续讨论 MANNER × 王者荣耀合作方案。'))}${conceptId ? `\n本次重点讨论 ${conceptId}，保持原制作记录。` : ''}`.slice(0, 5000),
    constraints: ['已有生产资料仅作为上下文；保留其待确认项与真实状态。', '本次讨论方向不等于正式锁案；不得把脚本、参考图或分镜称为已生成成片。', ...(prompt ? [prompt] : [])] });
  }
  async serveAsset(id: string, assetId: string, request: IncomingMessage, response: ServerResponse, download = false) {
    await this.get(id);
    const record = this.#registry.get(assetId);
    if (!record) throw new RuntimeError('素材不存在或尚未完整写入。', 404);
    const file = await this.#open(record.relativePath);
    if (!file) throw new RuntimeError('素材不存在或尚未完整写入。', 404);
    try {
      if (file.size !== record.asset.size || file.mtimeMs !== record.mtimeMs) throw new RuntimeError('素材正在更新，请刷新后重试。', 404);
      const { asset } = record, media = ['image', 'video', 'audio'].includes(asset.kind);
      let start = 0, end = file.size - 1, status = 200;
      response.setHeader('Content-Type', asset.mimeType); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
      if (download || !media) response.setHeader('Content-Disposition', `attachment; filename="asset${extname(record.relativePath)}"; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
      if (media) {
        response.setHeader('Accept-Ranges', 'bytes');
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          let valid = Boolean(match && (match[1] || match[2]));
          if (match && valid) {
            if (!match[1]) { const suffix = Number(match[2]); valid = Number.isSafeInteger(suffix) && suffix > 0; start = Math.max(0, file.size - suffix); }
            else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1; }
            valid &&= Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < file.size && end >= start;
          }
          if (!valid) { response.writeHead(416, { 'Content-Range': `bytes */${file.size}`, 'Content-Length': 0 }); response.end(); return; }
          status = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
        }
      }
      response.writeHead(status, { 'Content-Length': end - start + 1 });
      if (request.method === 'HEAD') { response.end(); return; }
      await pipeline(file.handle.createReadStream({ start, end, autoClose: false }), response);
    } finally { await file.handle.close().catch(() => {}); }
  }
}
function executionSummary(item: Data, fileCount: number, limitations: string[]) {
  if (item.executionStatus === 'out_of_scope') return '源制作清单明确本轮不生成实际视频；脚本和分镜不等于成片。';
  const execution: Record<string, string> = { planned: '等待制作', drafting: '草稿完善中', generating: '正在生成', running: '制作中', in_progress: '制作中', completed: '文件已完成', available: '已有文件', succeeded: '生成完成', saved: '已保存', failed: '制作失败', error: '制作失败' };
  const review: Record<string, string> = { unverified: '尚待审查', reviewed_with_limits: '已审阅·保留限制', needs_revision: '需要修订', rejected: '需要修订', pass: '审查记录通过', passed: '审查记录通过', approved: '审查记录通过' };
  return [fileCount ? `已关联 ${fileCount} 份文件。` : '等待可预览的文件。', `${execution[text(item.executionStatus)] || '制作状态见来源'}，${review[text(item.reviewStatus)] || '审查结论见来源'}。`, ...limitations].join(' ').slice(0, 600);
}
