import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { readCpaConnection } from './cpa-connection.ts';
import type { CpaConnection } from './cpa-connection.ts';

export type ImageConfig = {
  provider?: 'openai-compatible' | 'cpa';
  baseUrl: string;
  apiKey: string;
  textModel: string;
  responsesModel: string;
  imageModel: string;
  timeoutMs: number;
  outputDir: string;
  connectIp?: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  optimizeReferences?: boolean;
  finalImageGraceMs?: number;
};

export function loadImageConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), cpaResolver: (env: NodeJS.ProcessEnv) => CpaConnection = readCpaConnection): ImageConfig {
  const provider = env.OPENAI_PROVIDER?.trim() || 'openai-compatible';
  if (!['openai-compatible', 'cpa'].includes(provider)) throw new Error('OPENAI_PROVIDER must be openai-compatible or cpa.');
  const cpa = provider === 'cpa' ? cpaResolver(env) : undefined;
  const rawUrl = cpa ? cpa.baseUrl : env.OPENAI_BASE_URL?.trim() || 'https://hncloud-newapi.tail400674.ts.net/v1';
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error('OPENAI_BASE_URL must be a plain HTTPS URL (without Markdown).'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const octets = url.hostname.split('.').map(Number);
  const tailscale = Boolean(cpa) && isIP(url.hostname) === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || tailscale))) || url.username || url.password || url.search || url.hash) {
    throw new Error('API URL requires HTTPS and no credentials/query/fragment; HTTP is allowed only on loopback or a configured CPA Tailscale IPv4 endpoint.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path && path !== '/v1') throw new Error('OPENAI_BASE_URL must end at the gateway origin or /v1.');
  url.pathname = '/v1';
  const apiKey = (cpa ? cpa.apiKey : env.OPENAI_API_KEY)?.trim();
  if (!apiKey || apiKey === 'replace-with-your-key' || /\s/.test(apiKey)) throw new Error(cpa ? 'CPA credential lookup returned an invalid key; no gateway fallback was attempted.' : 'Set a valid OPENAI_API_KEY in server-side .env.local.');
  const imageModel = env.IMAGE_MODEL?.trim() || 'gpt-image-2';
  if (imageModel !== 'gpt-image-2') throw new Error('This adapter supports IMAGE_MODEL=gpt-image-2 only.');
  const responsesModel = env.IMAGE_RESPONSES_MODEL?.trim() || 'gpt-5.5';
  if (!/^[a-zA-Z0-9._:/-]{1,128}$/.test(responsesModel)) throw new Error('Invalid IMAGE_RESPONSES_MODEL.');
  const effort = env.IMAGE_REASONING_EFFORT?.trim() || (responsesModel === 'gpt-5.5' ? 'low' : 'auto');
  if (!['auto', 'none', 'low', 'medium', 'high', 'xhigh'].includes(effort)) throw new Error('Invalid IMAGE_REASONING_EFFORT.');
  const optimize = env.IMAGE_OPTIMIZE_REFERENCES?.trim() || 'true';
  if (!['true', 'false'].includes(optimize)) throw new Error('IMAGE_OPTIMIZE_REFERENCES must be true or false.');
  const finalImageGraceMs = Number(env.IMAGE_FINAL_IMAGE_GRACE_MS || 1000);
  if (!Number.isInteger(finalImageGraceMs) || finalImageGraceMs < 0 || finalImageGraceMs > 10000) throw new Error('IMAGE_FINAL_IMAGE_GRACE_MS must be an integer from 0 to 10000; 0 waits for the response end.');
  const timeoutMs = Number(env.IMAGE_TIMEOUT_MS || 780000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) throw new Error('IMAGE_TIMEOUT_MS must be an integer from 1000 to 1800000.');
  // A saved HNCloud DNS override must never redirect a CPA credential to HNCloud.
  const connectIp = cpa ? undefined : env.IMAGE_CONNECT_IP?.trim() || undefined;
  if (connectIp && !isIP(connectIp)) throw new Error('IMAGE_CONNECT_IP must be a verified IPv4 or IPv6 address.');
  return { provider: provider as ImageConfig['provider'], baseUrl: url.href.replace(/\/$/, ''), apiKey, imageModel, responsesModel, timeoutMs,
    textModel: env.OPENAI_MODEL?.trim() || (cpa ? 'gpt-6-astra' : 'gpt-5.6-sol'),
    outputDir: resolve(cwd, env.IMAGE_OUTPUT_DIR || 'outputs/images'), connectIp,
    reasoningEffort: effort === 'auto' ? undefined : effort as ImageConfig['reasoningEffort'],
    optimizeReferences: optimize === 'true', finalImageGraceMs };
}
