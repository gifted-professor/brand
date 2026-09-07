import { sessionWorkflow } from '../../brand-collider-skills-design/web/workflow-stage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { ProjectStore } from './projectsApi';
import { canvasBrief, fullWorkflowBrief, createCanvasOpener, productionProject, RelationsProductionRepository } from './canvasIntegration';
import { DEMO_BRANDS } from '../src/collaboration/fixtures';
import { ColliderRuntime } from '../../brand-collider-skills-design/src/server/runtime';
import { createHttpServer } from '../../brand-collider-skills-design/src/server/index';
import type { Session } from '../../brand-collider-skills-design/src/collider-types';

describe('original COLLIDER canvas integration', () => {
  let directory: string, store: ProjectStore, runtime: ColliderRuntime, server: ReturnType<typeof createHttpServer>, base: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'brand-canvas-integration-'));
    store = new ProjectStore(join(directory, 'projects'));
    const cwd = resolve('../brand-collider-skills-design');
    runtime = new ColliderRuntime({ cwd, outputDir: join(directory, 'sessions'), demoDelayMs: 0 });
    await runtime.init();
    server = createHttpServer(runtime, cwd, new RelationsProductionRepository(store));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await runtime?.shutdown(); if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
  async function project() { return store.create({ brands: { a: DEMO_BRANDS[0], b: DEMO_BRANDS[1] } }); }
  async function post(path: string, body: unknown) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBeLessThan(300);
    return response.json();
  }
  it('carries each original VI and both distinct channel images into native canvas nodes', async () => {
    const saved = await project();
    const result = await fetch(`${base}/api/production/projects/${saved.id}`).then(response => response.json());
    expect(result.brandNames).toEqual(['库迪咖啡', '奶龙']);
    expect(result.assets).toHaveLength(2);
    expect(new Set(result.assets.map((asset: { url: string }) => asset.url)).size).toBe(2);
    expect(result.nodes.filter((node: { kind: string }) => node.kind === 'image').every((node: { status: string }) => node.status === 'unverified')).toBe(true);
    expect(canvasBrief(saved).constraints.join('')).toContain('不合并两套 VI');
    expect(canvasBrief(saved).brands[0].files[0].text).toContain('#D52127');
    expect(canvasBrief(saved).brands[1].files[0].text).toContain('#F6C900');
    expect((await store.get(saved.id)).invitation.status).toBe('draft');
  });
  it('runs and revises dialogue through the original HTTP router and runtime, with export and restore', async () => {
    const saved = await project();
    const session = await post('/api/sessions', { ...canvasBrief(saved), mode: 'demo' }) as Session;
    const revised = await post(`/api/sessions/${session.id}/intervene`, { text: '仅制作双方渠道互荐内容，保留现有标识。', restartFrom: 1 }) as Session;
    expect(revised.revision).toBe(2);
    expect(revised.status).toBe('paused');
    await post(`/api/sessions/${session.id}/run`, {});
    await runtime.waitForIdle(session.id);
    const completed = runtime.get(session.id);
    expect(completed.status).toBe('completed');
    expect(completed.completedSkills).toContain('campaign-copy');
    expect(completed.completedSkills).toContain('visual-production');
    expect(completed.proposal?.imageUrl).toBeUndefined();
    const exported = await fetch(`${base}/api/sessions/${session.id}/export`);
    expect(exported.headers.get('content-type')).toContain('text/markdown');
    expect(await exported.text()).toContain('库迪咖啡');
    const restored = new ColliderRuntime({ cwd: resolve('../brand-collider-skills-design'), outputDir: join(directory, 'sessions') });
    await restored.init(); expect(restored.get(session.id).revision).toBe(2); await restored.shutdown();
    // Session changes never overwrite the saved source brief or template files.
    expect((await store.get(saved.id)).revision).toBe(1);
    expect(await readdir(join(store.directory, saved.id))).toContain('revision-1.json');
  });
  it('opens an independent full workflow once and restores it without overwriting the preview', async () => {
    const saved = await project();
    const links = join(directory, 'links');
    const open = createCanvasOpener(async () => ({ runtime }), store, links);
    const preview = await open(saved.id);
    const info = vi.spyOn(runtime, 'info').mockReturnValue({ ...runtime.info(), configured: true, autoProductionConfigured: true });
    try {
      const [first, duplicate] = await Promise.all([open(saved.id, true), open(saved.id, true)]);
      expect(first.session.id).toBe(duplicate.session.id);
      expect(first.session.id).not.toBe(preview.session.id);
      expect(first.session.autoProduce).toBe(true);
      expect(first.session.autoAdvance).toBe(true);
      expect(first.session.goal).toContain('逐件物料清单');
      expect(first.session.constraints.join('')).not.toContain('不开发新商品');
      expect(first.url).toContain('workflow=full');
      const reopened = await createCanvasOpener(async () => ({ runtime }), store, links)(saved.id);
      expect(reopened.session.id).toBe(first.session.id);
      expect(runtime.get(preview.session.id)).toEqual(preview.session);
      expect((await store.get(saved.id)).revision).toBe(1);
    } finally { info.mockRestore(); }
  });
  it('reports an unavailable model and enables text-only workflow when images are unavailable', async () => {
    const saved = await project();
    const open = createCanvasOpener(async () => ({ runtime }), store, join(directory, 'text-links'));
    const before = runtime.list().length;
    await expect(open(saved.id, true)).rejects.toThrow('协作模型尚未连接');
    expect(runtime.list()).toHaveLength(before);
    const info = vi.spyOn(runtime, 'info').mockReturnValue({ ...runtime.info(), configured: true, autoProductionConfigured: false });
    try { expect((await open(saved.id, true)).session.autoProduce).toBe(false); }
    finally { info.mockRestore(); }
  });
  it('advances the full nine-step workflow with source brands, auto-selection and saved deliverables', async () => {
    const saved = await project();
    const brief = fullWorkflowBrief(saved);
    expect(brief.brands).toEqual(canvasBrief(saved).brands);
    const session = await post('/api/sessions', { ...brief, mode: 'demo' }) as Session;
    await post(`/api/sessions/${session.id}/run`, {});
    await runtime.waitForIdle(session.id);
    const completed = runtime.get(session.id);
    expect(completed.status).toBe('completed');
    expect(completed.selectionSource).toBe('orchestrator');
    expect(sessionWorkflow(completed, new Set())?.completedSteps).toBe(9);
    expect(completed.proposal?.sections.length).toBeGreaterThan(0);
    expect((await store.get(saved.id)).invitation.status).toBe('draft');
  });
  it('rejects unknown projects and preserves source text safely in SVG assets', async () => {
    const response = await fetch(`${base}/api/production/projects/project-00000000-0000-0000-0000-000000000000`);
    expect(response.status).toBe(404);
    const saved = await store.create({ brands: { a: { ...DEMO_BRANDS[0], brand: { ...DEMO_BRANDS[0].brand, name: '<script>alert(1)</script>' } }, b: DEMO_BRANDS[1] } });
    const file = saved.previews[0].a.split('/').at(-1)!;
    const svg = await store.asset(saved.id, file);
    expect(svg.toString()).not.toContain('<script>');
    expect(svg.toString()).toContain('&lt;script&gt;');
    expect(productionProject(saved).nodes).toHaveLength(5);
    expect(JSON.parse(await readFile(join(store.directory, saved.id, 'revision-1.json'), 'utf8')).brands.a.brand.name).toBe('<script>alert(1)</script>');
  });
});
