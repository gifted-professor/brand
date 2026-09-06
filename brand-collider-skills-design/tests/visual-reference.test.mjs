import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { collectVisualReference, downloadPublicReference, isPublicReferenceAddress, publicReferenceUrl, VisualReferenceError } from '../src/visual-reference.ts';

// All network traffic is intercepted into an ephemeral local server after normal
// public-address validation. The CLI has no equivalent network override.
const publicAddress = '93.184.216.34';
const page = '<html><head><title>Collection &amp; Season</title><meta content="Example Publisher" property="og:site_name"></head><body><img src="https://example.com/observed.png"></body></html>';
const png = await sharp({ create: { width: 24, height: 18, channels: 4, background: '#c8e8ffff' } }).png().toBuffer();

async function fixture(t, handler) {
  const root = await mkdtemp(join(tmpdir(), 'brand-reference-test-'));
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, headers: req.headers });
    if (handler?.(req, res)) return;
    if (req.url === '/source') { res.writeHead(302, { Location: '/article' }); res.end(); }
    else if (req.url === '/article') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); }
    else if (req.url === '/observed.png') { res.writeHead(302, { Location: '/asset.png' }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const resolutions = [], pins = [];
  const network = {
    resolveHost: async hostname => { resolutions.push(hostname); return [{ address: publicAddress, family: 4 }]; },
    request: (url, options, callback) => {
      options.lookup(url.hostname, { all: true }, (error, addresses) => { assert.equal(error, null); pins.push(addresses); });
      return httpRequest(new URL(url.pathname + url.search, `http://127.0.0.1:${server.address().port}`), {
        method: options.method, agent: false, headers: options.headers,
      }, callback);
    },
  };
  return { root, requests, resolutions, pins, network, input: {
    sourcePageUrl: 'https://example.com/source', imageUrl: 'https://example.com/observed.png',
    outputDir: join(root, 'references'), subject: 'Observed character artwork', version: 'Summer collection', sourceClass: 'official',
  } };
}
const rejectsCode = (fn, code) => assert.rejects(fn, error => error instanceof VisualReferenceError && error.message === code);

test('collects exact source pixels with final URLs and explicit unverified provenance', async t => {
  const f = await fixture(t);
  const reference = await collectVisualReference(f.input, f.network);
  assert.deepEqual(await readFile(reference.localPath), png, 'preserve original bytes, including visible watermarks');
  assert.deepEqual(JSON.parse(await readFile(reference.metadataPath, 'utf8')), reference);
  assert.equal(reference.contentHash, createHash('sha256').update(png).digest('hex'));
  assert.equal(reference.sourcePageContentHash, createHash('sha256').update(page).digest('hex'));
  assert.equal(reference.sourcePageFinalUrl, 'https://example.com/article');
  assert.equal(reference.imageFinalUrl, 'https://example.com/asset.png');
  assert.equal(reference.width, 24); assert.equal(reference.height, 18); assert.equal(reference.bytes, png.length);
  assert.equal(reference.mimeType, 'image/png');
  assert.equal(reference.title, 'Collection & Season'); assert.equal(reference.titleSource, 'page_title');
  assert.equal(reference.publisher, 'Example Publisher'); assert.equal(reference.publisherSource, 'page_metadata');
  for (const key of ['sourceClassVerification', 'sourceRelationship', 'visualInspection', 'identityVerification', 'usageRights']) assert.equal(reference[key], 'unverified', key);
  assert.equal(reference.sourceClass, 'official', 'caller classification remains distinct from verification');
  assert.ok(Number.isFinite(Date.parse(reference.pageRetrievedAt))); assert.ok(Number.isFinite(Date.parse(reference.retrievedAt)));
  assert.deepEqual(f.requests.map(r => r.path), ['/source', '/article', '/observed.png', '/asset.png']);
  assert.equal(f.resolutions.length, 4, 'each redirect resolves and validates afresh');
  assert.deepEqual(f.pins, Array(4).fill([{ address: publicAddress, family: 4 }]));
  for (const request of f.requests) {
    assert.equal(request.headers.authorization, undefined); assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers['accept-encoding'], 'identity');
  }
  assert.equal((await stat(reference.localPath)).mode & 0o777, 0o600);
});

test('caller metadata is labeled data and never becomes identity or rights verification', async t => {
  const f = await fixture(t);
  const reference = await collectVisualReference({ ...f.input, title: 'Supplied title', publisher: 'Supplied publisher', sourceClass: 'third_party' }, f.network);
  assert.equal(reference.title, 'Supplied title'); assert.equal(reference.titleSource, 'caller');
  assert.equal(reference.publisherSource, 'caller'); assert.equal(reference.sourceClass, 'third_party');
  assert.equal(reference.identityVerification, 'unverified');
});

test('blocks loopback, private, reserved and IPv6 tunnel addresses including disguised URLs', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '192.0.2.1',
    '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1', '2001::1', '3fff::1']) assert.equal(isPublicReferenceAddress(address), false, address);
  for (const address of ['8.8.8.8', publicAddress, '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicReferenceAddress(address), true, address);
  for (const url of ['http://2130706433', 'http://0x7f000001', 'http://127.1', 'http://[::ffff:7f00:1]', 'http://foo.local', 'http://localhost.', 'http://intranet',
    'file:///tmp/private.png', 'ftp://example.com/a', 'https://user:secret@example.com/a', 'https://example.com:8443/a']) assert.throws(() => publicReferenceUrl(url), VisualReferenceError, url);
});

test('rejects mixed public/private DNS answers before connecting and does not retry', async t => {
  const f = await fixture(t);
  const network = { ...f.network, resolveHost: async () => [{ address: publicAddress, family: 4 }, { address: '127.0.0.1', family: 4 }] };
  await rejectsCode(() => collectVisualReference(f.input, network), 'reference_private_address');
  assert.equal(f.requests.length, 0);
  await assert.rejects(stat(f.input.outputDir), { code: 'ENOENT' });
});

test('every redirect enforces the public boundary and rejects HTTPS downgrades', async t => {
  for (const [location, code] of [['http://169.254.169.254/latest/meta-data', 'reference_private_address'], ['http://example.com/image', 'reference_https_downgrade'],
    ['https://private.example.com/image', 'reference_private_address']]) {
    const f = await fixture(t, (_req, res) => { res.writeHead(302, { Location: location }); res.end(); return true; });
    const network = { ...f.network, resolveHost: async hostname => [{ address: hostname === 'private.example.com' ? '10.0.0.1' : publicAddress, family: 4 }] };
    await rejectsCode(() => downloadPublicReference(f.input.sourcePageUrl, 'page', network), code);
    assert.equal(f.requests.length, 1, 'blocked redirect never connects');
  }
});

test('redirect loops and hanging network/DNS calls stop at their bounds', async t => {
  const loop = await fixture(t, (_req, res) => { res.writeHead(302, { Location: '/again' }); res.end(); return true; });
  await rejectsCode(() => downloadPublicReference(loop.input.sourcePageUrl, 'page', loop.network), 'reference_redirect_limit');
  assert.equal(loop.requests.length, 4);
  const hanging = await fixture(t, () => true);
  await rejectsCode(() => downloadPublicReference(hanging.input.sourcePageUrl, 'page', hanging.network, 30), 'reference_download_timeout');
  assert.equal(hanging.requests.length, 1);
  await rejectsCode(() => downloadPublicReference(hanging.input.sourcePageUrl, 'page', { resolveHost: () => new Promise(() => {}) }, 30), 'reference_download_timeout');
});

test('blocked pages stop before image collection; bodies and URL secrets never appear in errors', async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(403); res.end('private-source-diagnostic'); return true; });
  await rejectsCode(() => collectVisualReference(f.input, f.network), 'reference_http_403');
  assert.equal(f.requests.length, 1);
  await assert.rejects(stat(f.input.outputDir), { code: 'ENOENT' });
  assert.throws(() => publicReferenceUrl('https://user:secret@example.com/a'), error => !error.message.includes('secret'));
});

test('rejects oversized, compressed and non-raster response bodies without writing files', async t => {
  for (const [headers, bytes, code] of [
    [{ 'Content-Type': 'image/png', 'Content-Length': String(6 * 1024 * 1024 + 1) }, '', 'reference_download_too_large'],
    [{ 'Content-Type': 'image/png', 'Content-Encoding': 'gzip' }, png, 'reference_content_encoding_rejected'],
    [{ 'Content-Type': 'text/html' }, '<html>login required</html>', 'reference_content_type_rejected'],
    [{ 'Content-Type': 'image/svg+xml' }, '<svg/>', 'reference_content_type_rejected'],
    [{ 'Content-Type': 'image/png' }, png.subarray(0, 50), 'reference_invalid_raster'],
    [{ 'Content-Type': 'image/png' }, Buffer.concat([png.subarray(0, 33), Buffer.from('corrupt pixels')]), 'reference_invalid_raster'],
    [{ 'Content-Type': 'image/jpeg' }, png, 'reference_mime_mismatch'],
  ]) {
    const f = await fixture(t, (req, res) => { if (req.url !== '/observed.png') return false; res.writeHead(200, headers); res.end(bytes); return true; });
    await rejectsCode(() => collectVisualReference(f.input, f.network), code);
    await assert.rejects(stat(f.input.outputDir), { code: 'ENOENT' });
  }
});

test('streaming byte limit works without content-length and invalid classification does no network I/O', async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.write(Buffer.alloc(2 * 1024 * 1024)); res.end('overflow'); return true; });
  await rejectsCode(() => downloadPublicReference(f.input.sourcePageUrl, 'page', f.network), 'reference_download_too_large');
  const before = f.requests.length;
  await rejectsCode(() => collectVisualReference({ ...f.input, sourceClass: 'verified_official' }, f.network), 'invalid_reference_source_class');
  assert.equal(f.requests.length, before);
  assert.deepEqual(await readdir(f.root), []);
});
