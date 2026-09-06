import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowUpRight, AudioLines, Check, ChevronDown, ChevronRight, CircleDot, Eye, EyeOff, FileText, Film, Flag, Focus, Grip, Image as ImageIcon, Layers3, LayoutGrid, Link2, LoaderCircle, Maximize2, MessageSquare, Minus, MousePointer2, Pause, Plus, RefreshCw, Search, Sparkles, Workflow, X } from 'lucide-react';
import type { ProductionAsset, ProductionLaneId, ProductionNode, ProductionNodeKind, ProductionProject, ProductionProjectSummary, ProductionStatus, ProductionWorkflow } from '../../src/production-types';
import { CANVAS_LAYERS, CANVAS_CARD_WIDTH, canvasLayerOrigin, nodeLayer, reconcileInfinitePositions } from '../infinite-layout';
import type { CanvasLayerId } from '../infinite-layout';
import '../production-canvas.css';

export type ProductionCanvasProps = {
  project: ProductionProject;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onDiscuss: (node?: ProductionNode) => void;
  projects?: ProductionProjectSummary[];
  onProjectChange?: (id: string) => void;
  embedded?: boolean;
  activeLane?: ProductionLaneId | null;
  progressNodeId?: string | null;
  focusNodeId?: string | null;
  followRequest?: number;
};

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };
type Positions = Record<string, Point>;
type SavedLayout = { positions: Positions; viewport: Viewport };
type Drag = { pointerId: number; kind: 'pan' | 'node'; nodeId?: string; start: Point; origin: Point; zoom: number; moved: boolean };
const CARD_WIDTH = 288;
const CARD_HEIGHT = 294;
const LANE_GAP = 388;
const MIN_ZOOM = 0.04;
const MAX_ZOOM = 1.8;
const defaultViewport = (): Viewport => ({ x: typeof window !== 'undefined' && window.innerWidth <= 760 ? -185 : 18, y: 16, zoom: 0.84 });
const KIND_NAMES: Record<ProductionNodeKind, string> = { brief: '项目简报', concept: '联名方向', story: '故事与脚本', material: '设计素材', image: '图像资产', video: '视频', audio: '音频', review: '审查记录', document: '制作文档' };
const KIND_ICONS = { brief: Flag, concept: Sparkles, story: FileText, material: Layers3, image: ImageIcon, video: Film, audio: AudioLines, review: Check, document: FileText };
const LANE_ICONS = { strategy: Flag, story: FileText, materials: Layers3, media: ImageIcon, video: Film, review: Check };
const STATUS_NAMES: Record<ProductionStatus, string> = { available: '已有产出', planned: '制作计划', running: '制作中', needs_revision: '待修订', unverified: '待核验', reference: '参考资料', failed: '未完成' };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function arrangeNodes(project: ProductionProject): Positions {
  const positions: Positions = {};
  const imageAssetIds = new Set(project.assets.filter(asset => asset.kind === 'image').map(asset => asset.id));
  const mediaOrder = (node: ProductionNode) => {
    if (!node.assetIds.some(id => imageAssetIds.has(id))) return 20;
    const concept = node.conceptId === 'I5' ? 0 : node.conceptId === 'I3' ? 5 : 10;
    return concept + (/主视觉/.test(node.title) ? 0 : /海报/.test(node.title) ? 1 : /社交/.test(node.title) ? 2 : 3);
  };
  project.lanes.forEach((lane, row) => {
    const nodes = project.nodes.filter(node => node.lane === lane.id);
    nodes.sort((a, b) => {
      const aOrdered = typeof a.displayOrder === 'number' && Number.isFinite(a.displayOrder);
      const bOrdered = typeof b.displayOrder === 'number' && Number.isFinite(b.displayOrder);
      if (aOrdered && bOrdered) return a.displayOrder! - b.displayOrder!;
      if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
      return lane.id === 'media' ? mediaOrder(a) - mediaOrder(b) : 0;
    });
    nodes.forEach((node, column) => { positions[node.id] = { x: 250 + column * (CARD_WIDTH + 64), y: 86 + row * LANE_GAP }; });
  });
  project.nodes.filter(node => !positions[node.id]).forEach((node, index) => { positions[node.id] = { x: 250 + index * (CARD_WIDTH + 64), y: 86 + project.lanes.length * LANE_GAP }; });
  return positions;
}

function initialProjectViewport(project: ProductionProject): Viewport {
  const imageAssetIds = new Set(project.assets.filter(asset => asset.kind === 'image').map(asset => asset.id));
  const mediaAssetIds = new Set(project.assets.filter(asset => ['image', 'video', 'audio'].includes(asset.kind) && assetUrl(asset.url)).map(asset => asset.id));
  const positions = arrangeNodes(project);
  const primaryNodes = project.nodes.filter(node => node.primaryAssetId && node.assetIds.includes(node.primaryAssetId) && mediaAssetIds.has(node.primaryAssetId) && typeof node.displayOrder === 'number' && Number.isFinite(node.displayOrder))
    .sort((a, b) => a.displayOrder! - b.displayOrder!);
  const visualNodes = project.nodes.filter(node => node.lane === 'media' && node.assetIds.some(id => imageAssetIds.has(id)));
  const first = primaryNodes[0] || visualNodes.sort((a, b) => positions[a.id].x - positions[b.id].x)[0];
  if (!first) return defaultViewport();
  const small = typeof window !== 'undefined' && window.innerWidth <= 760;
  const zoom = small ? 0.86 : 0.94;
  return { zoom, x: (small ? 23 : 235) - positions[first.id].x * zoom, y: (small ? 95 : 100) - positions[first.id].y * zoom };
}

function loadLayout(project: ProductionProject): SavedLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(`collider.production-layout.v1.${project.id}`) || 'null');
    if (!parsed || typeof parsed !== 'object') throw new Error('No layout');
    const positions: Positions = {};
    for (const [key, value] of Object.entries(parsed.positions || {}).slice(0, 2000)) {
      const point = value as Point;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) positions[key] = { x: clamp(point.x, -100000, 100000), y: clamp(point.y, -100000, 100000) };
    }
    const viewport = parsed.viewport;
    return { positions, viewport: viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.zoom)
      ? { x: clamp(viewport.x, -100000, 100000), y: clamp(viewport.y, -100000, 100000), zoom: clamp(viewport.zoom, MIN_ZOOM, MAX_ZOOM) } : initialProjectViewport(project) };
  } catch { return { positions: {}, viewport: initialProjectViewport(project) }; }
}

function assetUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function sizeLabel(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '大小未记录';
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function contentPreview(value: string): string {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\bsample_not_user_locked\b/g, '样板尚未锁定').replace(/\bneeds_revision\b/g, '需要修订').replace(/\bunverified\b/g, '尚待核验').replace(/\bdrafting\b/g, '草稿').replace(/\bplanned\b/g, '待制作').replace(/\bnot_requested\b/g, '本轮未请求').trim();
}

const CONTENT_LABELS: Record<string, string> = {
  title: '主题', name: '名称', summary: '核心内容', story: '故事', logline: '故事主线', narrative: '叙事', description: '内容说明', product: '产品体验', mechanism: '参与方式', consumervalue: '消费者所得', goal: '合作目标', workinggoal: '本次合作目标', originalgoal: '最初目标', assumptions: '待核实前提', userconstraints: '创作标准', confirmedresources: '可用资源', proposeddeliverables: '计划交付', components: '产品组成', brandroles: '双方贡献', visual: '视觉方向', pendingconfirmations: '待确认事项', brandline: '品牌组合', disclosure: '作品说明', items: '内容集', tagline: '传播句', headline: '主标题', subheadline: '副标题', subtitle: '副标题', body: '正文', bodycopy: '正文', caption: '发布文案', cta: '行动提示', copy: '文案', front: '正面', back: '背面', inside: '内页', outside: '外页', panels: '版面内容', scene: '场景', shots: '镜头', shot: '镜头', visualdescription: '画面', voiceover: '旁白', text: '文字内容', onscreentext: '画面文字', voice: '声音', dialogue: '对白', notes: '补充说明', note: '补充说明', limitations: '现有边界', purpose: '制作目的', samplescope: '本轮样板范围', samplescopeexcludes: '暂不包含', scopenote: '制作范围', global: '统一表达', assets: '逐件内容', campaignphases: '传播阶段', designdevelopment: '设计深化', primaryscope: '本轮重点', concepts: '联名方向', proposal: '方案', design: '设计', primarybarrier: '要解决的问题', customerjourney: '体验过程', targetaudience: '目标受众', audience: '面向人群', tone: '表达语气', palette: '配色', composition: '构图', typography: '字体与文字', materials: '材质与物料', format: '版式规格', dimensions: '尺寸', duration: '时长', durationseconds: '时长（秒）', sequence: '顺序', scenes: '场景设计', message: '核心表达', mainmessage: '核心表达', storyarc: '故事走向', opening: '开场', ending: '收尾', hook: '开场切入', deliverables: '交付内容', experience: '体验设计', objective: '目标', rationale: '设计理由', placement: '应用位置', content: '内容', restrictions: '使用边界', mustinclude: '需要包含', avoid: '避免出现', beat: '叙事节拍', beats: '叙事节拍', action: '动作', camera: '镜头语言', transition: '转场', sound: '声音设计', mood: '情绪', pacing: '节奏', detail: '补充细节', details: '补充细节', intent: '创作意图', en: '英文', zh: '中文', chinese: '中文', english: '英文', role: '角色作用', requirements: '制作要求', consumerpromise: '消费者价值', safecopy: '可用表达', shortcopy: '短文案', longcopy: '长文案', poster: '海报', social: '社交传播', constraints: '创作标准', productionnotes: '制作备注', reviewnotes: '审查备注', channels: '传播渠道', launch: '正式发布', teaser: '预热阶段', followup: '后续传播', channelspecific: '分渠道内容', color: '颜色', colors: '配色', material: '材质', angle: '观察角度', framing: '画面构图', lighting: '光线', setting: '场景设定', storytext: '故事文案', visualconcept: '视觉概念', requiredtext: '画面所需文字', supportcopy: '辅助文案', consumeraction: '用户行动', guardrails: '表达边界', fields: '信息内容', localizedcopy: '传播文案', top: '上部', bottom: '下部', left: '左侧', right: '右侧' };
const PRIORITY_KEYS = ['title', 'name', 'workinggoal', 'summary', 'logline', 'story', 'narrative', 'product', 'headline', 'description', 'purpose', 'mechanism', 'consumervalue'];
const TECHNICAL_KEYS = /^(schema|schemaversion|executionmode|id|assetid|materialid|conceptid|selectedconceptid|recommendedconceptid|selectionstatus|status|executionstatus|reviewstatus|generationstatus|source|sources|sourceproposal|sourcehero|sourceherosha256|sourcesha256|sha256|createdon|createdat|updatedat|model|nextstages|imagegeneration|researchfiles|officialreferenceassets|officialartassets|userauthorization|requestdelta|resourceids|newvisualrequestsplanned|videogenerationrequested|generationpolicy|technicallayoutsrole|additionaleffectrequestsplanned|latestusersteering|filename|filepath|path|url|downloadurl|mimetype|provider|timestamp)$/;
const normalizeKey = (key: string) => key.replace(/[_\s-]/g, '').toLowerCase();

function parseContent(value: string): unknown | undefined {
  const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!/^[{[]/.test(text)) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function usefulText(value: string): boolean {
  return !!value.trim() && !/^(?:\/(?:Users|tmp|var)\/|[a-f0-9]{40,}$|(?:asset|session)-[a-f0-9-]+$)/i.test(value.trim())
    && !/本地工作文件|不伪造 Collider MCP|ArtifactRecord|codex-local-orchestration|local-files-and-existing-image-cli/i.test(value);
}

function humanJson(value: unknown, depth = 0): string {
  if (depth > 9 || value == null) return '';
  if (typeof value === 'string') {
    const nested = parseContent(value);
    return nested !== undefined ? humanJson(nested, depth + 1) : usefulText(value) ? contentPreview(value) : '';
  }
  if (Array.isArray(value)) return value.map(item => humanJson(item, depth + 1)).filter(Boolean).join('\n\n');
  if (typeof value !== 'object') return '';
  return Object.entries(value).sort(([a], [b]) => {
    const ai = PRIORITY_KEYS.indexOf(normalizeKey(a)); const bi = PRIORITY_KEYS.indexOf(normalizeKey(b));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  }).flatMap(([key, item]) => {
    const normalized = normalizeKey(key);
    if (TECHNICAL_KEYS.test(normalized) || /(?:sha256|filepath|requestcount|cliversion|resourceids)$/.test(normalized)) return [];
    const label = CONTENT_LABELS[normalized] || (/[\u3400-\u9fff]/.test(key) || /^[A-Z]{2,20}$/.test(key) ? key : '');
    const text = typeof item === 'number' && label ? String(item) : humanJson(item, depth + 1);
    if (!text) return [];
    if (!label) return typeof item === 'object' ? [text] : [];
    if (['title', 'name'].includes(normalized)) return [`## ${text}`];
    return [`${depth <= 2 ? '## ' : ''}${label}\n${text}`];
  }).join('\n\n');
}

function readableMixedContent(value: string): { content: string; structured: boolean } {
  const matcher = /(?:^|\n)([ \t]*[\[{])/g;
  const parts: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let structured = false;
  while ((match = matcher.exec(value))) {
    const start = match.index + match[0].length - 1;
    let depth = 0; let quoted = false; let escaped = false; let end = -1;
    for (let index = start; index < value.length; index++) {
      const character = value[index];
      if (quoted) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') quoted = false; continue; }
      if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') { depth--; if (!depth) { end = index + 1; break; } }
    }
    if (end < 0) continue;
    const parsed = parseContent(value.slice(start, end));
    if (parsed === undefined) continue;
    structured = true;
    parts.push(value.slice(cursor, start), humanJson(parsed));
    cursor = end; matcher.lastIndex = end;
  }
  parts.push(value.slice(cursor));
  return { content: parts.join('').replace(/^\s*[a-zA-Z0-9_.-]+\.(?:json|md)\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), structured };
}

function readableNodeContent(node: ProductionNode): string {
  const result = readableMixedContent(node.content || '');
  return result.content || (!/^[{[]/.test(node.summary.trim()) ? contentPreview(node.summary) : '') || '具体制作状态见上方标记，原始记录与来源文件可在下方查看。';
}

function nodeSummary(node: ProductionNode): string {
  if (!/^[{[]/.test(node.summary.trim())) return contentPreview(node.summary);
  const parsed = parseContent(node.content || node.summary);
  const find = (value: unknown, depth = 0): string => {
    if (!value || typeof value !== 'object' || depth > 6) return '';
    for (const key of ['summary', 'logline', 'workingGoal', 'product', 'narrative', 'story', 'description', 'purpose', 'headline', 'mechanism']) {
      const text = (value as Record<string, unknown>)[key];
      if (typeof text === 'string' && usefulText(text)) return contentPreview(text);
    }
    for (const [key, item] of Object.entries(value)) { if (!TECHNICAL_KEYS.test(normalizeKey(key))) { const found = find(item, depth + 1); if (found) return found; } }
    return '';
  };
  return find(parsed) || contentPreview(readableNodeContent(node)).replace(/\s+/g, ' ').slice(0, 230);
}

function ReadableContent({ node }: { node: ProductionNode }) {
  const parsed = readableMixedContent(node.content || '');
  const content = readableNodeContent(node);
  return <><div className="production-inspector__readable">{content.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const lines = block.split('\n');
    const heading = lines[0].match(/^\s*#{1,6}\s+(.+)$/);
    return <section key={index}>{heading && <h4>{contentPreview(heading[1])}</h4>}<p>{contentPreview((heading ? lines.slice(1) : lines).join('\n'))}</p></section>;
  })}</div>{parsed.structured && <details className="production-inspector__raw"><summary>查看原始数据<ChevronDown size={12} /></summary><pre>{node.content}</pre></details>}</>;
}

function Status({ node }: { node: ProductionNode }) {
  return <span className={`production-node-status is-${node.status}`} title={node.statusLabel || STATUS_NAMES[node.status]}><i />{node.statusLabel || STATUS_NAMES[node.status]}</span>;
}

function NodePreview({ node, assets }: { node: ProductionNode; assets: ProductionAsset[] }) {
  const primary = assets.find(asset => asset.id === node.primaryAssetId && ['image', 'video', 'audio'].includes(asset.kind) && assetUrl(asset.url));
  const previewAssets = primary ? [primary] : assets;
  const pictures = previewAssets.filter(asset => asset.kind === 'image' && assetUrl(asset.url));
  const video = previewAssets.find(asset => asset.kind === 'video' && assetUrl(asset.url));
  const audio = previewAssets.find(asset => asset.kind === 'audio' && assetUrl(asset.url));
  if (pictures.length) return <div className={`production-node__preview has-images count-${Math.min(pictures.length, 3)}`}>
    {pictures.slice(0, 3).map(asset => <img key={asset.id} src={assetUrl(asset.url)} alt={asset.name} draggable={false} loading="lazy" />)}
    <span className="production-node__asset-count"><ImageIcon size={10} />{primary ? '主图' : `${pictures.length} 张图像`}</span>
  </div>;
  if (video) return <div className="production-node__preview has-video"><video src={assetUrl(video.url)} preload="metadata" muted playsInline /><span className="production-node__asset-count"><Film size={10} />已有视频文件</span></div>;
  if (audio) return <div className="production-node__preview"><div className="production-node__placeholder"><AudioLines size={31} strokeWidth={1} /><span>{audio.name}</span><small>已关联音频 · 在详情中播放</small></div></div>;
  if (node.kind === 'video' || node.kind === 'audio' || node.kind === 'image') {
    const Icon = KIND_ICONS[node.kind];
    const label = node.kind === 'video' ? '视频' : node.kind === 'audio' ? '声音' : '图像';
    return <div className="production-node__preview"><div className="production-node__placeholder">{node.status === 'running' ? <LoaderCircle size={27} strokeWidth={1.2} className="production-spin" /> : <Icon size={31} strokeWidth={1} />}<span>{label}{node.status === 'running' ? '生成中' : node.status === 'failed' ? '制作未完成' : '制作计划'}</span><small>{node.status === 'running' ? '完成后会自动出现在这里' : `尚未关联${label}文件`}</small></div></div>;
  }
  return <div className="production-node__preview"><div className="production-node__text-preview"><FileText size={15} /><p>{contentPreview(readableNodeContent(node))}</p></div></div>;
}

function AssetDetail({ asset }: { asset: ProductionAsset }) {
  const url = assetUrl(asset.url);
  const download = assetUrl(asset.downloadUrl);
  return <div className="production-inspector__asset">
    {asset.kind === 'image' && url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={asset.name} loading="lazy" /></a>}
    {asset.kind === 'video' && url && <video key={url} src={url} controls preload="metadata" playsInline />}
    {asset.kind === 'audio' && url && <audio key={url} src={url} controls preload="metadata" />}
    {(asset.kind === 'document' || asset.kind === 'archive') && <div className="production-document-file"><FileText size={22} /><span>{asset.kind === 'archive' ? '打包文件' : '制作文档'}</span></div>}
    <div className="production-asset-meta"><strong>{asset.name}</strong><span>{sizeLabel(asset.size)}{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ''}</span></div>
    <div className="production-asset-actions">{url && asset.kind === 'image' && <a href={url} target="_blank" rel="noreferrer">打开原图<ArrowUpRight size={12} /></a>}{download && <a href={download} download={asset.name}>下载{asset.kind === 'archive' ? '文件包' : '文件'}<ArrowDownToLine size={12} /></a>}</div>
    {asset.sha256 && <details className="production-asset-hash"><summary>文件校验信息<ChevronDown size={11} /></summary><code>SHA-256 {asset.sha256}</code></details>}
  </div>;
}

function Inspector({ node, project, onClose, onDiscuss, onNavigate }: { node: ProductionNode; project: ProductionProject; onClose: () => void; onDiscuss: () => void; onNavigate: (node: ProductionNode) => void }) {
  const incoming = project.edges.filter(edge => edge.target === node.id).map(edge => project.nodes.find(item => item.id === edge.source)).filter((item): item is ProductionNode => !!item);
  const outgoing = project.edges.filter(edge => edge.source === node.id).map(edge => project.nodes.find(item => item.id === edge.target)).filter((item): item is ProductionNode => !!item);
  const assets = node.assetIds.map(id => project.assets.find(asset => asset.id === id)).filter((asset): asset is ProductionAsset => !!asset);
  const Icon = KIND_ICONS[node.kind];
  return <aside className="production-inspector" aria-label={`${node.title}的节点详情`}>
    <header className="production-inspector__header"><div><span><Icon size={12} />{KIND_NAMES[node.kind]}{node.conceptId && <b>{node.conceptId}</b>}</span><h2>{node.title}</h2></div><button type="button" onClick={onClose} aria-label="关闭节点详情"><X size={18} /></button></header>
    <div className="production-inspector__body">
      <Status node={node} />
      <p className="production-inspector__summary">{nodeSummary(node)}</p>
      {!!node.tags?.length && <div className="production-inspector__tags">{node.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      {assets.length > 0 ? <section className="production-inspector__section"><h3>关联资产 <span>{assets.length}</span></h3>{assets.map(asset => <AssetDetail key={asset.id} asset={asset} />)}</section> : ['video', 'audio', 'image'].includes(node.kind) && <div className="production-media-unavailable"><Icon size={24} strokeWidth={1.2} /><strong>{STATUS_NAMES[node.status]}</strong><p>这个节点目前没有可预览的{node.kind === 'video' ? '视频' : node.kind === 'audio' ? '音频' : '图像'}文件。具体制作要求保留在下方内容中。</p></div>}
      {node.content && <section className="production-inspector__section"><h3>完整内容</h3><ReadableContent node={node} /></section>}
      {(incoming.length > 0 || outgoing.length > 0) && <section className="production-inspector__section"><h3><Link2 size={12} />制作依赖</h3>{incoming.length > 0 && <><h4>由这些内容推进</h4>{incoming.map(item => <button key={item.id} type="button" className="production-inspector__dependency" onClick={() => onNavigate(item)}><span><small>{KIND_NAMES[item.kind]}</small>{item.title}</span><ArrowUpRight size={13} /></button>)}</>}{outgoing.length > 0 && <><h4>继续用于</h4>{outgoing.map(item => <button key={item.id} type="button" className="production-inspector__dependency" onClick={() => onNavigate(item)}><span><small>{KIND_NAMES[item.kind]}</small>{item.title}</span><ArrowUpRight size={13} /></button>)}</>}</section>}
      {node.sources.length > 0 && <section className="production-inspector__section"><h3>内容来源 <span>{node.sources.length}</span></h3>{node.sources.map((source, index) => {
        const asset = project.assets.find(item => item.id === source.assetId);
        const download = asset ? assetUrl(asset.downloadUrl) : undefined;
        const sourceUrl = source.path && /^https?:\/\//i.test(source.path) ? assetUrl(source.path) : undefined;
        return <div className="production-inspector__source" key={`${index}-${source.label}`}><p><FileText size={12} />{source.label}</p>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">查看来源网页<ArrowUpRight size={11} /></a> : source.path && <code>{source.path}</code>}{source.sha256 && <small>SHA-256 · {source.sha256.slice(0, 16)}…</small>}{download && <a href={download} download={asset?.name}>下载来源{asset?.kind === 'image' ? '原图' : '文档'}<ArrowDownToLine size={11} /></a>}</div>;
      })}</section>}
      <p className="production-inspector__node-id">NODE / {node.id}</p>
    </div>
    <footer className="production-inspector__footer"><button type="button" onClick={onDiscuss}><MessageSquare size={15} />围绕这个节点继续对话<ArrowUpRight size={14} /></button></footer>
  </aside>;
}

function ProductionBoard({ project, refreshing, onRefresh, onBack, onDiscuss, projects, onProjectChange }: ProductionCanvasProps) {
  const [initial] = useState(() => loadLayout(project));
  const [savedPositions, setSavedPositions] = useState<Positions>(initial.positions);
  const [viewport, setViewport] = useState<Viewport>(initial.viewport);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportState = useRef(viewport);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conceptFilter, setConceptFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [activeLane, setActiveLane] = useState<ProductionLaneId | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const defaults = useMemo(() => arrangeNodes(project), [project]);
  const positions = useMemo(() => ({ ...defaults, ...savedPositions }), [defaults, savedPositions]);
  const selected = project.nodes.find(node => node.id === selectedId);
  const visibleNodes = project.nodes.filter(node => (conceptFilter === 'all' || !node.conceptId || node.conceptId === conceptFilter) && (kindFilter === 'all' || node.kind === kindFilter));
  const visibleIds = new Set(visibleNodes.map(node => node.id));
  const visibleEdges = project.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const conceptIds = [...new Set(project.nodes.map(node => node.conceptId).filter((id): id is string => !!id))].sort((a, b) => a === 'I5' ? -1 : b === 'I5' ? 1 : a.localeCompare(b));
  const kindIds = [...new Set(project.nodes.map(node => node.kind))];
  const relatedIds = new Set([selectedId, ...project.edges.filter(edge => edge.source === selectedId || edge.target === selectedId).flatMap(edge => [edge.source, edge.target])]);

  useEffect(() => { viewportState.current = viewport; }, [viewport]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(`collider.production-layout.v1.${project.id}`, JSON.stringify({ positions: savedPositions, viewport })); } catch { /* Canvas remains usable when local storage is unavailable. */ }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [project.id, savedPositions, viewport]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedId(null); setNavOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const dx = event.deltaX * factor;
      const dy = event.deltaY * factor;
      setViewport(current => {
        if (event.ctrlKey || event.metaKey) {
          const zoom = clamp(current.zoom * Math.exp(-dy * 0.006), MIN_ZOOM, MAX_ZOOM);
          const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          return { zoom, x: at.x - (at.x - current.x) * zoom / current.zoom, y: at.y - (at.y - current.y) * zoom / current.zoom };
        }
        return { ...current, x: current.x - (event.shiftKey && !dx ? dy : dx), y: current.y - (event.shiftKey && !dx ? 0 : dy) };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function startDrag(event: ReactPointerEvent, node?: ProductionNode) {
    if (event.button !== 0 || drag.current) return;
    if (!node && (event.target as HTMLElement).closest('[data-production-node]')) return;
    event.preventDefault();
    event.stopPropagation();
    viewportRef.current?.setPointerCapture(event.pointerId);
    const current = viewportState.current;
    drag.current = { pointerId: event.pointerId, kind: node ? 'node' : 'pan', ...(node ? { nodeId: node.id } : {}), start: { x: event.clientX, y: event.clientY }, origin: node ? positions[node.id] : { x: current.x, y: current.y }, zoom: current.zoom, moved: false };
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) current.moved = true;
    if (!current.moved) return;
    if (current.kind === 'node' && current.nodeId) {
      const id = current.nodeId;
      setSavedPositions(value => ({ ...value, [id]: { x: current.origin.x + dx / current.zoom, y: current.origin.y + dy / current.zoom } }));
    } else setViewport(value => ({ ...value, x: current.origin.x + dx, y: current.origin.y + dy }));
  }

  function endDrag(event: ReactPointerEvent, cancelled = false) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!cancelled && !current.moved) setSelectedId(current.nodeId || null);
    drag.current = null;
    setDragging(false);
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) viewportRef.current.releasePointerCapture(event.pointerId);
  }

  function zoomBy(factor: number, absolute?: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const at = { x: rect.width / 2, y: rect.height / 2 };
    setViewport(current => {
      const zoom = clamp(absolute ?? current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      return { zoom, x: at.x - (at.x - current.x) * zoom / current.zoom, y: at.y - (at.y - current.y) * zoom / current.zoom };
    });
  }

  function fitNodes(nodes: ProductionNode[], nodePositions = positions) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !nodes.length) return;
    const points = nodes.map(node => nodePositions[node.id]).filter(Boolean);
    const minX = Math.min(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y)) - 48;
    const width = Math.max(...points.map(point => point.x)) + CARD_WIDTH - minX;
    const height = Math.max(...points.map(point => point.y)) + CARD_HEIGHT - minY;
    const left = rect.width < 760 ? 18 : 218;
    const right = selected && rect.width >= 980 ? 400 : 28;
    const availableWidth = Math.max(200, rect.width - left - right);
    const availableHeight = Math.max(200, rect.height - 115);
    const zoom = clamp(Math.min(availableWidth / width, availableHeight / height), MIN_ZOOM, 1.1);
    setViewport({ zoom, x: left + (availableWidth - width * zoom) / 2 - minX * zoom, y: 36 + (availableHeight - height * zoom) / 2 - minY * zoom });
  }

  function focusLane(id: ProductionLaneId) {
    setActiveLane(id); setNavOpen(false);
    const nodes = visibleNodes.filter(node => node.lane === id);
    if (!nodes.length) return;
    const first = nodes.reduce((current, next) => positions[next.id].x < positions[current.id].x ? next : current);
    const rect = viewportRef.current?.getBoundingClientRect();
    const zoom = Math.max(viewport.zoom, 0.76);
    setViewport({ zoom, x: (rect && rect.width < 760 ? 25 : 235) - positions[first.id].x * zoom, y: 80 - positions[first.id].y * zoom });
  }

  function navigateNode(node: ProductionNode) {
    setConceptFilter('all'); setKindFilter('all'); setSelectedId(node.id); setActiveLane(node.lane);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = rect.width >= 980 ? 405 : 28;
    const left = rect.width >= 760 ? 225 : 24;
    const zoom = clamp(viewport.zoom, 0.74, 1.05);
    setViewport({ zoom, x: left + Math.max(0, (rect.width - right - left - CARD_WIDTH * zoom) / 2) - positions[node.id].x * zoom, y: 95 - positions[node.id].y * zoom });
  }

  function applyFilters(concept: string, kind: string) {
    setConceptFilter(concept); setKindFilter(kind); setSelectedId(null); setActiveLane(null);
    fitNodes(project.nodes.filter(node => (concept === 'all' || !node.conceptId || node.conceptId === concept) && (kind === 'all' || node.kind === kind)));
  }

  function resetLayout() { setSavedPositions(defaults); setSelectedId(null); setActiveLane(null); setViewport(initialProjectViewport(project)); }
  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  const backgroundStyle: CSSProperties = { backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` };

  return <section className="production-studio" aria-label="品牌联名制作画布">
    <header className="production-studio__topbar">
      <button className="production-studio__back" type="button" onClick={onBack} aria-label="返回联名工作台"><ArrowLeft size={18} /></button>
      <div className="production-studio__brand"><span><Workflow size={21} strokeWidth={1.4} /></span><div><strong>制作空间</strong><small>PRODUCTION STUDIO</small></div></div>
      <span className="production-studio__top-divider" />
      <div className="production-studio__project">{projects && projects.length > 1 && onProjectChange ? <label><span className="visually-hidden">切换制作项目</span><select value={project.id} onChange={event => onProjectChange(event.target.value)}>{projects.map(item => <option key={item.id} value={item.id}>{item.title}{item.id.startsWith('session:') ? ' · 当前对话' : ''}</option>)}</select><ChevronDown size={13} /></label> : <strong>{project.title}</strong>}<p>{project.brandNames[0]}<span>×</span>{project.brandNames[1]}</p><span className="production-studio__mobile-status">{project.selectionStatus === 'selected' ? '方向已选定' : project.selectionStatus === 'sample' ? '深化样板 · 待选定' : '等待选定方向'}</span></div>
      <span className={`production-studio__sample is-${project.selectionStatus}`}><i />{project.selectionStatus === 'selected' ? '方向已选定' : project.selectionStatus === 'sample' ? '深化样板 · 待选定' : '等待选定方向'}</span>
      <div className="production-studio__top-actions"><button type="button" onClick={onRefresh} disabled={refreshing} title="刷新制作产出">{refreshing ? <LoaderCircle size={14} className="production-spin" /> : <RefreshCw size={14} />}<span>{refreshing ? '同步中' : '同步产出'}</span></button><button type="button" className="production-action--primary" onClick={() => onDiscuss()}><MessageSquare size={14} /><span>品牌对话</span><ArrowUpRight size={12} /></button></div>
    </header>
    <div className="production-studio__workspace">
      <div ref={viewportRef} className={`production-viewport${dragging ? ' is-dragging' : ''}`} style={backgroundStyle} onPointerDown={event => startDrag(event)} onPointerMove={moveDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} tabIndex={0} aria-label="可拖拽的制作画布，使用滚轮平移，按住 Control 或 Command 滚轮缩放" onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
        else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
        else if (event.key.toLowerCase() === 'f') { event.preventDefault(); fitNodes(visibleNodes); }
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setViewport(value => ({ ...value, x: value.x + (event.key === 'ArrowLeft' ? 70 : event.key === 'ArrowRight' ? -70 : 0), y: value.y + (event.key === 'ArrowUp' ? 70 : event.key === 'ArrowDown' ? -70 : 0) })); }
      }}>
        <div className="production-world" style={{ transform }}>
          <svg className="production-edges" width="1" height="1" aria-hidden="true"><defs><marker id={`production-arrow-${project.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" /></marker></defs>{visibleEdges.map(edge => {
            const from = positions[edge.source]; const to = positions[edge.target];
            if (!from || !to) return null;
            const source = { x: from.x + CARD_WIDTH + 3, y: from.y + CARD_HEIGHT / 2 };
            const target = { x: to.x - 5, y: to.y + CARD_HEIGHT / 2 };
            const bend = Math.max(65, Math.min(190, Math.abs(target.x - source.x) * 0.45));
            const active = edge.source === selectedId || edge.target === selectedId;
            return <g key={edge.id} className={active ? 'is-active' : selected ? 'is-dim' : ''}><path d={`M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`} markerEnd={`url(#production-arrow-${project.id})`} />{active && edge.label && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 9} textAnchor="middle">{edge.label}</text>}</g>;
          })}</svg>
          {project.lanes.map((lane, index) => {
            const nodes = visibleNodes.filter(node => node.lane === lane.id);
            if (!nodes.length) return null;
            const x = Math.min(...nodes.map(node => positions[node.id].x));
            const y = Math.min(...nodes.map(node => positions[node.id].y)) - 47;
            const Icon = LANE_ICONS[lane.id];
            return <div key={lane.id} className="production-lane-label" style={{ left: x, top: y }}><Icon size={15} /><strong>{lane.label}</strong><small>{String(index + 1).padStart(2, '0')} / {nodes.length} 个节点</small></div>;
          })}
          {visibleNodes.map(node => {
            const point = positions[node.id]; const Icon = KIND_ICONS[node.kind];
            const assets = node.assetIds.map(id => project.assets.find(asset => asset.id === id)).filter((asset): asset is ProductionAsset => !!asset);
            return <article key={node.id} className={`production-node${selectedId === node.id ? ' is-selected' : ''}${selected && !relatedIds.has(node.id) ? ' is-dim' : ''}`} style={{ left: point.x, top: point.y, width: CARD_WIDTH, height: CARD_HEIGHT }} data-production-node={node.id} onPointerDown={event => startDrag(event, node)} tabIndex={0} role="button" aria-label={`${node.title}，${node.statusLabel || STATUS_NAMES[node.status]}，打开节点详情`} aria-pressed={selectedId === node.id} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }}>
              <i className="production-node__port is-in" /><i className="production-node__port is-out" />
              <div className="production-node__head"><span><Icon size={12} />{KIND_NAMES[node.kind]}</span>{node.conceptId && <b>{node.conceptId}</b>}<Grip size={12} className="production-node__grip" /></div>
              <h3 className="production-node__title">{node.title}</h3><p className="production-node__summary">{nodeSummary(node)}</p>
              <NodePreview node={node} assets={assets} />
              <div className="production-node__footer"><Status node={node} /><span>{assets.length > 0 ? `${assets.length} 个文件` : '查看内容'}<ArrowUpRight size={11} /></span></div>
            </article>;
          })}
        </div>
      </div>

      <nav className={`production-navigator${navOpen ? ' is-open' : ''}`} aria-label="制作泳道导航">
        <button type="button" className="production-navigator__mobile-toggle" onClick={() => setNavOpen(value => !value)}><Layers3 size={14} /><span>制作导航</span><ChevronDown size={12} /></button>
        <div className="production-navigator__content"><div className="production-navigator__heading"><span>PROJECT FLOW</span><span>{project.nodes.length}</span></div>
          <div className="production-navigator__lanes">{project.lanes.map(lane => { const Icon = LANE_ICONS[lane.id]; const count = visibleNodes.filter(node => node.lane === lane.id).length; return <button key={lane.id} type="button" className={activeLane === lane.id ? 'is-active' : ''} onClick={() => focusLane(lane.id)} disabled={!count} title={lane.description}><Icon size={14} /><strong>{lane.label}</strong><span>{String(count).padStart(2, '0')}</span></button>; })}</div>
          <div className="production-filters"><span>筛选内容</span><label>方向<select value={conceptFilter} onChange={event => applyFilters(event.target.value, kindFilter)}><option value="all">全部方向</option>{conceptIds.map(id => <option key={id} value={id}>{id}{id === 'I5' && project.selectionStatus === 'sample' ? ' · 深化样板' : ''}</option>)}</select></label><label>类型<select value={kindFilter} onChange={event => applyFilters(conceptFilter, event.target.value)}><option value="all">全部类型</option>{kindIds.map(id => <option key={id} value={id}>{KIND_NAMES[id]}</option>)}</select></label></div>
          <div className="production-navigator__stats"><span><i />{project.assets.length} 个真实文件</span><small>{visibleNodes.length} / {project.nodes.length} 个节点可见</small></div>
          {project.notes.length > 0 && <details className="production-nav-note"><summary>项目说明<ChevronDown size={11} /></summary>{project.notes.map((note, index) => <p key={index}>{note}</p>)}</details>}
        </div>
      </nav>

      {!visibleNodes.length && <div className="production-canvas-empty"><Layers3 size={32} strokeWidth={1} /><h2>{project.nodes.length ? '没有符合筛选的节点' : '制作内容正在汇入'}</h2><p>{project.nodes.length ? '调整方向或类型，继续查看项目内容。' : '已生成的图片、文档与制作计划会在这里建立关联。'}</p>{project.nodes.length > 0 && <button type="button" onClick={() => { setConceptFilter('all'); setKindFilter('all'); }}>显示全部节点</button>}</div>}
      <div className="production-canvas-hint"><MousePointer2 size={12} /><span>拖动画布 · 滚轮平移</span><i /><span>⌘ / Ctrl + 滚轮缩放</span></div>
      <div className="production-controls" aria-label="画布布局与缩放控制">
        <button type="button" onClick={resetLayout} title="重排节点并重置视图" aria-label="重排节点并重置视图"><LayoutGrid size={16} /></button><span className="production-controls__separator" />
        <button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={viewport.zoom <= MIN_ZOOM} aria-label="缩小画布"><Minus size={16} /></button>
        <button type="button" className="production-controls__zoom" onClick={() => zoomBy(1, 1)} title="重置为100%">{Math.round(viewport.zoom * 100)}%</button>
        <button type="button" onClick={() => zoomBy(1.2)} disabled={viewport.zoom >= MAX_ZOOM} aria-label="放大画布"><Plus size={16} /></button><span className="production-controls__separator" />
        <button type="button" onClick={() => fitNodes(visibleNodes)} title="适应全图（F）" aria-label="适应全图"><Maximize2 size={15} /></button>
      </div>
      {selected && <Inspector node={selected} project={project} onClose={() => setSelectedId(null)} onDiscuss={() => onDiscuss(selected)} onNavigate={navigateNode} />}
    </div>
  </section>;
}


const WORKFLOW_STATUS_LABELS: Record<ProductionWorkflow['status'], string> = {
  running: '进行中', paused: '已暂停', failed: '需要处理', awaiting_selection: '等待选方向', completed: '已完成',
};
const WORKFLOW_STEP_LABELS = { pending: '待开始', running: '进行中', paused: '已暂停', failed: '未完成', completed: '已完成' };

/** A fixed progress summary keeps real work visible without moving the camera. */
function CanvasWorkflowProgress({ workflow, onLocate }: { workflow: ProductionWorkflow; onLocate: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const StatusIcon = workflow.status === 'running' ? LoaderCircle : workflow.status === 'failed' ? AlertCircle
    : workflow.status === 'paused' ? Pause : workflow.status === 'completed' ? Check : CircleDot;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape); };
  }, [open]);
  function locate(id?: string) { if (id) { onLocate(id); setOpen(false); } }
  return <div ref={rootRef} className={`canvas-workflow is-${workflow.status}${open ? ' is-open' : ''}`} data-workflow-status={workflow.status}>
    <button ref={toggleRef} type="button" className="canvas-workflow__toggle" onClick={() => setOpen(value => !value)} aria-label="查看项目流程" aria-expanded={open} aria-controls="canvas-workflow-detail" title={workflow.currentAction}>
      <StatusIcon size={15} className={workflow.status === 'running' ? 'production-spin' : ''} />
      <span className="canvas-workflow__summary"><span><strong>简报 v{workflow.revision}</strong><small>{WORKFLOW_STATUS_LABELS[workflow.status]}</small><i>{workflow.completedSteps} / {workflow.totalSteps} 步</i></span><span aria-live="polite" aria-atomic="true">{workflow.currentAction}</span></span>
      <ChevronDown size={13} className="canvas-workflow__chevron" />
    </button>
    {open && <section id="canvas-workflow-detail" className="canvas-workflow__detail" aria-label="本轮项目流程">
      <div className="canvas-workflow__current"><div><Workflow size={14} /><strong>{workflow.phase === 'orchestrator' ? '主控整理与交接' : workflow.phase === 'selection' ? '方向选择' : workflow.phase === 'finished' ? '本轮交付' : '当前工作'}</strong></div><p>{workflow.currentAction}</p>{workflow.currentNodeId && <button type="button" onClick={() => locate(workflow.currentNodeId)}><Focus size={12} />定位当前工作</button>}</div>
      <ol className="canvas-workflow__steps">{workflow.steps.map((step, index) => <li key={step.id} className={`is-${step.status}${step.id === workflow.currentStepId ? ' is-current' : ''}`}>
        <button type="button" disabled={!step.nodeId} onClick={() => locate(step.nodeId)} aria-label={`${step.label}，${step.agentName}，${WORKFLOW_STEP_LABELS[step.status]}${step.nodeId ? '，定位成果' : ''}`} aria-current={step.id === workflow.currentStepId ? 'step' : undefined}>
          <span className="canvas-workflow__step-number">{step.status === 'completed' ? <Check size={11} /> : step.status === 'running' ? <LoaderCircle size={11} className="production-spin" /> : step.status === 'failed' ? <AlertCircle size={11} /> : index + 1}</span>
          <span className="canvas-workflow__step-label"><strong>{step.label}</strong><small>{step.agentName}</small></span><span className="canvas-workflow__step-status">{WORKFLOW_STEP_LABELS[step.status]}</span>{step.nodeId && <ArrowUpRight size={11} />}
        </button>
      </li>)}</ol>
      <p className="canvas-workflow__note">主控维护简报、协调交接，按当前方向推进制作和审查。你可以随时暂停并补充标准。</p>
    </section>}
  </div>;
}

const INFINITE_CARD_HEIGHT = 336;
const LAYER_ICONS = { orchestrator: Workflow, research: Search, ideation: Sparkles, design: Layers3, copy: FileText, image: ImageIcon, video: Film, review: Check };
type InfiniteState = { positions: Positions; viewport: Viewport; hidden: CanvasLayerId[]; following: boolean; showEdges: boolean };
function loadInfiniteState(id: string): InfiniteState {
  const fallback: InfiniteState = { positions: {}, viewport: { x: 0, y: 0, zoom: 1 }, hidden: [], following: true, showEdges: false };
  try {
    const saved = JSON.parse(localStorage.getItem(`collider.infinite-layout.v1.${id}`) || 'null');
    if (!saved || typeof saved !== 'object') return fallback;
    const positions: Positions = {};
    for (const [id, raw] of Object.entries(saved.positions || {}).slice(0, 2500)) {
      const value = raw as Point;
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) < 1e7 && Math.abs(value.y) < 1e7) positions[id] = { x: value.x, y: value.y };
    }
    const view = saved.viewport;
    return { positions, viewport: view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.zoom) ? { x: clamp(view.x, -1e7, 1e7), y: clamp(view.y, -1e7, 1e7), zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM) } : fallback.viewport,
      hidden: Array.isArray(saved.hidden) ? CANVAS_LAYERS.filter(layer => saved.hidden.includes(layer.id)).map(layer => layer.id) : [], following: saved.following !== false, showEdges: saved.showEdges === true };
  } catch { return fallback; }
}
function orderedLayerNodes(project: ProductionProject, layer: CanvasLayerId) {
  return project.nodes.filter(node => nodeLayer(node) === layer).sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER));
}
function currentProgressNode(project: ProductionProject, lane?: ProductionLaneId | null, preferredId?: string | null): ProductionNode | undefined {
  return project.nodes.find(node => node.id === preferredId) || project.nodes.find(node => node.status === 'running') || [...project.nodes].filter(node => (!lane || node.lane === lane) && node.id !== 'export')
    .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))[0] || project.nodes[0];
}
function InfiniteProductionBoard({ project, refreshing, onRefresh, onDiscuss, activeLane, progressNodeId, focusNodeId, followRequest }: ProductionCanvasProps) {
  const [saved] = useState(() => loadInfiniteState(project.id));
  const [savedPositions, setSavedPositions] = useState<Positions>(saved.positions);
  const positions = useMemo(() => reconcileInfinitePositions(savedPositions, project.nodes), [savedPositions, project.nodes]);
  const [viewport, setViewport] = useState<Viewport>(saved.viewport);
  const [following, setFollowing] = useState(saved.following);
  const followingRef = useRef(saved.following);
  const [hidden, setHidden] = useState<CanvasLayerId[]>(saved.hidden);
  const [showEdges, setShowEdges] = useState(saved.showEdges);
  const [layersOpen, setLayersOpen] = useState(false);
  const [expanded, setExpanded] = useState<CanvasLayerId[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ id: string; serial: number } | null>(() => {
    const node = currentProgressNode(project, activeLane, progressNodeId);
    return saved.following && node ? { id: node.id, serial: 0 } : null;
  });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerPanelRef = useRef<HTMLDivElement>(null);
  const layerButtonRef = useRef<HTMLButtonElement>(null);
  const pointer = useRef<{ id: number; start: Point; origin: Point; zoom: number; nodeId?: string; moved: boolean } | null>(null);
  const previousNodes = useRef(new Map(project.nodes.map(node => [node.id, `${node.status}:${node.assetIds.join(',')}:${node.content?.length || 0}`])));
  const previousLane = useRef(activeLane);
  const previousProgressNode = useRef(progressNodeId);
  const handledFocus = useRef<string | null>(null);
  const previousFollowRequest = useRef(followRequest || 0);
  const compact = size.height > 0 && size.height < 420;
  const cardHeight = compact ? 208 : INFINITE_CARD_HEIGHT;
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visibleNodes = useMemo(() => project.nodes.filter(node => !hiddenSet.has(nodeLayer(node))), [project.nodes, hiddenSet]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const selected = project.nodes.find(node => node.id === selectedId);
  const progressNode = currentProgressNode(project, activeLane, progressNodeId);
  const progressLayer = progressNode ? nodeLayer(progressNode) : null;
  const runningCount = project.nodes.filter(node => node.status === 'running').length;
  const latestLayout = useRef<InfiniteState>({ positions, viewport, hidden, following, showEdges });
  latestLayout.current = { positions, viewport, hidden, following, showEdges };

  useEffect(() => { if (positions !== savedPositions) setSavedPositions(positions); }, [positions, savedPositions]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(`collider.infinite-layout.v1.${project.id}`, JSON.stringify({ positions, viewport, hidden, following, showEdges })); } catch { /* Optional local layout storage. */ }
    }, 180);
    return () => clearTimeout(timer);
  }, [positions, viewport, hidden, following, showEdges, project.id]);
  useEffect(() => {
    const flush = () => { try { localStorage.setItem(`collider.infinite-layout.v1.${project.id}`, JSON.stringify(latestLayout.current)); } catch { /* Optional local layout storage. */ } };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [project.id]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setSize(previous => previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height }); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function pauseFollowing() { followingRef.current = false; setFollowing(false); setCameraTarget(null); }
  function aimAt(node: ProductionNode, openDetail = false) {
    setHidden(current => current.filter(id => id !== nodeLayer(node)));
    setCameraTarget(current => ({ id: node.id, serial: (current?.serial || 0) + 1 }));
    if (openDetail) setSelectedId(node.id);
  }
  function focusNodes(nodes: ProductionNode[], overview = false) {
    if (!nodes.length || size.width < 1 || size.height < 1) return;
    const points = nodes.map(node => positions[node.id]);
    const minX = Math.min(...points.map(point => point.x)), minY = Math.min(...points.map(point => point.y));
    const width = Math.max(...points.map(point => point.x)) + CANVAS_CARD_WIDTH - minX;
    const height = Math.max(...points.map(point => point.y)) + cardHeight - minY;
    const marginTop = project.workflow ? compact ? 83 : 119 : compact ? 47 : 100, marginBottom = compact ? 58 : 85;
    const availableHeight = Math.max(100, size.height - marginTop - marginBottom);
    const zoom = clamp(Math.min((size.width - (compact ? 40 : 76)) / width, availableHeight / height, overview ? 1 : 1.08), overview ? MIN_ZOOM : 0.55, MAX_ZOOM);
    setViewport({ zoom, x: (size.width - width * zoom) / 2 - minX * zoom, y: marginTop + Math.max(0, (availableHeight - height * zoom) / 2) - minY * zoom });
  }
  useEffect(() => {
    if (!cameraTarget || !size.width) return;
    const target = project.nodes.find(node => node.id === cameraTarget.id);
    if (!target) return;
    const origin = positions[target.id];
    const capacity = clamp(Math.floor((size.width - 56 + 28) / (CANVAS_CARD_WIDTH + 28)), 1, 3);
    // Follow a readable local area. Every other artifact keeps its world position.
    const nearby = visibleNodes.filter(node => nodeLayer(node) === nodeLayer(target) && Math.abs(positions[node.id].y - origin.y) < 1
      && Math.abs(positions[node.id].x - origin.x) <= (capacity - 1) * (CANVAS_CARD_WIDTH + 28))
      .sort((a, b) => Math.abs(positions[a.id].x - origin.x) - Math.abs(positions[b.id].x - origin.x)).slice(0, capacity);
    focusNodes(nearby.length ? nearby : [target]);
  }, [cameraTarget, size.width, size.height, compact]);
  useEffect(() => {
    const changed = project.nodes.filter(node => previousNodes.current.get(node.id) !== `${node.status}:${node.assetIds.join(',')}:${node.content?.length || 0}`);
    previousNodes.current = new Map(project.nodes.map(node => [node.id, `${node.status}:${node.assetIds.join(',')}:${node.content?.length || 0}`]));
    const laneChanged = previousLane.current !== activeLane; previousLane.current = activeLane;
    const progressChanged = previousProgressNode.current !== progressNodeId; previousProgressNode.current = progressNodeId;
    if (!followingRef.current || (!changed.length && !laneChanged && !progressChanged)) return;
    const node = project.nodes.find(node => node.id === progressNodeId) || project.nodes.find(node => node.status === 'running') || changed.filter(node => (!activeLane || node.lane === activeLane) && node.id !== 'export').at(-1) || (laneChanged ? currentProgressNode(project, activeLane) : undefined);
    if (node) aimAt(node);
  }, [project.nodes, activeLane, progressNodeId]);
  useEffect(() => {
    if (!focusNodeId) { handledFocus.current = null; return; }
    if (handledFocus.current === focusNodeId) return;
    const node = project.nodes.find(node => node.id === focusNodeId);
    if (!node) return;
    handledFocus.current = focusNodeId; pauseFollowing(); setLayersOpen(false); aimAt(node, true);
  }, [focusNodeId, project.nodes]);
  function resumeFollowing() {
    followingRef.current = true; setFollowing(true); setSelectedId(null);
    const node = currentProgressNode(project, activeLane, progressNodeId); if (node) aimAt(node);
  }
  useEffect(() => {
    if (!followRequest || previousFollowRequest.current === followRequest) return;
    previousFollowRequest.current = followRequest; resumeFollowing();
  }, [followRequest]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); pauseFollowing();
      const rect = element.getBoundingClientRect();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const dx = event.deltaX * factor, dy = event.deltaY * factor;
      setViewport(current => {
        if (event.ctrlKey || event.metaKey) {
          const zoom = clamp(current.zoom * Math.exp(-dy * .006), MIN_ZOOM, MAX_ZOOM);
          const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          return { zoom, x: at.x - (at.x - current.x) * zoom / current.zoom, y: at.y - (at.y - current.y) * zoom / current.zoom };
        }
        return { ...current, x: current.x - (event.shiftKey && !dx ? dy : dx), y: current.y - (event.shiftKey && !dx ? 0 : dy) };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedId) setSelectedId(null);
      else if (layersOpen) { setLayersOpen(false); layerButtonRef.current?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedId, layersOpen]);
  useEffect(() => {
    if (!layersOpen) return;
    const dismiss = (event: PointerEvent) => { if (!layerPanelRef.current?.contains(event.target as Node) && !layerButtonRef.current?.contains(event.target as Node)) setLayersOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [layersOpen]);

  function locateLayer(id: CanvasLayerId) {
    pauseFollowing(); setSelectedId(null); setLayersOpen(false);
    const node = orderedLayerNodes(project, id)[0]; if (node) aimAt(node);
  }
  function toggleLayer(id: CanvasLayerId) {
    pauseFollowing();
    setHidden(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    if (selected && nodeLayer(selected) === id) setSelectedId(null);
  }
  function navigateNode(node: ProductionNode) { pauseFollowing(); setLayersOpen(false); aimAt(node, true); }
  function zoomBy(factor: number, absolute?: number) {
    pauseFollowing();
    setViewport(current => {
      const zoom = clamp(absolute ?? current.zoom * factor, MIN_ZOOM, MAX_ZOOM), at = { x: size.width / 2, y: size.height / 2 };
      return { zoom, x: at.x - (at.x - current.x) * zoom / current.zoom, y: at.y - (at.y - current.y) * zoom / current.zoom };
    });
  }
  function startDrag(event: ReactPointerEvent, nodeId?: string) {
    if (event.button !== 0 || pointer.current) return;
    event.preventDefault(); event.stopPropagation(); setLayersOpen(false);
    viewportRef.current?.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: nodeId ? positions[nodeId] : viewport, zoom: viewport.zoom, nodeId, moved: false };
  }
  function moveDrag(event: ReactPointerEvent) {
    const value = pointer.current; if (!value || value.id !== event.pointerId) return;
    const dx = event.clientX - value.start.x, dy = event.clientY - value.start.y;
    if (Math.abs(dx) + Math.abs(dy) <= 5 && !value.moved) return;
    value.moved = true; pauseFollowing(); setDragging(true);
    if (value.nodeId) setSavedPositions(current => ({ ...current, [value.nodeId!]: { x: value.origin.x + dx / value.zoom, y: value.origin.y + dy / value.zoom } }));
    else setViewport({ zoom: value.zoom, x: value.origin.x + dx, y: value.origin.y + dy });
  }
  function endDrag(event: ReactPointerEvent, cancelled = false) {
    const value = pointer.current; if (!value || value.id !== event.pointerId) return;
    if (!cancelled && !value.moved && value.nodeId) { pauseFollowing(); setSelectedId(value.nodeId); }
    pointer.current = null; setDragging(false);
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) viewportRef.current.releasePointerCapture(event.pointerId);
  }

  return <section className={`production-studio production-studio--embedded production-studio--infinite${compact ? ' production-studio--compact' : ''}`} aria-label="无限项目画布">
    <div className="production-studio__workspace">
      <div ref={viewportRef} className={`production-viewport${dragging ? ' is-dragging' : ''}`} style={{ backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }} onPointerDown={event => startDrag(event)} onPointerMove={moveDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} tabIndex={0} aria-label="无限画布；拖动空白平移，拖动卡片移动，按住 Command 或 Control 滚轮缩放" onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
        else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
        else if (event.key.toLowerCase() === 'f') { event.preventDefault(); pauseFollowing(); focusNodes(visibleNodes, true); }
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); pauseFollowing(); setViewport(value => ({ ...value, x: value.x + (event.key === 'ArrowLeft' ? 70 : event.key === 'ArrowRight' ? -70 : 0), y: value.y + (event.key === 'ArrowUp' ? 70 : event.key === 'ArrowDown' ? -70 : 0) })); }
      }}>
        <div className="production-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          {showEdges && <svg className="production-edges" width="1" height="1" aria-hidden="true">{project.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map(edge => {
            const a = positions[edge.source], b = positions[edge.target], sx = a.x + CANVAS_CARD_WIDTH, sy = a.y + cardHeight / 2, tx = b.x, ty = b.y + cardHeight / 2;
            const bend = Math.max(60, Math.abs(tx - sx) * .45);
            return <path key={edge.id} d={`M${sx} ${sy} C${sx + bend} ${sy},${tx - bend} ${ty},${tx} ${ty}`} />;
          })}</svg>}
          {CANVAS_LAYERS.map(layer => {
            const count = project.nodes.filter(node => nodeLayer(node) === layer.id).length;
            if (!count) return null;
            const origin = canvasLayerOrigin(layer.id), Icon = LAYER_ICONS[layer.id];
            return <button key={layer.id} type="button" className={`infinite-group${hiddenSet.has(layer.id) ? ' is-hidden' : ''}`} style={{ left: origin.x, top: origin.y - 48 }} onPointerDown={event => event.stopPropagation()} onClick={() => locateLayer(layer.id)} aria-label={`定位${layer.label}图层`}><Icon size={17} /><strong>{layer.label}</strong><span>{layer.agent}</span><small>{hiddenSet.has(layer.id) ? '已隐藏' : `${count} 项`}</small></button>;
          })}
          {visibleNodes.map(node => {
            const Icon = KIND_ICONS[node.kind], point = positions[node.id];
            const assets = node.assetIds.map(id => project.assets.find(asset => asset.id === id)).filter((asset): asset is ProductionAsset => !!asset);
            return <article key={node.id} className={`production-node${selectedId === node.id ? ' is-selected' : ''}${node.status === 'running' ? ' is-running' : ''}`} style={{ left: point.x, top: point.y, width: CANVAS_CARD_WIDTH, height: cardHeight }} data-production-node={node.id} data-canvas-layer={nodeLayer(node)} onPointerDown={event => startDrag(event, node.id)} tabIndex={0} role="button" aria-label={`${node.title}，${node.statusLabel || STATUS_NAMES[node.status]}，打开详情`} aria-pressed={selectedId === node.id} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateNode(node); }
              else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation(); pauseFollowing(); const step = event.shiftKey ? 64 : 16;
                setSavedPositions(current => ({ ...current, [node.id]: { x: point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) } }));
              }
            }}>
              <div className="production-node__head"><span><Icon size={12} />{KIND_NAMES[node.kind]}</span>{node.conceptId && <b>{node.conceptId}</b>}<Grip size={12} className="production-node__grip" /></div>
              <h3 className="production-node__title">{node.title}</h3><p className="production-node__summary">{nodeSummary(node)}</p><NodePreview node={node} assets={assets} />
              <div className="production-node__footer"><Status node={node} /><span>{assets.length ? `${assets.length} 个文件` : '查看内容'}<ArrowUpRight size={11} /></span></div>
            </article>;
          })}
        </div>
      </div>
      {project.workflow && <CanvasWorkflowProgress workflow={project.workflow} onLocate={id => { const node = project.nodes.find(item => item.id === id); if (node) navigateNode(node); }} />}
      {!project.workflow && project.nodes.length > 0 && <div className="infinite-status"><CircleDot size={12} /><span>{runningCount && following ? `正在推进 · ${CANVAS_LAYERS.find(layer => layer.id === progressLayer)?.label || '联名创作'}` : `无限画布 · ${visibleNodes.length} 项成果`}</span></div>}
      <button className="infinite-sync" type="button" onClick={onRefresh} disabled={refreshing} title="同步最新成果" aria-label="同步最新成果">{refreshing ? <LoaderCircle size={14} className="production-spin" /> : <RefreshCw size={14} />}</button>
      {!project.nodes.length && <div className="production-canvas-empty"><div className="production-empty-symbol" aria-hidden="true"><img src="/brand-relations/assets/mark-blue-black.svg" width="144" height="144" alt="" /></div><h2>让品牌之间，有了下文。</h2><p><span className="production-empty-side">在右侧</span><span className="production-empty-below">在下方</span>补充品牌，成果会逐步加入这张无限画布</p></div>}
      {!!project.nodes.length && !visibleNodes.length && <div className="production-canvas-empty"><Layers3 size={28} strokeWidth={1} /><h2>图层已隐藏</h2><p>成果仍保留在原位，可以随时重新显示。</p><button onClick={() => { setHidden([]); resumeFollowing(); }}>显示全部图层</button></div>}
      {layersOpen && <div ref={layerPanelRef} id="infinite-layer-panel" className="infinite-layer-panel" role="region" aria-label="Agent 图层">
        <div className="infinite-layer-panel__head"><strong>图层</strong><small>按 Agent 工作分类</small><button aria-label="关闭图层" onClick={() => { setLayersOpen(false); layerButtonRef.current?.focus(); }}><X size={14} /></button></div>
        <div className="infinite-layer-tree">{CANVAS_LAYERS.map(layer => {
          const layerNodes = orderedLayerNodes(project, layer.id), Icon = LAYER_ICONS[layer.id], open = expanded.includes(layer.id);
          return <div key={layer.id}><div className={`infinite-layer-row${hiddenSet.has(layer.id) ? ' is-hidden' : ''}${progressLayer === layer.id ? ' is-current' : ''}`}>
            <button className="infinite-layer-expand" aria-label={`${open ? '收起' : '展开'}${layer.label}`} aria-expanded={open} disabled={!layerNodes.length} onClick={() => setExpanded(current => open ? current.filter(id => id !== layer.id) : [...current, layer.id])}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
            <button className="infinite-layer-focus" disabled={!layerNodes.length} title={`${layer.agent} · ${layer.description}`} onClick={() => locateLayer(layer.id)}><Icon size={14} /><strong>{layer.label}</strong><small>{layerNodes.length}</small></button>
            <button className="infinite-layer-eye" aria-label={`${hiddenSet.has(layer.id) ? '显示' : '隐藏'}${layer.label}图层`} aria-pressed={!hiddenSet.has(layer.id)} onClick={() => toggleLayer(layer.id)}>{hiddenSet.has(layer.id) ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          </div>{open && <div className="infinite-layer-children">{layerNodes.map(node => { const NodeIcon = KIND_ICONS[node.kind]; return <button key={node.id} className="infinite-layer-node" title={node.title} onClick={() => navigateNode(node)}><NodeIcon size={11} /><span>{node.title}</span><i className={`is-${node.status}`} /></button>; })}</div>}</div>;
        })}</div>
        <div className="infinite-layer-panel__footer"><label><input type="checkbox" checked={showEdges} onChange={event => setShowEdges(event.target.checked)} />显示连线</label><button onClick={() => setHidden([])}>显示全部</button></div>
      </div>}
      <div className="infinite-toolbar"><button ref={layerButtonRef} type="button" className={`infinite-layers-toggle${layersOpen ? ' is-active' : ''}`} aria-label="图层" aria-expanded={layersOpen} aria-controls="infinite-layer-panel" onClick={() => setLayersOpen(current => !current)}><Layers3 size={16} /><span>图层</span><small>{CANVAS_LAYERS.filter(layer => project.nodes.some(node => nodeLayer(node) === layer.id)).length}</small></button>
        <div className="production-controls" aria-label="画布缩放控制"><button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={viewport.zoom <= MIN_ZOOM} aria-label="缩小画布"><Minus size={14} /></button><button type="button" className="production-controls__zoom" onClick={() => zoomBy(1, 1)} title="实际大小">{Math.round(viewport.zoom * 100)}%</button><button type="button" onClick={() => zoomBy(1.2)} disabled={viewport.zoom >= MAX_ZOOM} aria-label="放大画布"><Plus size={14} /></button><span className="production-controls__separator" /><button type="button" onClick={() => { pauseFollowing(); focusNodes(visibleNodes, true); }} title="查看全部成果（F）" aria-label="查看全部成果"><Maximize2 size={14} /></button></div>
      </div>
      <button type="button" className={`production-follow infinite-follow${following ? ' is-following' : ''}`} onClick={resumeFollowing} aria-pressed={following}><CircleDot size={12} /><span>{following ? '跟随进度' : '返回进度'}</span></button>
      {selected && <><button type="button" className="production-inspector-scrim" aria-label="关闭成果详情" onClick={() => setSelectedId(null)} /><Inspector node={selected} project={project} onClose={() => setSelectedId(null)} onDiscuss={() => { setSelectedId(null); onDiscuss(selected); }} onNavigate={navigateNode} /></>}
    </div>
  </section>;
}

export function ProductionCanvas(props: ProductionCanvasProps) { return props.embedded ? <InfiniteProductionBoard key={props.project.id} {...props} /> : <ProductionBoard key={props.project.id} {...props} />; }
