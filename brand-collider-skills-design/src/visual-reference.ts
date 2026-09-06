import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { resolveReferenceHost } from './reference-dns.ts';

export const REFERENCE_SOURCE_CLASSES = ['official', 'brand_approved', 'third_party', 'reference_only', 'ai_generated', 'unknown'] as const;
export type VisualReferenceInput = {
  sourcePageUrl: string; imageUrl: string; outputDir: string;
  subject: string; version?: string; title?: string; publisher?: string;
  sourceClass?: typeof REFERENCE_SOURCE_CLASSES[number];
};
export type VisualReference = {
  schemaVersion: 1; referenceId: string;
  sourcePageUrl: string; sourcePageFinalUrl: string; sourcePageContentHash: string; pageRetrievedAt: string;
  imageUrl: string; imageFinalUrl: string; retrievedAt: string;
  title: string | null; titleSource: 'caller' | 'page_title' | 'unavailable';
  publisher: string | null; publisherSource: 'caller' | 'page_metadata' | 'unavailable';
  sourceClass: typeof REFERENCE_SOURCE_CLASSES[number]; sourceClassVerification: 'unverified';
  subject: string; version: string | null;
  contentHash: string; bytes: number; width: number; height: number; mimeType: string;
  localPath: string; metadataPath: string; sourcePagePath?: string;
  imageLinkEvidence: 'caller_supplied_observed_url'; sourceRelationship: 'unverified';
  visualInspection: 'unverified'; identityVerification: 'unverified'; usageRights: 'unverified';
};

export class VisualReferenceError extends Error {
  constructor(code: string) { super(code); this.name = 'VisualReferenceError'; }
}
type Address = { address: string; family: number };
// Dependency injection is for local fixture tests, not a CLI network override.
export type ReferenceNetwork = {
  resolveHost?: (hostname: string) => Promise<Address[]>;
  request?: (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
};
type Download = { bytes: Buffer; finalUrl: string; contentType: string; retrievedAt: string };
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 24 * 1024 * 1024;

/** Conservative global-address allowlist. Reject mapped IPv6, tunnels and special-use ranges. */
export function isPublicReferenceAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes('.') || address.includes('%')) return false;
  const [left, right = ''] = address.toLowerCase().split('::');
  const start = left ? left.split(':') : [], end = right ? right.split(':') : [];
  const words = [...start, ...Array(8 - start.length - end.length).fill('0'), ...end].map(word => parseInt(word, 16));
  return words[0] >= 0x2000 && words[0] <= 0x3fff
    && !(words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
    && words[0] !== 0x2002 && words[0] !== 0x3ffe && !(words[0] === 0x3fff && words[1] < 0x1000);
}

export function publicReferenceUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new VisualReferenceError('invalid_reference_url'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
    || value.length > 8192) throw new VisualReferenceError('invalid_reference_url');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(host) && !isPublicReferenceAddress(host)) throw new VisualReferenceError('reference_private_address');
  if (host === 'localhost' || /\.(?:localhost|local|internal|home|lan|onion)\.?$/i.test(host)
    || (!isIP(host) && !host.includes('.'))) throw new VisualReferenceError('reference_private_address');
  return url;
}

async function withinDeadline<T>(work: Promise<T>, remaining: number): Promise<T> {
  if (remaining <= 0) throw new VisualReferenceError('reference_download_timeout');
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new VisualReferenceError('reference_download_timeout')), remaining);
  })]); } finally { clearTimeout(timer!); }
}

/** No proxy, cookies, credentials or retry; every redirect is resolved and pinned to a public address. */
export async function downloadPublicReference(value: string, kind: 'page' | 'image', network: ReferenceNetwork = {}, timeoutMs = 20000): Promise<Download> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new VisualReferenceError('invalid_reference_timeout');
  const deadline = Date.now() + timeoutMs;
  const limit = kind === 'page' ? MAX_PAGE_BYTES : MAX_IMAGE_BYTES;
  let url = publicReferenceUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: Address[];
    try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
      : await withinDeadline((network.resolveHost ?? (host => resolveReferenceHost(host, isPublicReferenceAddress)))(hostname), deadline - Date.now()); }
    catch (error) { throw error instanceof VisualReferenceError ? error : new VisualReferenceError('reference_dns_failed'); }
    if (!addresses.length || addresses.some(item => !isPublicReferenceAddress(item.address)
      || item.family !== isIP(item.address))) throw new VisualReferenceError('reference_private_address');
    const selected = addresses[0];
    const result = await new Promise<Download | { redirect: string }>((accept, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const fail = (code: string) => { if (!settled) { settled = true; clearTimeout(timer); reject(new VisualReferenceError(code)); } };
      const success = (data: Download | { redirect: string }) => { if (!settled) { settled = true; clearTimeout(timer); accept(data); } };
      const remaining = deadline - Date.now();
      if (remaining <= 0) { fail('reference_download_timeout'); return; }
      const request = network.request ?? ((target, options, callback) => (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, options, callback));
      const req = request(url, {
        method: 'GET', agent: false, family: selected.family,
        headers: { Accept: kind === 'page' ? 'text/html, application/xhtml+xml' : 'image/png, image/jpeg, image/webp',
          'Accept-Encoding': 'identity', 'User-Agent': 'BrandCollider-ReferenceCollector/1.0' },
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        },
      }, response => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          success({ redirect: response.headers.location }); response.destroy(); return;
        }
        if (status !== 200) { fail(`reference_http_${status}`); response.destroy(); return; }
        const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        const allowed = kind === 'page' ? ['text/html', 'application/xhtml+xml'] : ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'];
        if (!allowed.includes(contentType)) { fail('reference_content_type_rejected'); response.destroy(); return; }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
          fail('reference_content_encoding_rejected'); response.destroy(); return;
        }
        const length = Number(response.headers['content-length']);
        if (Number.isFinite(length) && length > limit) { fail('reference_download_too_large'); response.destroy(); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) { fail('reference_download_too_large'); response.destroy(); return; }
          chunks.push(chunk);
        });
        response.on('error', () => fail('reference_connection_failed'));
        response.on('aborted', () => fail('reference_connection_failed'));
        response.on('end', () => success({ bytes: Buffer.concat(chunks), finalUrl: url.href, contentType, retrievedAt: new Date().toISOString() }));
      });
      timer = setTimeout(() => { fail('reference_download_timeout'); req.destroy(); }, remaining);
      req.on('error', () => fail('reference_connection_failed'));
      req.end();
    });
    if (!('redirect' in result)) return result;
    if (redirects === 3) throw new VisualReferenceError('reference_redirect_limit');
    let next: URL;
    try { next = publicReferenceUrl(new URL(result.redirect, url).href); }
    catch (error) { throw error instanceof VisualReferenceError ? error : new VisualReferenceError('invalid_reference_url'); }
    if (url.protocol === 'https:' && next.protocol !== 'https:') throw new VisualReferenceError('reference_https_downgrade');
    url = next;
  }
  throw new VisualReferenceError('reference_redirect_limit');
}

function cleanText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new VisualReferenceError('invalid_reference_metadata');
  return value.trim();
}
function htmlText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|apos|lt|gt);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[entity]!)
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, number: string) => { const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}
function pageMetadata(bytes: Buffer): { title?: string; publisher?: string } {
  const html = bytes.toString('utf8');
  const title = htmlText(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '').slice(0, 500);
  let publisher = '';
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), match[2] ?? match[3]]));
    if ((attributes.property ?? attributes.name)?.toLowerCase() === 'og:site_name') publisher = htmlText(attributes.content ?? '').slice(0, 300);
  }
  return { title: title || undefined, publisher: publisher || undefined };
}

/** Collect already-observed public URLs. Successful download does not verify identity or usage rights. */
export async function collectVisualReference(input: VisualReferenceInput, network: ReferenceNetwork = {}): Promise<VisualReference> {
  const sourcePageUrl = publicReferenceUrl(input.sourcePageUrl).href;
  const imageUrl = publicReferenceUrl(input.imageUrl).href;
  const subject = cleanText(input.subject, 500);
  if (!subject || !input.outputDir?.trim()) throw new VisualReferenceError('invalid_reference_metadata');
  const version = cleanText(input.version, 300), suppliedTitle = cleanText(input.title, 500), suppliedPublisher = cleanText(input.publisher, 300);
  const sourceClass = input.sourceClass ?? 'unknown';
  if (!REFERENCE_SOURCE_CLASSES.includes(sourceClass)) throw new VisualReferenceError('invalid_reference_source_class');
  // Read the source first. A blocked or invalid source does not trigger an image download.
  const page = await downloadPublicReference(sourcePageUrl, 'page', network);
  const image = await downloadPublicReference(imageUrl, 'image', network);
  let width: number, height: number, format: 'png' | 'jpeg' | 'webp';
  try {
    const decoder = sharp(image.bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).timeout({ seconds: 10 });
    const metadata = await decoder.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error('invalid raster');
    await decoder.stats(); // Force complete pixel decoding, not merely a header/magic-byte check.
    width = metadata.width; height = metadata.height; format = metadata.format as typeof format;
  } catch { throw new VisualReferenceError('reference_invalid_raster'); }
  const mimeType = `image/${format}`;
  if (image.contentType !== 'application/octet-stream' && image.contentType !== mimeType) throw new VisualReferenceError('reference_mime_mismatch');
  const observed = pageMetadata(page.bytes);
  const referenceId = `reference-${randomUUID()}`;
  const directory = join(resolve(input.outputDir), referenceId);
  const reference: VisualReference = {
    schemaVersion: 1, referenceId, sourcePageUrl, sourcePageFinalUrl: page.finalUrl,
    sourcePageContentHash: createHash('sha256').update(page.bytes).digest('hex'), pageRetrievedAt: page.retrievedAt,
    imageUrl, imageFinalUrl: image.finalUrl, retrievedAt: image.retrievedAt,
    title: suppliedTitle ?? observed.title ?? null, titleSource: suppliedTitle ? 'caller' : observed.title ? 'page_title' : 'unavailable',
    publisher: suppliedPublisher ?? observed.publisher ?? null, publisherSource: suppliedPublisher ? 'caller' : observed.publisher ? 'page_metadata' : 'unavailable',
    sourceClass, sourceClassVerification: 'unverified', subject, version: version ?? null,
    contentHash: createHash('sha256').update(image.bytes).digest('hex'), bytes: image.bytes.length, width, height, mimeType,
    localPath: join(directory, `reference.${format === 'jpeg' ? 'jpg' : format}`), metadataPath: join(directory, 'reference.json'),
    sourcePagePath: join(directory, 'source.html'),
    imageLinkEvidence: 'caller_supplied_observed_url', sourceRelationship: 'unverified',
    visualInspection: 'unverified', identityVerification: 'unverified', usageRights: 'unverified',
  };
  await mkdir(resolve(input.outputDir), { recursive: true, mode: 0o700 });
  await mkdir(directory, { mode: 0o700 });
  try {
    await writeFile(reference.localPath, image.bytes, { flag: 'wx', mode: 0o600 });
    await writeFile(reference.sourcePagePath!, page.bytes, { flag: 'wx', mode: 0o600 });
    await writeFile(reference.metadataPath, JSON.stringify(reference, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) { await rm(directory, { force: true, recursive: true }); throw error; }
  return reference;
}

export type DiscoveredReferencePage = {
  schemaVersion: 1; sourcePageUrl: string; sourcePageFinalUrl: string; sourcePageContentHash: string;
  pageRetrievedAt: string; sourcePagePath: string; metadataPath: string;
  title: string | null; publisher: string | null; excerpt: string;
  candidates: { imageUrl: string; source: 'og:image' | 'twitter:image' | 'img' | 'srcset'; label: string;
    width?: number; height?: number; observedTag: string }[];
};

/** Safely fetch an already observed source page and extract only literal image
 * addresses present in its HTML. No scripts, inferred CDN paths, page crawling
 * or browser credentials are used. These are candidates, not verified assets. */
export async function discoverVisualReferenceImages(input: { sourcePageUrl: string; outputDir: string; maxCandidates?: number },
  network: ReferenceNetwork = {}): Promise<DiscoveredReferencePage> {
  const sourcePageUrl = publicReferenceUrl(input.sourcePageUrl).href;
  const maximum = input.maxCandidates ?? 3;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3 || !input.outputDir?.trim()) throw new VisualReferenceError('invalid_reference_discovery');
  const page = await downloadPublicReference(sourcePageUrl, 'page', network);
  const html = page.bytes.toString('utf8'), metadata = pageMetadata(page.bytes);
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi, '');
  const candidates: DiscoveredReferencePage['candidates'] = [];
  const seen = new Set<string>();
  const attributes = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)]
    .map(match => [match[1].toLowerCase(), htmlText(match[2] ?? match[3] ?? match[4] ?? '')]));
  let imageBase = page.finalUrl;
  const baseTag = /<base\b[^>]*>/i.exec(markup)?.[0];
  if (baseTag && attributes(baseTag).href) {
    try { imageBase = new URL(attributes(baseTag).href, page.finalUrl).href; }
    catch { /* A malformed HTML base does not supply a usable resolution context. */ }
  }
  const add = (raw: string | undefined, source: DiscoveredReferencePage['candidates'][number]['source'], tag: string, attrs: Record<string, string>) => {
    if (!raw || candidates.length >= 64) return;
    try {
      const url = publicReferenceUrl(new URL(raw, imageBase).href);
      if (/\.(?:svg|gif|ico|avif|apng)(?:$|[?#])/i.test(url.href) || seen.has(url.href)) return;
      const width = Number(attrs.width), height = Number(attrs.height);
      if ((width > 0 && width < 16) || (height > 0 && height < 16)) return;
      seen.add(url.href);
      candidates.push({ imageUrl: url.href, source, label: (attrs.alt || attrs.title || metadata.title || '').slice(0, 500),
        ...(Number.isInteger(width) && width > 0 ? { width } : {}), ...(Number.isInteger(height) && height > 0 ? { height } : {}), observedTag: tag.slice(0, 2000) });
    } catch { /* Invalid, private or non-HTTP image candidates are discarded. */ }
  };
  // Sharing images are literal published page metadata; they are useful early
  // candidates but still need semantic/visual inspection for the requested IP.
  for (const tag of markup.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag), property = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (property === 'og:image' || property === 'og:image:url' || property === 'og:image:secure_url') add(attrs.content, 'og:image', tag, attrs);
    else if (property === 'twitter:image' || property === 'twitter:image:src') add(attrs.content, 'twitter:image', tag, attrs);
  }
  for (const tag of markup.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    if (attrs.srcset || attrs['data-srcset']) {
      const entries = (attrs.srcset || attrs['data-srcset']).split(',').map(value => {
        const [url, descriptor = ''] = value.trim().split(/\s+/); return { url, size: Number.parseFloat(descriptor) || 0 };
      }).sort((a, b) => b.size - a.size);
      if (entries[0]) add(entries[0].url, 'srcset', tag, attrs);
    }
    add(attrs['data-src'] || attrs['data-original'] || attrs.src, 'img', tag, attrs);
  }
  const directory = join(resolve(input.outputDir), `page-${randomUUID()}`);
  const result: DiscoveredReferencePage = { schemaVersion: 1, sourcePageUrl, sourcePageFinalUrl: page.finalUrl,
    sourcePageContentHash: createHash('sha256').update(page.bytes).digest('hex'), pageRetrievedAt: page.retrievedAt,
    sourcePagePath: join(directory, 'source.html'), metadataPath: join(directory, 'discovery.json'),
    title: metadata.title ?? null, publisher: metadata.publisher ?? null, excerpt: html.slice(0, 12000), candidates: candidates.slice(0, maximum) };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(result.sourcePagePath, page.bytes, { flag: 'wx', mode: 0o600 });
    await writeFile(result.metadataPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return result;
}
