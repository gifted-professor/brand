export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ParsedImageResponse {
  base64: string;
  mimeType: ImageMimeType;
  providerRequestId: string | null;
  providerResponseId: string | null;
}

export class ImageResponseError extends Error {
  code: string;
  generationStatus: 'failed' | 'unknown';

  constructor(code: string, generationStatus: 'failed' | 'unknown' = 'unknown') {
    super(code);
    this.name = 'ImageResponseError';
    this.code = code;
    this.generationStatus = generationStatus;
  }
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function decodeImage(value: unknown, outputFormat?: unknown): Pick<ParsedImageResponse, 'base64' | 'mimeType'> {
  if (typeof value !== 'string') throw new ImageResponseError('image_upstream_invalid_image');
  const base64 = value.replace(/[\t\n\r ]/g, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ImageResponseError('image_upstream_invalid_image');
  }
  const bytes = Buffer.from(base64, 'base64');
  // Buffer's decoder is permissive; require canonical bytes, including padding bits.
  if (bytes.toString('base64') !== base64) throw new ImageResponseError('image_upstream_invalid_image');
  let mimeType: ImageMimeType;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    mimeType = 'image/png';
  } else if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    mimeType = 'image/jpeg';
  } else if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    mimeType = 'image/webp';
  } else {
    throw new ImageResponseError('image_upstream_invalid_image');
  }
  if (outputFormat !== undefined && outputFormat !== null) {
    const declared = outputFormat === 'jpg' ? 'image/jpeg' : `image/${String(outputFormat)}`;
    if (declared !== mimeType) throw new ImageResponseError('image_upstream_invalid_image');
  }
  return { base64, mimeType };
}

function checkStatus(value: JsonObject): void {
  if (value.error != null || value.type === 'error' || value.type === 'response.failed'
    || value.status === 'failed' || value.status === 'cancelled') {
    throw new ImageResponseError('image_upstream_failed', 'failed');
  }
  if (value.type === 'response.incomplete' || (value.status != null && value.status !== 'completed')) {
    throw new ImageResponseError('image_upstream_incomplete');
  }
}

/** Parse only final image fields from Responses API envelopes (or Images JSON data).
 * A confirmed output_item.done survives a disconnected SSE tail. Failures remain
 * failures even if a prior event contained image bytes; callers must not retry an
 * unknown result automatically.
 */
export function parseImageResponse(contentType: string, raw: string): ParsedImageResponse {
  const images = new Map<string, Omit<ParsedImageResponse, 'providerResponseId'>>();
  let providerResponseId: string | null = null;
  let malformed = false;
  let invalidImage: ImageResponseError | null = null;

  function rememberResponseId(value: unknown): void {
    const id = identifier(value);
    if (id && providerResponseId && id !== providerResponseId) {
      throw new ImageResponseError('image_upstream_invalid_response');
    }
    if (id) providerResponseId = id;
  }

  function rememberImage(value: unknown, id: unknown, outputFormat?: unknown): void {
    try {
      const image = decodeImage(value, outputFormat);
      const existing = images.get(image.base64);
      images.set(image.base64, {
        ...image,
        providerRequestId: existing?.providerRequestId ?? identifier(id),
      });
    } catch (error) {
      if (!(error instanceof ImageResponseError)) throw error;
      invalidImage = error;
    }
  }

  function readImageItem(value: unknown): void {
    const item = object(value);
    if (!item || item.type !== 'image_generation_call') return;
    checkStatus(item);
    if (item.result != null) rememberImage(item.result, item.id, item.output_format);
  }

  function readResponse(value: unknown): void {
    const response = object(value);
    if (!response) {
      malformed = true;
      return;
    }
    checkStatus(response);
    rememberResponseId(response.id);
    if (response.output !== undefined && !Array.isArray(response.output)) malformed = true;
    if (Array.isArray(response.output)) response.output.forEach(readImageItem);
  }

  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch {
      throw new ImageResponseError('image_upstream_invalid_response');
    }
    const response = object(payload);
    if (!response) throw new ImageResponseError('image_upstream_invalid_response');
    readResponse(response);
    // The legacy Images API compatibility surface is deliberately top-level only.
    if (Array.isArray(response.data)) {
      for (const value of response.data) {
        const item = object(value);
        if (item?.b64_json != null) rememberImage(item.b64_json, null);
      }
    }
  } else if (mediaType === 'text/event-stream') {
    let eventName = '';
    let data: string[] = [];
    function dispatch(): void {
      const event = eventName;
      const joined = data.join('\n');
      eventName = '';
      data = [];
      if (!joined || joined.trim() === '[DONE]') return;
      let payload: JsonObject | null;
      try {
        payload = object(JSON.parse(joined));
      } catch {
        malformed = true;
        return;
      }
      if (!payload) {
        malformed = true;
        return;
      }
      const type = typeof payload.type === 'string' ? payload.type : event;
      if (event && event !== 'message' && typeof payload.type === 'string' && event !== payload.type) {
        malformed = true;
        return;
      }
      if (type === 'error' || type === 'response.failed') {
        throw new ImageResponseError('image_upstream_failed', 'failed');
      }
      if (type === 'response.incomplete') throw new ImageResponseError('image_upstream_incomplete');
      if (type === 'response.output_item.done') readImageItem(payload.item);
      if (type === 'response.completed') readResponse(payload.response);
      if (type === 'response.created' || type === 'response.in_progress') {
        const response = object(payload.response);
        if (response) rememberResponseId(response.id);
      }
    }
    for (const line of raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
      if (!line) {
        dispatch();
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') eventName = value;
      if (field === 'data') data.push(value);
    }
    // A full final event may arrive without the last blank-line delimiter.
    dispatch();
  } else {
    throw new ImageResponseError('image_upstream_invalid_response');
  }

  if (images.size > 1) throw new ImageResponseError('image_multiple_results');
  const image = images.values().next().value;
  if (image) return { ...image, providerResponseId };
  if (invalidImage) throw invalidImage;
  throw new ImageResponseError(malformed ? 'image_upstream_invalid_response' : 'image_no_result');
}
