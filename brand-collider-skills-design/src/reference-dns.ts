import { lookup } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';

type Address = { address: string; family: number };
type PublicAddressCheck = (address: string) => boolean;
// Test seams only. The application does not expose a resolver endpoint, proxy,
// TLS configuration, bootstrap address or private-address exception.
export type ReferenceDnsNetwork = {
  lookup?: (hostname: string) => Promise<Address[]>;
  request?: (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
  timeoutMs?: number;
};
const RESOLVER = 'https://cloudflare-dns.com/dns-query';
const BOOTSTRAP_ADDRESS = '1.1.1.1';
const RESOLVER_HOST = 'cloudflare-dns.com';
const TIMEOUT_MS = 4000;
const MAX_RESPONSE_BYTES = 32 * 1024;

function dnsError() { return new Error('reference_public_dns_failed'); }

function domain(value: unknown): string {
  if (typeof value !== 'string') throw dnsError();
  const normalized = value.toLowerCase().replace(/\.$/, '');
  if (normalized.length > 253 || !normalized.includes('.') || isIP(normalized)
    || /(?:^|\.)(?:localhost|local|internal|home|lan|onion|invalid|test|example)$/.test(normalized)
    || normalized === 'home.arpa' || normalized.endsWith('.home.arpa')
    || !normalized.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw dnsError();
  return normalized;
}

function isFakeAddress(value: Address): boolean {
  if (value.family !== 4 || isIP(value.address) !== 4) return false;
  const [first, second] = value.address.split('.').map(Number);
  return first === 198 && (second === 18 || second === 19);
}

/** Accept only this exact query's address/CNAME chain, never unrelated answers. */
function parseAnswer(value: unknown, hostname: string, type: 1 | 28, isPublic: PublicAddressCheck): Address[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw dnsError();
  const data = value as Record<string, unknown>;
  if (data.Status !== 0 || data.TC !== false || data.CD === true || !Array.isArray(data.Question) || data.Question.length !== 1) throw dnsError();
  const question = data.Question[0];
  if (!question || question.type !== type || domain(question.name) !== hostname) throw dnsError();
  if (data.Answer !== undefined && !Array.isArray(data.Answer)) throw dnsError();
  const answers = (data.Answer || []) as unknown[];
  if (answers.length > 64) throw dnsError();
  const aliases = new Map<string, string>();
  const addresses: { owner: string; address: string; family: number }[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw dnsError();
    const entry = answer as Record<string, unknown>, owner = domain(entry.name);
    if (entry.type === 5) {
      const target = domain(entry.data);
      if (aliases.has(owner)) throw dnsError();
      aliases.set(owner, target);
    } else {
      const family = type === 1 ? 4 : 6;
      if (entry.type !== type || typeof entry.data !== 'string' || isIP(entry.data) !== family || !isPublic(entry.data)) throw dnsError();
      addresses.push({ owner, address: entry.data, family });
    }
  }
  const reachable = new Set<string>([hostname]);
  let current = hostname;
  while (aliases.has(current)) {
    const target = aliases.get(current)!;
    if (reachable.has(target) || reachable.size >= 16) throw dnsError();
    reachable.add(target); current = target;
  }
  if ([...aliases.keys()].some(owner => !reachable.has(owner)) || addresses.some(address => address.owner !== current)) throw dnsError();
  return addresses.map(({ address, family }) => ({ address, family }));
}

function query(hostname: string, type: 1 | 28, isPublic: PublicAddressCheck, network: ReferenceDnsNetwork): Promise<Address[]> {
  const timeoutMs = network.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw dnsError();
  const url = new URL(RESOLVER);
  url.searchParams.set('name', hostname); url.searchParams.set('type', String(type));
  url.searchParams.set('cd', 'false'); url.searchParams.set('do', 'false');
  return new Promise((resolve, reject) => {
    let settled = false, req: ClientRequest | undefined, response: IncomingMessage | undefined;
    const finish = (error?: Error, result?: Address[]) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { response?.destroy(); req?.destroy(); reject(error); }
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(dnsError()), timeoutMs);
    const request = network.request ?? ((target, options, callback) => httpsRequest(target, options, callback));
    try {
      req = request(url, {
        method: 'GET', agent: false, family: 4, servername: RESOLVER_HOST,
        rejectUnauthorized: true, minVersion: 'TLSv1.2',
        headers: { Accept: 'application/dns-json', 'Accept-Encoding': 'identity' },
        lookup: (host, options, callback) => {
          if (host !== RESOLVER_HOST) { callback(dnsError(), '', 4); return; }
          if (options.all) callback(null, [{ address: BOOTSTRAP_ADDRESS, family: 4 }]);
          else callback(null, BOOTSTRAP_ADDRESS, 4);
        },
      }, incoming => {
        response = incoming;
        const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const sizeHeader = Number(response.headers['content-length']);
        if (response.statusCode !== 200 || !['application/dns-json', 'application/json'].includes(contentType)
          || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
          || (Number.isFinite(sizeHeader) && sizeHeader > MAX_RESPONSE_BYTES)) { finish(dnsError()); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) { finish(dnsError()); return; }
          chunks.push(chunk);
        });
        response.on('error', () => finish(dnsError()));
        response.on('aborted', () => finish(dnsError()));
        response.on('end', () => {
          if (settled) return;
          try { finish(undefined, parseAnswer(JSON.parse(Buffer.concat(chunks).toString('utf8')), hostname, type, isPublic)); }
          catch { finish(dnsError()); }
        });
      });
      req.on('error', () => finish(dnsError())); req.end();
    } catch { finish(dnsError()); }
  });
}

/** Preserve normal DNS behavior. Only an exclusively 198.18/15 fake-IP reply
 * for a public domain can use the fixed, certificate-verified DoH connection.
 * The caller validates and pins all returned public addresses before fetching. */
export async function resolveReferenceHost(hostname: string, isPublic: PublicAddressCheck, network: ReferenceDnsNetwork = {}): Promise<Address[]> {
  const original = await (network.lookup ?? (host => lookup(host, { all: true, verbatim: true })))(hostname);
  if (!original.length || !original.every(isFakeAddress)) return original;
  const name = domain(hostname);
  const results = await Promise.all([query(name, 1, isPublic, network), query(name, 28, isPublic, network)]);
  const unique = [...new Map(results.flat().map(item => [`${item.family}:${item.address}`, item])).values()];
  if (!unique.length) throw dnsError();
  return unique;
}
