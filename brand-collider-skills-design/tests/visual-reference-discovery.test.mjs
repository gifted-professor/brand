import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverVisualReferenceImages } from '../src/visual-reference.ts';

async function fixture(t, html) {
  const outputDir = await mkdtemp(join(tmpdir(), 'brand-page-discovery-test-'));
  let requests = 0;
  const server = createServer((req, res) => { requests += 1;
    if (req.url === '/source') { res.writeHead(302, { Location: '/news/article' }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(outputDir, { recursive: true, force: true }); });
  const network = { resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    request: (url, options, callback) => httpRequest(new URL(url.pathname + url.search, `http://127.0.0.1:${server.address().port}`), {
      headers: options.headers, method: options.method, agent: false }, callback) };
  return { outputDir, network, count: () => requests };
}

test('source-page helper extracts observed metadata, relative srcset and lazy images with exact HTML/hash retention', async t => {
  const html = `<html><title>Official release</title><meta property="og:site_name" content="Publisher"><meta property="og:image" content="https://cdn.example.com/hero.png?x=1&amp;y=2">
    <picture><source srcset="../small.webp 400w, ../large.webp 1600w"><img src="../large.webp"></picture>
    <img data-src="./detail.jpg" alt="Actual costume detail"><img src="/extra.png"></html>`;
  const f = await fixture(t, html);
  const result = await discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir }, f.network);
  assert.deepEqual(result.candidates.map(item => item.imageUrl), ['https://cdn.example.com/hero.png?x=1&y=2', 'https://example.com/large.webp', 'https://example.com/news/detail.jpg']);
  assert.deepEqual(result.candidates.map(item => item.source), ['og:image', 'srcset', 'img']);
  assert.equal(result.sourcePageFinalUrl, 'https://example.com/news/article');
  assert.equal(result.sourcePageContentHash, createHash('sha256').update(html).digest('hex'));
  assert.equal(await readFile(result.sourcePagePath, 'utf8'), html);
  assert.deepEqual(JSON.parse(await readFile(result.metadataPath, 'utf8')), result);
  assert.equal(result.title, 'Official release'); assert.equal(result.publisher, 'Publisher');
  assert.equal(f.count(), 2, 'the source page and redirect are fetched; no images or extra pages are crawled');
});

test('unsupported/private/data URLs and script/comment pseudo-images never become candidates', async t => {
  const html = `<html><script>const fake='<img src="https://example.com/script.png">';</script>
    <!-- <img src="https://example.com/comment.png"> --><img src="http://127.0.0.1/private.png">
    <img src="data:image/png;base64,AA"><img src="/vector.svg"><img src="/beacon.png" width="1" height="1">
    <img src="https://user:secret@example.com/private.png"><img src="/actual.png"></html>`;
  const f = await fixture(t, html);
  const result = await discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir }, f.network);
  assert.deepEqual(result.candidates.map(item => item.imageUrl), ['https://example.com/actual.png']);
});

test('a JavaScript-only official page is saved with no invented image paths or API calls', async t => {
  const html = '<html><title>Official SPA</title><div id="root"></div><script src="/app.js"></script></html>';
  const f = await fixture(t, html);
  const result = await discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir }, f.network);
  assert.deepEqual(result.candidates, []); assert.equal(f.count(), 2);
  assert.equal(await readFile(result.sourcePagePath, 'utf8'), html);
});

test('page-only discovery retains public-network validation and a hard three-image bound', async t => {
  const f = await fixture(t, '<img src="/actual.png">');
  await assert.rejects(discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir }, {
    ...f.network, resolveHost: async () => [{ address: '10.1.2.3', family: 4 }] }), /reference_private_address/);
  assert.equal(f.count(), 0);
  await assert.rejects(discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir, maxCandidates: 4 }, f.network), /invalid_reference_discovery/);
  assert.equal(f.count(), 0);
});

test('relative image addresses follow the observed HTML base while private base targets stay rejected', async t => {
  const f = await fixture(t, '<base href="https://cdn.example.com/release/"><img src="costume.png">');
  const result = await discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: f.outputDir }, f.network);
  assert.equal(result.candidates[0].imageUrl, 'https://cdn.example.com/release/costume.png');
  const privateBase = await fixture(t, '<base href="http://127.0.0.1/private/"><img src="secret.png"><img src="https://example.com/actual.png">');
  const safe = await discoverVisualReferenceImages({ sourcePageUrl: 'https://example.com/source', outputDir: privateBase.outputDir }, privateBase.network);
  assert.deepEqual(safe.candidates.map(item => item.imageUrl), ['https://example.com/actual.png']);
});
