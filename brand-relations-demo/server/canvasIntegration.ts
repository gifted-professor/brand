import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createHttpServer } from '../../brand-collider-skills-design/src/server/index';
import { ProductionRepository } from '../../brand-collider-skills-design/src/server/production';
import { RuntimeError } from '../../brand-collider-skills-design/src/server/text-provider';
import type { ColliderRuntime } from '../../brand-collider-skills-design/src/server/runtime';
import type { ProductionProject, ProductionNode } from '../../brand-collider-skills-design/src/production-types';
import type { Project } from '../src/collaboration/model';
import { currentPreview } from '../src/collaboration/model';
import { PRELOADED_COTTI_NAILONG_PROJECT_ID } from '../src/collaboration/preloadedProject';
import { ProjectStore } from './projectsApi';
import type { createColliderService } from './colliderApi';

export function canvasBrief(project: Project, prompt = '') {
  return {
    mode: 'live', autoAdvance: true, combineCreativeStages: true,
    // Automatic image production is enabled only when the runtime supports it.
    autoProduce: false,
    brands: (['a', 'b'] as const).map(id => {
      const { brand, visual } = project.brands[id];
      return { id, name: brand.name, description: brand.summary,
        files: [{ name: `${id}-brand-and-vi.json`, text: JSON.stringify({ ...brand, visual: { ...visual, photo: visual.photo?.startsWith('data:') ? '用户上传图片，需在画板绑定原图' : visual.photo, logo: visual.logo ? '用户上传标识，需在画板绑定原图' : undefined }, fictional: brand.fictional === true, invitationStatus: project.invitation.status }) }] };
    }),
    goal: `${project.invitation.draft.title}\n${project.invitation.draft.concept}\n制作双方渠道预演：A 方 ${project.brands.a.brand.name} 的社交渠道一张，B 方 ${project.brands.b.brand.name} 的社交渠道一张。`.slice(0, 5000),
    constraints: [
      '只做一对一品牌受众互荐，沿用各自成熟的视觉体系；每张图以发布方为主，只加入合作方署名和既有产品或内容。不开发新商品，不合并两套 VI。',
      '核心交付仅两张 4:5 渠道预演及对应发布文案。保持双方投入对等，资源数量与实际合作均待确认。',
      '当前只是建联意向。资料中的邀请状态不代表真实发送、品牌授权或对方同意。',
      '生成品牌样本只用于丰富演示；公开品牌资料仍需品牌方确认。未提供的 VI、商标和实物应标注待补充，不自行编造。模板预演不是实时 AI 出图。',
      `已有提案：${JSON.stringify(project.invitation.draft)}`,
      ...(prompt ? [prompt] : []),
    ],
  };
}

/** Adapt saved partner data into the upstream canvas contract; no canvas fork. */
export function productionProject(project: Project): ProductionProject {
  const preview = currentPreview(project);
  const nodes: ProductionNode[] = [{ id: `${project.id}-brief`, kind: 'brief', lane: 'strategy', title: project.invitation.draft.title,
    summary: '一对一品牌渠道互荐 · 建联意向', content: `${project.invitation.draft.concept}\n\n我方投入：${project.invitation.draft.contribution}\n邀请对方：${project.invitation.draft.ask}`,
    status: 'available', statusLabel: '待双方确认', assetIds: [], sources: [{ label: '当前项目简报' }], displayOrder: 0 }];
  const assets: ProductionProject['assets'] = [];
  for (const side of ['a', 'b'] as const) {
    const { brand, visual } = project.brands[side];
    nodes.push({ id: `${project.id}-brand-${side}`, kind: 'document', lane: 'strategy', title: `${brand.name} · 品牌与 VI`,
      summary: brand.summary, content: `${brand.offers}\n受众：${brand.audience}\n视觉：${visual.source === 'unprovided' ? '尚未提供，当前图仅为版式占位' : `沿用 ${visual.wordmark}，主色 ${visual.background} / ${visual.foreground}`}\n资料来源：${brand.fictional ? '生成的概念品牌样本' : '公开品牌资料快照，待品牌确认'}`,
      status: 'available', assetIds: [], sources: [{ label: '已保存的品牌资料' }], displayOrder: side === 'a' ? 1 : 2 });
    if (brand.contact) nodes.push({ id: `${project.id}-contact-${side}`, kind: 'document', lane: 'strategy', title: `${brand.name} · 建联入口`,
      summary: `${brand.contact.label} · 公开信息，发送前复核`,
      content: [`联系人类型：${brand.contact.label}`, brand.contact.website ? `官网：${brand.contact.website}` : '', brand.contact.email ? `邮箱：${brand.contact.email}` : '', brand.contact.wechat ? `微信：${brand.contact.wechat}` : '', `说明：${brand.contact.note}`].filter(Boolean).join('\n'),
      status: 'unverified', statusLabel: '公开入口 · 待复核', assetIds: [], sources: [{ label: brand.evidence || '公开品牌资料快照' }], displayOrder: side === 'a' ? 3 : 4 });
    if (!preview) continue;
    const id = `${preview.id}-${side}`;
    const url = preview[side], isPng = /\.png$/i.test(url);
    const dimensions = isPng ? { width: 1122, height: 1402 } : { width: 900, height: 1200 };
    assets.push({ id, name: `${brand.name}渠道预演.${isPng ? 'png' : 'svg'}`, kind: 'image', url, downloadUrl: isPng ? url : `${url}?download=1`, mimeType: isPng ? 'image/png' : 'image/svg+xml', size: 0, ...dimensions });
    nodes.push({ id, kind: 'image', lane: 'media', title: `${brand.name} · 自有渠道预演`, summary: project.headlines[side].replace('\n', ' '),
      content: `发布方视觉为主，合作方只增加署名和受众入口。\n${preview.source === 'ai' ? 'AI 场景与品牌排版已预生成，打开演示时不重新出图' : '模板排版预演，非本轮实时 AI 出图'}。\n${visual.source === 'unprovided' ? '缺少原 VI，当前为中性占位。' : '保留各自品牌视觉。'}\n待双方确认，未发布。`,
      status: 'unverified', statusLabel: preview.source === 'template' ? '模板预演 · 待确认' : 'AI 预演 · 已预加载', assetIds: [id], primaryAssetId: id, sources: [{ label: '已保存的预演', assetId: id }], displayOrder: side === 'a' ? 5 : 6 });
  }
  return { id: project.id, title: `${project.brands.a.brand.name} × ${project.brands.b.brand.name}`, summary: project.invitation.draft.concept,
    brandNames: [project.brands.a.brand.name, project.brands.b.brand.name], updatedAt: project.updatedAt, nodeCount: nodes.length, assetCount: assets.length,
    selectionStatus: 'sample', lanes: [{ id: 'strategy', label: '合作简报', description: '双方现有资料' }, { id: 'media', label: '双方渠道预演', description: '各自视觉，互相署名' }],
    nodes, assets, edges: nodes.slice(1).map(node => ({ id: `edge-${node.id}`, source: nodes[0].id, target: node.id })), notes: ['建联意向的本地预演；不代表真实发送、双方同意或发布授权。'] };
}

export class RelationsProductionRepository extends ProductionRepository {
  constructor(private store: ProjectStore) { super(resolve('../outputs/manner-hok-20260905')); }
  override async list() { return (await this.store.list()).map(productionProject); }
  override async get(id: string) {
    if (!id.startsWith('project-')) return super.get(id);
    try {
      const saved = await this.store.get(id), project = productionProject(saved);
      project.assets = await Promise.all(project.assets.map(async asset => ({ ...asset,
        size: (asset.url.startsWith('/collaboration/cotti-nailong/') ? await readFile(resolve('public', `.${asset.url}`)) : await this.store.asset(id, asset.url.split('/').at(-1)!)).byteLength,
        height: asset.mimeType === 'image/png' ? asset.height : saved.channel === 'store' ? 1272 : 1200,
      })));
      return project;
    } catch { throw new RuntimeError('合作项目不存在，请返回项目列表。', 404); }
  }
  override async discuss(id: string, input: unknown, runtime: Pick<ColliderRuntime, 'create'>) {
    if (!id.startsWith('project-')) return super.discuss(id, input, runtime);
    const prompt = (input as { prompt?: unknown })?.prompt;
    if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > 2000)) throw new RuntimeError('讨论标准不能超过 2000 字符。');
    return runtime.create(canvasBrief(await this.store.get(id), prompt as string | undefined));
  }
}

export function canvasIntegration(initialize: ReturnType<typeof createColliderService>, store = new ProjectStore()): Plugin {
  const cwd = resolve('../brand-collider-skills-design');
  const repository = new RelationsProductionRepository(store);
  let upstream: ReturnType<typeof createHttpServer> | undefined;
  const opening = new Map<string, Promise<{ url: string }>>();
  const open = async (id: string) => {
    const project = await store.get(id), { runtime } = await initialize();
    const folder = resolve('outputs/canvas-links'), file = resolve(folder, `${project.id}-r${project.revision}.json`);
    let sessionId: string | undefined;
    try { sessionId = JSON.parse(await readFile(file, 'utf8')).sessionId; runtime.get(sessionId!); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new RuntimeError('已有画板会话暂不可读，已保留原记录，请重试。', 409); }
    if (!sessionId) {
      const brief = canvasBrief(project);
      const session = await runtime.create({ ...brief, autoProduce: id === PRELOADED_COTTI_NAILONG_PROJECT_ID ? false : runtime.info().autoProductionConfigured === true });
      sessionId = session.id;
      await mkdir(folder, { recursive: true });
      await writeFile(file, JSON.stringify({ sessionId, projectId: id, revision: project.revision }), { flag: 'wx', mode: 0o600 });
    }
    return { url: `/canvas.html?relation=${encodeURIComponent(id)}&project=${encodeURIComponent(id)}&session=${encodeURIComponent(sessionId)}` };
  };
  const openOnce = (id: string) => {
    let work = opening.get(id);
    if (!work) { work = open(id); opening.set(id, work); }
    return work.finally(() => { if (opening.get(id) === work) opening.delete(id); });
  };
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0] ?? '';
    if (!/^\/api\/(?:canvas\/open|runtime|sessions(?:\/.*)?|production(?:\/.*)?|uploads)$/.test(path)) { next(); return; }
    const json = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host || '') || (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin))) { json(403, { error: '请从本机当前页面发起请求。' }); return; }
    try {
      if (path === '/api/canvas/open') {
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { json(405, { error: '请使用 JSON POST。' }); return; }
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new RuntimeError('请求过长。', 413); }
        const { projectId } = JSON.parse(body);
        if (typeof projectId !== 'string' || !/^project-[a-f0-9-]{36}$/.test(projectId)) throw new RuntimeError('项目编号无效。');
        json(200, await openOnce(projectId));
        return;
      }
      // Execute the original HTTP router and runtime, including uploads, dialogue,
      // generation, canvas history and export. Only saved project data is adapted.
      upstream ??= createHttpServer((await initialize()).runtime, cwd, repository);
      upstream.emit('request', req, res);
    } catch (error) { json(error instanceof RuntimeError ? error.status : 500, { error: error instanceof RuntimeError ? error.message : '画板暂不可用，项目资料已保留。' }); }
  };
  return { name: 'collider-original-canvas', configureServer(server) { server.middlewares.use(middleware); void openOnce(PRELOADED_COTTI_NAILONG_PROJECT_ID).catch(() => undefined); server.httpServer?.once('close', () => { if (upstream) void initialize().then(({ runtime }) => runtime.shutdown()); }); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
