import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { resolveReferenceHost } from '../src/reference-dns.ts';
import { downloadPublicReference, isPublicReferenceAddress } from '../src/visual-reference.ts';

const hostname = 'brand.example.com';
const publicA = { address: '93.184.216.34', family: 4 };
const publicAAAA = { address: '2606:4700:4700::1111', family: 6 };
const fakeA = { address: '198.18.0.68', family: 4 };
const answer = (type, values = []) => ({ Status: 0, TC: false, CD: false, Question: [{ name: `${hostname}.`, type }], Answer: values });
const record = (type, data, name = `${hostname}.`) => ({ name, type, data, TTL: 30 });

function fixture(makeResponse = type => ({ json: answer(type, type === 1 ? [record(1, publicA.address)] : []) }), addresses = [fakeA]) {
  const requests = [];
  const network = {
    lookup: async () => addresses,
    request: (url, options, callback) => {
      const req = new EventEmitter();
      req.destroyed = false; req.destroy = () => { req.destroyed = true; return req; };
      const entry = { url, options, req }; requests.push(entry);
      req.end = () => queueMicrotask(() => {
        if (req.destroyed) return;
        const config = makeResponse(Number(url.searchParams.get('type')));
        if (config.silent) return;
        if (config.error) { req.emit('error', new Error(config.error)); return; }
        const res = new PassThrough(); entry.response = res;
        res.statusCode = config.status ?? 200;
        res.headers = { 'content-type': 'application/dns-json', ...config.headers };
        callback(res);
        if (!res.destroyed) res.end(config.raw ?? JSON.stringify(config.json));
      });
      return req;
    },
  };
  return { network, requests };
}

test('normal, failed and mixed system DNS never invoke public DoH', async () => {
  for (const addresses of [[], [publicA], [publicA, publicAAAA], [{ address: '127.0.0.1', family: 4 }],
    [fakeA, publicA], [fakeA, { address: '10.0.0.1', family: 4 }], [fakeA, { address: '::1', family: 6 }],
    [{ address: '198.20.0.1', family: 4 }], [{ address: '198.18.0.1', family: 6 }]]) {
    const f = fixture(undefined, addresses);
    assert.equal(await resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), addresses);
    assert.equal(f.requests.length, 0);
  }
  const f = fixture(); f.network.lookup = async () => { throw new Error('ENOTFOUND'); };
  await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /ENOTFOUND/);
  assert.equal(f.requests.length, 0);
});

test('only exclusive 198.18/15 answers use a fixed TLS resolver, A and AAAA queries, and public results', async () => {
  const f = fixture(type => ({ json: answer(type, [record(type, type === 1 ? publicA.address : publicAAAA.address)]) }),
    [fakeA, { address: '198.19.255.254', family: 4 }]);
  assert.deepEqual(await resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), [publicA, publicAAAA]);
  assert.equal(f.requests.length, 2);
  for (const { url, options } of f.requests) {
    assert.equal(url.origin, 'https://cloudflare-dns.com'); assert.equal(url.pathname, '/dns-query');
    assert.equal(url.searchParams.get('name'), hostname); assert.equal(url.searchParams.get('cd'), 'false');
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.servername, 'cloudflare-dns.com');
    assert.equal(options.minVersion, 'TLSv1.2'); assert.equal(options.agent, false);
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
    options.lookup('cloudflare-dns.com', { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: '1.1.1.1', family: 4 }]); });
    options.lookup('other.example.com', {}, error => assert.ok(error));
  }
});

test('verifies every alias belongs to the original hostname and returns only its terminal address records', async () => {
  const aliases = [record(5, 'alias.example.com.'), record(5, 'cdn.example.net.', 'alias.example.com.')];
  const f = fixture(type => ({ json: answer(type, type === 1 ? [...aliases, record(1, publicA.address, 'cdn.example.net.'), record(1, publicA.address, 'cdn.example.net.')] : aliases) }));
  assert.deepEqual(await resolveReferenceHost(`${hostname.toUpperCase()}.`, isPublicReferenceAddress, f.network), [publicA]);
});

test('rejects wrong question, malformed DNS status, truncation, unrelated answers and alias loops', async () => {
  const invalid = [
    { ...answer(1), Status: 3 }, { ...answer(1), TC: true }, { ...answer(1), TC: undefined }, { ...answer(1), CD: true },
    { ...answer(1), Question: [] }, { ...answer(1), Question: [{ name: 'evil.example.com', type: 1 }] },
    { ...answer(1), Question: [{ name: hostname, type: 28 }] },
    answer(1, [record(1, publicA.address, 'unrelated.example.com')]),
    answer(1, [record(5, 'alias.example.com.'), record(5, `${hostname}.`, 'alias.example.com.')]),
    answer(1, [record(5, 'alias.example.com.'), record(5, 'other.example.com.')]),
    answer(1, [record(5, '127.0.0.1'), record(1, publicA.address)]),
    answer(1, [record(5, 'service.local'), record(1, publicA.address)]),
    answer(1, [record(28, publicAAAA.address)]),
    { ...answer(1), Answer: 'invalid' }, null,
  ];
  for (const data of invalid) {
    const f = fixture(type => ({ json: type === 1 ? data : answer(28) }));
    await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
  }
});

test('never accept mixed public/private DNS from DoH, including IPv6 and fake-IP answers', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '198.18.0.80', '192.168.1.10', '203.0.113.1']) {
    const f = fixture(type => ({ json: answer(type, type === 1 ? [record(1, publicA.address), record(1, address)] : []) }));
    await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
  }
  for (const address of ['::1', 'fc00::1', '::ffff:127.0.0.1', '2001:db8::1']) {
    const f = fixture(type => ({ json: answer(type, [record(type, type === 1 ? publicA.address : address)]) }));
    await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
  }
});

test('invalid and private hostnames cannot trigger a public DNS fallback', async () => {
  for (const name of ['localhost', 'service.local', 'a.internal', 'x.home.arpa', 'a.onion', 'a.test', '127.0.0.1',
    'https://example.com', 'user@example.com', 'a..com', '-a.example.com', 'a'.repeat(64) + '.com']) {
    const f = fixture();
    await assert.rejects(resolveReferenceHost(name, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
    assert.equal(f.requests.length, 0);
  }
});

test('DoH transport rejects redirects, HTTP failures, encodings, oversize, invalid JSON and TLS failures', async () => {
  for (const response of [{ status: 302, headers: { location: 'https://private.example.com' } }, { status: 503 },
    { headers: { 'content-type': 'text/html' } }, { headers: { 'content-encoding': 'gzip' } },
    { headers: { 'content-length': '32769' } }, { raw: 'x'.repeat(32769) }, { raw: '{invalid' },
    { error: 'CERT_HAS_EXPIRED' }, { error: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }]) {
    const f = fixture(() => ({ json: answer(1), ...response }));
    await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
    assert.equal(f.requests.length, 2, 'no redirect or resolver retry');
    assert.ok(f.requests.some(entry => entry.req.destroyed));
  }
});

test('DoH requests have a hard deadline and cannot increase the production timeout', async () => {
  const f = fixture(() => ({ silent: true })); f.network.timeoutMs = 10;
  await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
  assert.ok(f.requests.some(entry => entry.req.destroyed));
  const invalid = fixture(); invalid.network.timeoutMs = 4001;
  await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, invalid.network), /reference_public_dns_failed/);
  assert.equal(invalid.requests.length, 0);
});

test('empty successful DoH responses do not invent an address', async () => {
  const f = fixture(type => ({ json: answer(type) }));
  await assert.rejects(resolveReferenceHost(hostname, isPublicReferenceAddress, f.network), /reference_public_dns_failed/);
});

test('collector pins the recovered real public address while retaining the original HTTPS hostname', async () => {
  const f = fixture(); let requested = false;
  const download = await downloadPublicReference(`https://${hostname}/asset`, 'page', {
    resolveHost: name => resolveReferenceHost(name, isPublicReferenceAddress, f.network),
    request: (url, options, callback) => {
      requested = true; assert.equal(url.hostname, hostname); assert.equal(url.protocol, 'https:');
      options.lookup(hostname, { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [publicA]); });
      const req = new EventEmitter(); req.destroy = () => req;
      req.end = () => queueMicrotask(() => { const res = new PassThrough(); res.statusCode = 200; res.headers = { 'content-type': 'text/html' }; callback(res); res.end('<html>Actual fixture page</html>'); });
      return req;
    },
  });
  assert.equal(requested, true); assert.match(download.bytes.toString(), /Actual fixture page/);
  for (const addresses of [[fakeA, publicA], [fakeA, { address: '10.1.2.3', family: 4 }]]) {
    const invalid = fixture(undefined, addresses);
    await assert.rejects(downloadPublicReference(`https://${hostname}/asset`, 'page', {
      resolveHost: name => resolveReferenceHost(name, isPublicReferenceAddress, invalid.network),
      request: () => assert.fail('mixed DNS must never connect'),
    }), /reference_private_address/);
    assert.equal(invalid.requests.length, 0);
  }
});
