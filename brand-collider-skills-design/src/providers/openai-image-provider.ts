import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponseError, parseImageResponse } from './image-response.ts';
import type { ImageConfig } from './image-config.ts';

export const RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'] as const;
export type ImageRequest = {
  prompt: string;
  negativePrompt?: string;
  ratio?: typeof RATIOS[number];
  detail?: '2K' | '4K';
  references?: string[]; // Validated data URLs, resolved by the trusted host.
};
export type ImageAsset = {
  assetId: string;
  contentHash: string;
  generationStatus: 'succeeded';
  reviewStatus: 'unverified';
  providerRequestId: string | null;
  providerResponseId: string | null;
  requestId: string;
  model: string;
  responsesModel: string;
  mimeType: string;
  path: string;
  metadataPath: string;
  createdAt: string;
};
export interface ImageProvider {
  generate(input: ImageRequest): Promise<ImageAsset>;
}
export class ImageProviderError extends Error {
  code: string;
  generationStatus: 'failed' | 'unknown';
  requestId: string | null;
  retryable = false;
  constructor(code: string, status: 'failed' | 'unknown', requestId: string | null = null) {
    super(code);
    this.name = 'ImageProviderError';
    this.code = code;
    this.generationStatus = status;
    this.requestId = requestId;
  }
}

export function imageMime(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new ImageProviderError('invalid_reference_image', 'failed');
}

export function referenceDataUrl(bytes: Buffer): string {
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw new ImageProviderError('reference_image_too_large', 'failed');
  return `data:${imageMime(bytes)};base64,${bytes.toString('base64')}`;
}

function validateReference(value: unknown): string {
  if (typeof value !== 'string' || value.length > 9 * 1024 * 1024) throw new ImageProviderError('invalid_reference_image', 'failed');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new ImageProviderError('invalid_reference_image', 'failed');
  const bytes = Buffer.from(match[2], 'base64');
  const normalized = referenceDataUrl(bytes);
  if (bytes.toString('base64') !== match[2] || imageMime(bytes) !== match[1]) throw new ImageProviderError('invalid_reference_image', 'failed');
  return normalized;
}

export function buildImagePayload(config: ImageConfig, input: ImageRequest) {
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 12000) throw new ImageProviderError('invalid_prompt', 'failed');
  if (input.negativePrompt !== undefined && (typeof input.negativePrompt !== 'string' || input.negativePrompt.length > 4000)) throw new ImageProviderError('invalid_negative_prompt', 'failed');
  const ratio = input.ratio ?? '1:1';
  const detail = input.detail ?? '2K';
  if (!RATIOS.includes(ratio)) throw new ImageProviderError('invalid_ratio', 'failed');
  if (!['2K', '4K'].includes(detail)) throw new ImageProviderError('invalid_detail', 'failed');
  if (input.references !== undefined && (!Array.isArray(input.references) || input.references.length > 4)) throw new ImageProviderError('invalid_references', 'failed');
  const references = (input.references ?? []).map(validateReference);
  const prompt = [input.prompt.trim(), `Output composition ratio: ${ratio}.`, `Requested detail tier: ${detail}.`,
    input.negativePrompt?.trim() ? `Avoid these elements: ${input.negativePrompt.trim()}` : '',
    references.length ? 'Use the supplied references to preserve the subject and product details. Do not add watermarks.' : ''].filter(Boolean).join('\n\n');
  return {
    model: config.responsesModel, stream: true, tool_choice: { type: 'image_generation' },
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, ...references.map(image_url => ({ type: 'input_image', image_url }))] }],
    tools: [{ type: 'image_generation', model: config.imageModel, action: references.length ? 'edit' : 'generate', output_format: 'png' }],
  };
}

type GatewayResponse = { status: number; contentType: string; raw: string; requestId: string | null };

// Native HTTPS preserves Host/SNI even with a per-project DNS override. Never follows redirects.
function gatewayRequest(config: ImageConfig, method: 'GET' | 'POST', endpoint: string, id: string, payload?: unknown): Promise<GatewayResponse> {
  const url = new URL(`${config.baseUrl}/${endpoint}`);
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const maxBytes = method === 'GET' ? 4 * 1024 * 1024 : 96 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let settled = false;
    let received: { status: number; contentType: string; requestId: string | null; chunks: Buffer[] } | undefined;
    const complete = (result: GatewayResponse) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const fail = (error: ImageProviderError) => {
      if (settled) return;
      // A received final image remains useful if the connection drops afterwards.
      // The parser still rejects explicit failed/incomplete events. Never salvage overflow.
      if (method === 'POST' && received?.status === 200 && error.code !== 'image_response_too_large') {
        const result = { ...received, raw: Buffer.concat(received.chunks).toString('utf8') };
        try { parseImageResponse(result.contentType, result.raw); complete(result); return; }
        catch (parseError) {
          if (parseError instanceof ImageResponseError && parseError.generationStatus === 'failed') {
            error = new ImageProviderError(parseError.code, 'failed', id);
          }
        }
      }
      settled = true;
      reject(error);
    };
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, {
      method,
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'text/event-stream, application/json',
        'X-Request-ID': id, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) },
      ...(config.connectIp ? { lookup: (_hostname, options, callback) => {
        const address = config.connectIp!;
        const family = isIP(address);
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      } } : {}),
    }, response => {
      const chunks: Buffer[] = [];
      const headerId = response.headers['x-request-id'];
      received = { status: response.statusCode ?? 502, contentType: String(response.headers['content-type'] || ''),
        requestId: typeof headerId === 'string' ? headerId : null, chunks };
      let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > maxBytes) {
          const error = new ImageProviderError('image_response_too_large', 'unknown', id);
          fail(error);
          req.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', () => fail(new ImageProviderError('image_upstream_connection_lost', 'unknown', id)));
      response.on('end', () => {
        complete({ status: received!.status, contentType: received!.contentType,
          raw: Buffer.concat(chunks).toString('utf8'), requestId: received!.requestId });
      });
    });
    const timer = setTimeout(() => req.destroy(new ImageProviderError('image_upstream_timeout', 'unknown', id)), method === 'GET' ? Math.min(20000, config.timeoutMs) : config.timeoutMs);
    req.on('error', error => fail(error instanceof ImageProviderError ? error : new ImageProviderError('image_upstream_connection_failed', 'unknown', id)));
    req.on('close', () => clearTimeout(timer));
    req.end(body);
  });
}

export class OpenAIImageProvider implements ImageProvider {
  #config: ImageConfig;
  #busy = false;
  constructor(config: ImageConfig) { this.#config = { ...config }; }

  async check() {
    const result = await gatewayRequest(this.#config, 'GET', 'models', randomUUID());
    if (result.status !== 200) throw new ImageProviderError(`image_upstream_http_${result.status}`, 'failed');
    let payload;
    try { payload = JSON.parse(result.raw); } catch { throw new ImageProviderError('image_invalid_model_catalog', 'failed'); }
    if (!Array.isArray(payload?.data)) throw new ImageProviderError('image_invalid_model_catalog', 'failed');
    const ids = payload.data.map((item: { id?: unknown }) => item?.id).filter((id: unknown): id is string => typeof id === 'string');
    return { provider: this.#config.provider ?? 'openai-compatible', baseUrl: this.#config.baseUrl, imageModel: this.#config.imageModel, responsesModel: this.#config.responsesModel,
      imageModelListed: ids.includes(this.#config.imageModel), responsesModelListed: ids.includes(this.#config.responsesModel),
      textModel: this.#config.textModel, textModelListed: ids.includes(this.#config.textModel),
      generationVerified: false, connectionOverride: Boolean(this.#config.connectIp) };
  }

  async generate(input: ImageRequest): Promise<ImageAsset> {
    const payload = buildImagePayload(this.#config, input);
    if (this.#busy) throw new ImageProviderError('image_provider_busy', 'failed');
    this.#busy = true;
    const requestId = randomUUID();
    let directory: string | undefined;
    let requestStarted = false;
    try {
      // Prove output storage is writable before sending a billable request.
      const assetId = `image-${randomUUID()}`;
      directory = join(this.#config.outputDir, assetId);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, 'request.json'), JSON.stringify({ requestId, assetId, generationStatus: 'pending', createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
      requestStarted = true;
      const result = await gatewayRequest(this.#config, 'POST', 'responses', requestId, payload);
      if (result.status !== 200) throw new ImageProviderError(`image_upstream_http_${result.status}`, result.status >= 500 || [408, 499].includes(result.status) ? 'unknown' : 'failed', requestId);
      const image = parseImageResponse(result.contentType, result.raw);
      const bytes = Buffer.from(image.base64, 'base64');
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mimeType];
      const path = join(directory, `image.${extension}`);
      const metadataPath = join(directory, 'asset.json');
      const asset: ImageAsset = { assetId, contentHash: createHash('sha256').update(bytes).digest('hex'), generationStatus: 'succeeded',
        reviewStatus: 'unverified', providerRequestId: image.providerRequestId ?? result.requestId,
        providerResponseId: image.providerResponseId, requestId, model: this.#config.imageModel, responsesModel: this.#config.responsesModel,
        mimeType: image.mimeType, path, metadataPath, createdAt: new Date().toISOString() };
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
      await writeFile(metadataPath, JSON.stringify(asset, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rm(join(directory, 'request.json'));
      return asset;
    } catch (error) {
      const failure = error instanceof ImageProviderError ? error : error instanceof ImageResponseError
        ? new ImageProviderError(error.code, error.generationStatus, requestId)
        : new ImageProviderError('image_storage_error', requestStarted ? 'unknown' : 'failed', requestId);
      if (directory) {
        try { await writeFile(join(directory, 'request.json'), JSON.stringify({ requestId, generationStatus: failure.generationStatus,
          error: failure.code, retryable: false, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 }); } catch { /* Preserve original failure. */ }
      }
      throw failure;
    } finally { this.#busy = false; }
  }
}
