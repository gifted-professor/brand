import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProductionRepository, PRODUCTION_PROJECT_ID, PRODUCTION_SOURCE_THREAD } from '../src/server/production.ts';
import { ColliderRuntime } from '../src/server/runtime.ts';
import { createHttpServer } from '../src/server/index.ts';

const cwd = resolve(import.meta.dirname, '..');
// A complete, real 1×1 PNG (not an extension-only fake asset).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=', 'base64');
const kit = 'campaign-kit-I5-v1';
const material = (id, family, files = [], executionStatus = 'available', dependsOn = []) => ({ materialId: id, family, title: id, files, executionStatus, reviewStatus: 'unverified', dependsOn });
const manifest = materials => ({ schemaVersion: 'local-campaign-kit-1.0', conceptId: 'I5', title: '真实制作样板', status: 'in_progress', selectionStatus: 'sample_not_user_locked', materials });

async function fixture(t, materials = []) {
  const root = await mkdtemp(join(tmpdir(), 'collider-production-'));
  const write = async (path, value) => { const target = join(root, path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value); };
  await write('brief.json', { brands: [{ name: 'MANNER' }, { name: '王者荣耀' }], workingGoal: '真实目标：理解风味价值', status: 'awaiting_concept_selection', selectedConceptId: 'stale-concept' });
  await write('CURRENT.md', '旧 brief 的等待选择已经失效。');
  await write('research-manner.md', 'MANNER 的真实研究正文与待确认资源。');
  await write('research-hok.md', '王者荣耀的真实品牌研究，未提供官方授权。');
  await write('tournament/run.json', { goal: '讨论现有风味体验', mainProposals: [{ candidateId: 'I5', title: '李信·一豆两境' }, { candidateId: 'I3', title: '长安失香案' }], userSelectedConceptId: null });
  await write('tournament/finalists.md', '真实成熟方案正文：I5 的双小杯体验与 I3 的长安故事。');
  await write(`${kit}/manifest.json`, manifest(materials));
  const repo = new ProductionRepository(root);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, write, repo, get: () => repo.get(PRODUCTION_PROJECT_ID) };
}
async function httpFixture(t, materials = []) {
  const f = await fixture(t, materials), outputDir = await mkdtemp(join(tmpdir(), 'collider-production-sessions-'));
  let calls = 0;
  const runtime = new ColliderRuntime({ cwd, outputDir, provider: { async complete() { calls++; throw new Error('This test must never request a model'); } } });
  await runtime.init();
  const server = createHttpServer(runtime, cwd, f.repo);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await runtime.shutdown(); await rm(outputDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  return { ...f, runtime, base, post, calls: () => calls };
}

test('maps actual manifest files and dependencies, keeps sample status and does not pass missing video as a film', async t => {
  const f = await fixture(t, [material('S01', 'story', [{ path: 'story-bible.md' }]), material('P01', 'physical', [{ path: 'paper.png' }], 'available', ['S01']),
    material('B01', 'video_prep', [{ path: 'video/script.json' }], 'available', ['P01']), material('VIDEO01', 'video', [], 'out_of_scope', ['B01']),
    material('EMPTY', 'campaign', [{ path: 'empty.png' }], 'succeeded'), material('BAD', 'campaign', [{ path: 'bad.png' }], 'available')]);
  await f.write(`${kit}/story-bible.md`, '实际故事：先尝两种表达，再作选择。');
  await f.write(`${kit}/paper.png`, png);
  await f.write(`${kit}/video/script.json`, { shots: [{ duration: 5 }], video_is_generated: false });
  await f.write(`${kit}/empty.png`, Buffer.alloc(0));
  await f.write(`${kit}/bad.png`, 'not an image');
  const project = await f.get(), node = id => project.nodes.find(node => node.id.endsWith(`-${id}`));
  assert.equal(project.selectionStatus, 'sample');
  assert.equal(node('P01').status, 'available');
  assert.equal(node('VIDEO01').status, 'planned'); assert.equal(node('VIDEO01').assetIds.length, 0);
  assert.match(node('VIDEO01').summary, /不生成实际视频/);
  assert.equal(node('B01').kind, 'document');
  assert.equal(node('EMPTY').status, 'unverified'); assert.equal(node('BAD').status, 'unverified');
  assert.equal(project.assets.some(asset => asset.kind === 'video'), false);
  assert.ok(project.edges.some(edge => edge.source === node('S01').id && edge.target === node('P01').id));
  const paper = project.assets.find(asset => asset.name === 'paper.png');
  assert.equal(paper.width, 1); assert.equal(paper.height, 1);
  assert.equal(paper.url.includes(f.root), false);
  assert.ok(project.notes.some(note => note.includes('格式无效')));
});

test('refreshes completed manifest additions and keeps last complete JSON during partial producer writes', async t => {
  const first = material('P01', 'physical', [{ path: 'paper.png' }]);
  const f = await fixture(t, [first]); await f.write(`${kit}/paper.png`, png);
  const original = await f.get(); assert.ok(original.assets.some(asset => asset.name === 'paper.png'));
  await f.write(`${kit}/manifest.json`, '');
  const duringWrite = await f.get(); assert.ok(duringWrite.assets.some(asset => asset.name === 'paper.png'));
  assert.ok(duringWrite.notes.some(note => note.includes('最近一次完整清单')));
  await f.write(`${kit}/new.png`, png);
  await f.write(`${kit}/manifest.json`, manifest([first, material('P02', 'physical', [{ path: 'new.png' }])]));
  const next = await f.get(); assert.ok(next.assets.some(asset => asset.name === 'new.png'));
  await rm(join(f.root, kit, 'paper.png'));
  const removed = await f.get(); assert.equal(removed.assets.some(asset => asset.name === 'paper.png'), false);
  assert.equal(removed.nodes.find(node => node.id.endsWith('-P01')).status, 'unverified');
});

test('material views prioritize effects and visual roles, keep appendix last, and accept D01 without duplicate generated fallback', async t => {
  const generatedId = 'image-12345678-abcd-1234-abcd-123456789abc';
  const files = [
    { path: 'physical/structure.png', role: 'appendix' },
    { path: 'views/ordinary.png' },
    { path: 'effects/P01-holder.png' },
    { path: 'views/hero.png', role: 'hero' },
    { path: 'views/render.png', role: 'product_render' },
    { path: 'views/effect.png', role: 'effect' },
    { path: 'effects/appendix.png', role: 'appendix' },
  ];
  const f = await fixture(t, [material('P01', 'physical', files), material('D01', 'physical', [{ path: `generated/${generatedId}/image.png`, role: 'hero' }], 'available', ['P01'])]);
  for (const file of files) await f.write(`${kit}/${file.path}`, png);
  await f.write(`${kit}/generated/${generatedId}/image.png`, png);
  await f.write(`${kit}/generated/${generatedId}/asset.json`, { assetId: generatedId, generationStatus: 'succeeded', reviewStatus: 'unverified' });
  const project = await f.get(), holder = project.nodes.find(node => node.id.endsWith('-P01')), drinks = project.nodes.find(node => node.id.endsWith('-D01'));
  const name = id => project.assets.find(asset => asset.id === id).name;
  assert.deepEqual(holder.assetIds.map(name), ['P01-holder.png', 'hero.png', 'render.png', 'effect.png', 'ordinary.png', 'structure.png', 'appendix.png']);
  assert.equal(drinks.kind, 'material'); assert.equal(drinks.status, 'available');
  assert.ok(project.edges.some(edge => edge.source === holder.id && edge.target === drinks.id));
  assert.equal(project.nodes.some(node => node.id.includes(`generated-${generatedId}`)), false);
  assert.equal(project.assets.filter(asset => asset.id === drinks.assetIds[0]).length, 1);
  const stableIds = new Map(project.assets.map(asset => [asset.name, asset.id]));
  await f.write(`${kit}/manifest.json`, manifest([material('P01', 'physical', files.toReversed()), material('D01', 'physical', [{ path: `generated/${generatedId}/image.png`, role: 'hero' }])]));
  const refreshed = await f.get();
  assert.ok(refreshed.assets.every(asset => stableIds.get(asset.name) === asset.id));
});

test('an existing review document stays unverified when its first run file is missing, partial or lacks visualReview', async t => {
  const f = await fixture(t);
  await f.write('materials-v1/post-render-review.md', '真实自检文档，角色仍待确认。');
  for (const contents of [undefined, '', '{', {}]) {
    if (contents !== undefined) await f.write('materials-v1/run.json', contents);
    // Each reader starts without a cached snapshot, as on the first page load.
    const project = await new ProductionRepository(f.root).get(PRODUCTION_PROJECT_ID);
    const review = project.nodes.find(node => node.id === 'static-review');
    assert.ok(review);
    assert.equal(review.status, 'unverified');
    assert.match(review.content, /真实自检文档/);
    assert.equal(project.selectionStatus, 'sample');
  }
});

test('explicit primaryFile and file priorities select only verified primary media and preserve reviewed limitations', async t => {
  const fields = { executionStatus: 'saved', reviewStatus: 'reviewed_with_limits', limitations: ['效果探索，未作工程验证。'] };
  const f = await fixture(t);
  await f.write(`${kit}/manifest.json`, { ...manifest([
    { ...material('P01', 'physical', [
      { path: 'effects/appendix.png', priority: 'appendix' },
      { path: 'effects/supporting.png', priority: 'supporting' },
      { path: 'ordinary-primary.png', priority: 'primary' },
      { path: 'chosen.png', priority: 'supporting' },
      { path: 'P01-provider.json', priority: 'primary' },
    ]), ...fields, primaryFile: 'chosen.png' },
    { ...material('D01', 'physical', [{ path: 'ordinary-primary.png', priority: 'primary' }]), ...fields, primaryFile: 'missing.png' },
    { ...material('P02', 'physical', [{ path: 'ordinary-primary.png', priority: 'primary' }]), ...fields, primaryFile: 'broken.png' },
    { ...material('C01', 'campaign', [{ path: 'text.md', priority: 'primary' }, { path: 'ordinary-primary.png', priority: 'primary' }]), ...fields },
    material('K01-K06', 'storyboard', [], 'planned'), material('VIDEO01', 'video', [], 'out_of_scope'),
  ]), primaryDisplayOrder: ['D01', 'P01', 'C01'] });
  for (const path of ['effects/appendix.png', 'effects/supporting.png', 'ordinary-primary.png', 'chosen.png']) await f.write(`${kit}/${path}`, png);
  await f.write(`${kit}/broken.png`, 'not a real image');
  await f.write(`${kit}/text.md`, '真实字稿');
  await f.write(`${kit}/P01-provider.json`, { credential: 'MUST_NOT_BE_IMPORTED' });
  const project = await f.get(), node = id => project.nodes.find(node => node.id.endsWith(`-${id}`)), asset = id => project.assets.find(asset => asset.id === id);
  assert.deepEqual(node('P01').assetIds.map(id => asset(id).name), ['chosen.png', 'ordinary-primary.png', 'supporting.png', 'appendix.png']);
  assert.equal(asset(node('P01').primaryAssetId).name, 'chosen.png');
  assert.equal(node('D01').primaryAssetId, undefined); assert.equal(node('P02').primaryAssetId, undefined);
  assert.equal(asset(node('C01').primaryAssetId).name, 'ordinary-primary.png');
  assert.equal(node('D01').displayOrder, 0); assert.equal(node('P01').displayOrder, 1); assert.equal(node('C01').displayOrder, 2); assert.equal(node('P02').displayOrder, undefined);
  assert.equal(node('P01').statusLabel, '已保存 / 已审阅·保留限制'); assert.match(node('P01').summary, /已审阅·保留限制.*未作工程验证/);
  assert.match(node('P01').content, /reviewed_with_limits/); assert.match(node('P01').content, /未作工程验证/);
  assert.doesNotMatch(JSON.stringify(project), /P01-provider|MUST_NOT_BE_IMPORTED/);
  assert.equal(node('K01-K06').status, 'planned'); assert.equal(node('K01-K06').assetIds.length, 0);
  assert.equal(node('VIDEO01').statusLabel, '本轮不生成');
});

test('large SVG stays a sandboxed document attachment without importing embedded data or widening text limits', async t => {
  const f = await httpFixture(t, [material('P01', 'physical', [{ path: 'large.svg', priority: 'appendix', sha256: '0'.repeat(64) }, { path: 'large.txt' }])]);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,EMBEDDED_DATA_MARKER' + 'a'.repeat(3 * 1024 * 1024) + '"/></svg>';
  await f.write(`${kit}/large.svg`, svg);
  await f.write(`${kit}/large.txt`, 'x'.repeat(3 * 1024 * 1024));
  const project = await f.get(), asset = project.assets.find(asset => asset.name === 'large.svg'), node = project.nodes.find(node => node.id.endsWith('-P01'));
  assert.ok(asset); assert.equal(asset.kind, 'document'); assert.equal(asset.size, Buffer.byteLength(svg));
  assert.equal(asset.sha256, undefined); assert.equal(node.primaryAssetId, undefined);
  assert.equal(project.assets.some(asset => asset.name === 'large.txt'), false);
  assert.equal(project.notes.some(note => note.includes('large.svg')), false);
  assert.doesNotMatch(JSON.stringify(project), /EMBEDDED_DATA_MARKER/);
  const response = await fetch(f.base + asset.url);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.match(response.headers.get('content-security-policy'), /sandbox/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-type'), 'image/svg+xml'); assert.equal(await response.text(), svg);
});

test('rejects traversal, absolute paths, secrets, non-media files and symlink escapes even when manifest lists them', async t => {
  const outside = await mkdtemp(join(tmpdir(), 'collider-private-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'private.png'), png);
  const f = await fixture(t, [material('P01', 'physical', [
    { path: '../../private.png' }, { path: join(outside, 'private.png') }, { path: 'escape.png' }, { path: 'sub/private.png' },
    { path: '.env.local' }, { path: 'keys.json' }, { path: 'logs/trace.txt' }, { path: 'image-provider-result.json' }, { path: 'program.mjs' },
  ])]);
  await symlink(join(outside, 'private.png'), join(f.root, kit, 'escape.png'));
  await symlink(outside, join(f.root, kit, 'sub'));
  for (const path of ['.env.local', 'keys.json', 'logs/trace.txt', 'image-provider-result.json', 'program.mjs']) await f.write(`${kit}/${path}`, '{"secret":"DO_NOT_EXPOSE"}');
  const project = await f.get(); assert.equal(project.nodes.find(node => node.id.endsWith('-P01')).assetIds.length, 0);
  assert.doesNotMatch(JSON.stringify(project), /DO_NOT_EXPOSE|private\.png|program\.mjs/);
  assert.throws(() => f.repo.get('another-project'), error => error.status === 404);
});

test('asset API streams Range and HEAD, attaches documents, rejects missing IDs and rechecks replaced symlinks', async t => {
  const f = await httpFixture(t, [material('P01', 'physical', [{ path: 'paper.png' }]), material('S01', 'story', [{ path: 'story-bible.md' }])]);
  await f.write(`${kit}/paper.png`, png); await f.write(`${kit}/story-bible.md`, 'Readable real source document');
  const project = await (await fetch(`${f.base}/api/production/projects/${PRODUCTION_PROJECT_ID}`)).json();
  const image = project.assets.find(asset => asset.name === 'paper.png'), doc = project.assets.find(asset => asset.name === 'story-bible.md');
  const ranged = await fetch(f.base + image.url, { headers: { Range: 'bytes=3-12' } });
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), `bytes 3-12/${png.length}`);
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), png.subarray(3, 13));
  assert.equal(ranged.headers.get('x-content-type-options'), 'nosniff');
  const suffix = await fetch(f.base + image.url, { headers: { Range: 'bytes=-4' } }); assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), png.subarray(-4));
  const invalid = await fetch(f.base + image.url, { headers: { Range: 'bytes=999999-' } }); assert.equal(invalid.status, 416);
  const head = await fetch(f.base + image.url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(png.length)); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const attachment = await fetch(f.base + doc.url); assert.match(attachment.headers.get('content-disposition'), /attachment/);
  assert.match((await fetch(f.base + image.downloadUrl)).headers.get('content-disposition'), /attachment/);
  assert.equal((await fetch(`${f.base}/api/production/projects/${PRODUCTION_PROJECT_ID}/assets/asset-${'0'.repeat(24)}`)).status, 404);
  const outside = join(f.root, '..', `outside-${Date.now()}.png`); await writeFile(outside, png); t.after(() => rm(outside, { force: true }));
  await rm(join(f.root, kit, 'paper.png')); await symlink(outside, join(f.root, kit, 'paper.png'));
  assert.equal((await fetch(f.base + image.url)).status, 404);
});

test('discuss imports real sources into idle live session with no invented dialogue and no model requests', async t => {
  const f = await httpFixture(t, [material('S01', 'story', [{ path: 'story-bible.md' }])]);
  await f.write(`${kit}/story-bible.md`, '真实故事母本：先尝两种表达，再选喜欢的一杯。');
  const response = await f.post(`/api/production/projects/${PRODUCTION_PROJECT_ID}/discuss`, { conceptId: 'I5', prompt: '只讨论点单卡，不增加赠品。' });
  assert.equal(response.status, 201);
  const session = await response.json(); assert.equal(session.mode, 'live'); assert.equal(session.status, 'idle');
  assert.equal(session.selectedConceptId, undefined); assert.deepEqual(session.concepts, []); assert.deepEqual(session.completedSkills, []);
  assert.equal(session.messages.some(message => message.role === 'a' || message.role === 'b'), false);
  assert.equal(f.calls(), 0); assert.ok(session.constraints.includes('只讨论点单卡，不增加赠品。'));
  const files = session.brands.flatMap(brand => brand.files), source = JSON.parse(files.find(file => file.name === 'source.json').text);
  assert.equal(source.projectId, PRODUCTION_PROJECT_ID); assert.equal(source.sourceThreadId, PRODUCTION_SOURCE_THREAD); assert.equal(source.discussionConceptId, 'I5');
  assert.equal(source.selectionStatus, 'sample'); assert.match(files.find(file => file.name === 'production-context.md').text, /真实故事母本/);
  assert.match(JSON.stringify(files), /真实品牌研究|真实研究正文/);
  assert.equal(f.runtime.get(session.id).status, 'idle');
  assert.equal((await f.post(`/api/production/projects/${PRODUCTION_PROJECT_ID}/discuss`, { conceptId: 'unknown' })).status, 404);
  assert.equal((await f.post(`/api/production/projects/${PRODUCTION_PROJECT_ID}/discuss`, { prompt: 'x'.repeat(2001) })).status, 400);
  assert.equal(f.calls(), 0);
});
