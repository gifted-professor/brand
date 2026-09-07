import sharp from 'sharp';
import { createHash } from 'node:crypto';

export type AlphaPresentation = { type: 'alpha-composite'; background: '#ffffff' | '#000000' };

export type ImageReferenceOptions = {
  enabled?: boolean;
};

export type ImageReferenceStats = {
  index: number;
  originalBytes: number;
  preparedBytes: number;
  originalWidth: number | null;
  originalHeight: number | null;
  width: number | null;
  height: number | null;
  originalMimeType: string;
  mimeType: string;
  originalHash: string;
  preparedHash: string;
  presentation?: AlphaPresentation;
  optimized: boolean;
  resized: boolean;
  longImageProtected: boolean;
  reason: 'alpha_presentation' | 'optimized' | 'disabled' | 'small_image' | 'not_smaller' | 'animated_image' | 'preprocessing_failed';
};

const MAX_DIMENSION = 2048;
const LONG_IMAGE_RATIO = 3;
const MIN_BYTES = 128 * 1024;
const MAX_INPUT_PIXELS = 64 * 1024 * 1024;
const LINEAR_SRGB = Array.from({ length: 256 }, (_, byte) => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});

/** Faithful alpha compositing only: no resizing, recolouring, drawing, or source-file writes. */
export async function presentTransparentImage(
  bytes: Buffer, limitInputPixels = MAX_INPUT_PIXELS,
): Promise<{ data: Buffer; width: number; height: number; presentation: AlphaPresentation } | null> {
  const input = sharp(bytes, { limitInputPixels, failOn: 'warning' });
  const metadata = await input.metadata();
  if (!metadata.hasAlpha || (metadata.pages ?? 1) !== 1) return null;
  const { data, info } = await input.clone().toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  let transparent = false, weight = 0, luminance = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + info.channels - 1] / 255;
    if (alpha < 1) transparent = true;
    if (!alpha) continue; // Hidden RGB values must not determine the displayed background.
    weight += alpha;
    luminance += alpha * (0.2126 * LINEAR_SRGB[data[i]] + 0.7152 * LINEAR_SRGB[data[i + 1]] + 0.0722 * LINEAR_SRGB[data[i + 2]]);
  }
  if (!transparent) return null;
  const average = weight ? luminance / weight : 0;
  const background = 1.05 / (average + 0.05) >= (average + 0.05) / 0.05 ? '#ffffff' : '#000000';
  const presentation: AlphaPresentation = { type: 'alpha-composite', background };
  // Keep orientation/profile metadata as well as encoded dimensions. Only the
  // transparent pixels are composited; fully opaque glyph pixels remain intact.
  const rendered = await input.clone().flatten({ background }).keepMetadata().png({ compressionLevel: 6, palette: false }).toBuffer();
  return { data: rendered, width: metadata.width!, height: metadata.height!, presentation };
}

/**
 * Local alpha presentation and optional upload optimization, not input validation. The provider must
 * validate data URLs and its byte/count limits before calling this function.
 * Never fetches URLs or changes files. An unsuccessful optimization keeps the
 * exact source bytes, so it cannot prevent an otherwise valid generation. Alpha
 * presentation remains enabled when byte optimization is disabled; its source
 * and submitted hashes are recorded separately and its dimensions never change.
 */
export async function prepareImageReferences(
  references: readonly string[], options: ImageReferenceOptions = {},
): Promise<{ references: string[]; stats: ImageReferenceStats[] }> {
  const prepared: string[] = [];
  const stats: ImageReferenceStats[] = [];
  // Keep peak decoded pixel memory bounded rather than decoding four large
  // product infographics concurrently. Network generation remains independent.
  for (const [index, reference] of references.entries()) {
    const comma = reference.indexOf(',');
    const mimeType = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(reference)?.[1] ?? '';
    const bytes = Buffer.from(reference.slice(comma + 1), 'base64');
    const originalHash = createHash('sha256').update(bytes).digest('hex');
    const record: ImageReferenceStats = {
      index, originalBytes: bytes.length, preparedBytes: bytes.length,
      originalWidth: null, originalHeight: null, width: null, height: null,
      originalMimeType: mimeType, mimeType, optimized: false, resized: false,
      originalHash, preparedHash: originalHash,
      longImageProtected: false, reason: options.enabled === false ? 'disabled' : 'preprocessing_failed',
    };
    let output = reference;
    if (mimeType) {
      try {
        const input = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
        const metadata = await input.metadata();
        const width = metadata.autoOrient.width;
        const height = metadata.autoOrient.height;
        record.originalWidth = record.width = width;
        record.originalHeight = record.height = height;
        record.longImageProtected = Math.max(width, height) / Math.min(width, height) > LONG_IMAGE_RATIO;
        const shouldResize = !record.longImageProtected && Math.max(width, height) > MAX_DIMENSION;
        const presentation = await presentTransparentImage(bytes);
        if (presentation && presentation.data.length > 6 * 1024 * 1024) {
          // Presentation must not invalidate an already accepted original.
          record.reason = 'not_smaller';
        } else if (presentation) {
          record.originalWidth = record.width = presentation.width;
          record.originalHeight = record.height = presentation.height;
          record.preparedBytes = presentation.data.length;
          record.mimeType = 'image/png';
          record.presentation = presentation.presentation;
          record.reason = 'alpha_presentation';
          output = `data:image/png;base64,${presentation.data.toString('base64')}`;
        } else if (options.enabled === false) {
          record.reason = 'disabled';
        } else if ((metadata.pages ?? 1) > 1) {
          record.reason = 'animated_image';
        } else if (bytes.length < MIN_BYTES && !shouldResize) {
          record.reason = 'small_image';
        } else {
          // Orientation is applied before stripping metadata. No crop or padding:
          // both image edges and aspect ratio survive. Long infographics retain
          // full dimensions so brand lettering is not reduced to a few pixels.
          let pipeline = input.autoOrient();
          if (shouldResize) pipeline = pipeline.resize({
            width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true,
          });
          // For opaque art, 4:4:4 avoids subsampling small
          // coloured brand marks; quality 90 is deliberately conservative.
          pipeline = metadata.hasAlpha
            ? pipeline.png({ compressionLevel: 6, palette: false })
            : pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4' });
          const candidate = await pipeline.toBuffer({ resolveWithObject: true });
          if (candidate.data.length < bytes.length) {
            record.preparedBytes = candidate.data.length;
            record.width = candidate.info.width;
            record.height = candidate.info.height;
            record.mimeType = metadata.hasAlpha ? 'image/png' : 'image/jpeg';
            record.optimized = true;
            record.resized = width !== record.width || height !== record.height;
            record.reason = 'optimized';
            output = `data:${record.mimeType};base64,${candidate.data.toString('base64')}`;
          } else {
            record.reason = 'not_smaller';
          }
        }
      } catch {
        // Do not expose native decoder diagnostics or the supplied image data.
        if (options.enabled !== false) record.reason = 'preprocessing_failed';
      }
    }
    if (output !== reference) record.preparedHash = createHash('sha256').update(Buffer.from(output.slice(output.indexOf(',') + 1), 'base64')).digest('hex');
    prepared.push(output);
    stats.push(record);
  }
  return { references: prepared, stats };
}
