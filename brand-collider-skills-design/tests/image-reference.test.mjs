import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { prepareImageReferences } from '../src/providers/image-reference.ts';

const dataUrl = (buffer, type = 'png') => `data:image/${type};base64,${buffer.toString('base64')}`;
const decode = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function pixels(width, height, channels = 3) {
  const bytes = Buffer.alloc(width * height * channels);
  for (let i = 0; i < bytes.length; i++) bytes[i] = ((i * 17) ^ (i >>> 6) ^ (i >>> 13)) & 255;
  return bytes;
}

test('opaque reference compression reduces upload bytes while preserving dimensions and ordering', async () => {
  const source = await sharp(pixels(600, 800), { raw: { width: 600, height: 800, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const tiny = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#cc4400' } }).png().toBuffer();
  const originals = [dataUrl(source), dataUrl(tiny)];
  const result = await prepareImageReferences(originals);
  const actual = await sharp(decode(result.references[0])).metadata();
  assert.equal(actual.format, 'jpeg');
  assert.deepEqual([actual.width, actual.height], [600, 800]);
  assert.ok(result.stats[0].preparedBytes < source.length / 2);
  assert.equal(result.stats[0].resized, false);
  assert.equal(result.references[1], originals[1]);
  assert.deepEqual(result.stats.map(({ index }) => index), [0, 1]);
  assert.ok(!JSON.stringify(result.stats).includes('base64'));
});

test('large ordinary reference scales proportionally with all four coloured corners retained', async () => {
  const width = 2800, height = 1400;
  const raw = pixels(width, height);
  const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
  for (let corner = 0; corner < 4; corner++) {
    const left = corner % 2 ? width - 200 : 0;
    const top = corner > 1 ? height - 200 : 0;
    for (let y = top; y < top + 200; y++) for (let x = left; x < left + 200; x++) {
      raw.set(colours[corner], (y * width + x) * 3);
    }
  }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
  const result = await prepareImageReferences([dataUrl(source, 'jpeg')]);
  const decoded = await sharp(decode(result.references[0])).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([decoded.info.width, decoded.info.height], [2048, 1024]);
  assert.equal(result.stats[0].resized, true);
  const { width: w, height: h, channels } = decoded.info;
  for (let corner = 0; corner < 4; corner++) {
    const x = corner % 2 ? w - 30 : 30;
    const y = corner > 1 ? h - 30 : 30;
    const offset = (y * w + x) * channels;
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(decoded.data[offset + channel] - colours[corner][channel]) <= 5);
    }
  }
});

test('a tall product infographic retains its original width and height', async () => {
  const source = await sharp(pixels(400, 2400), { raw: { width: 400, height: 2400, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const result = await prepareImageReferences([dataUrl(source)]);
  const metadata = await sharp(decode(result.references[0])).metadata();
  assert.deepEqual([metadata.width, metadata.height], [400, 2400]);
  assert.equal(result.stats[0].longImageProtected, true);
  assert.equal(result.stats[0].resized, false);
});

test('small transparent dark artwork uses white presentation, ignores hidden RGB, and records both hashes', async () => {
  const width = 858, height = 153, raw = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < raw.length; i += 4) raw[i + 3] = 0;
  raw.set([4, 0, 0, 255], 0);
  raw.set([0, 0, 0, 0], 4);
  raw.set([0, 0, 0, 128], 8);
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  for (const enabled of [true, false]) {
    const result = await prepareImageReferences([dataUrl(source)], { enabled });
    const output = decode(result.references[0]);
    const decoded = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([decoded.info.width, decoded.info.height, decoded.info.channels], [width, height, 3]);
    assert.deepEqual([...decoded.data.subarray(0, 6)], [4, 0, 0, 255, 255, 255]);
    assert.ok(decoded.data[6] >= 126 && decoded.data[6] <= 128, 'partial alpha is composited, not discarded');
    assert.deepEqual([...decoded.data.subarray(9, 12)], [255, 255, 255], 'hidden white RGB has no special treatment');
    assert.equal(result.stats[0].reason, 'alpha_presentation');
    assert.deepEqual(result.stats[0].presentation, { type: 'alpha-composite', background: '#ffffff' });
    assert.equal(result.stats[0].originalHash, hash(source));
    assert.equal(result.stats[0].preparedHash, hash(output));
    assert.notEqual(result.stats[0].preparedHash, result.stats[0].originalHash);
    assert.equal(result.stats[0].resized, false);
  }
});

test('transparent white artwork gets a black background and is never resized by byte optimization', async () => {
  const width = 2400, height = 1200, raw = Buffer.alloc(width * height * 4);
  raw.set([255, 255, 255, 255], 0);
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await prepareImageReferences([dataUrl(source)]);
  const output = await sharp(decode(result.references[0])).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([output.info.width, output.info.height], [width, height]);
  assert.deepEqual([...output.data.subarray(0, 6)], [255, 255, 255, 0, 0, 0]);
  assert.equal(result.stats[0].presentation.background, '#000000');
  assert.equal(result.stats[0].resized, false);
});

test('an alpha channel with no transparent pixels does not trigger presentation', async () => {
  const source = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#123456ff' } }).png().toBuffer();
  const result = await prepareImageReferences([dataUrl(source)]);
  assert.equal(result.references[0], dataUrl(source));
  assert.equal(result.stats[0].presentation, undefined);
  assert.equal(result.stats[0].originalHash, result.stats[0].preparedHash);
});

test('disabled optimization keeps an undecodable original data URL without rejecting it', async () => {
  const original = dataUrl(Buffer.from('decoder deliberately not involved'));
  const result = await prepareImageReferences([original], { enabled: false });
  assert.deepEqual(result.references, [original]);
  assert.equal(result.stats[0].reason, 'disabled');
  assert.equal(result.stats[0].preparedBytes, result.stats[0].originalBytes);
  assert.equal(result.stats[0].width, null);
});

test('native decoder failure preserves the reference without leaking diagnostics', async () => {
  const original = dataUrl(Buffer.from('private malformed reference image'));
  const result = await prepareImageReferences([original]);
  assert.equal(result.references[0], original);
  assert.equal(result.stats[0].reason, 'preprocessing_failed');
  assert.ok(!JSON.stringify(result.stats).includes('private'));
});

test('a source which is already smaller is passed through byte for byte', async () => {
  // A compact PNG of solid colour expands when expressed as a large JPEG.
  const source = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#123456' } })
    .png({ palette: true }).toBuffer();
  const original = dataUrl(source);
  const result = await prepareImageReferences([original]);
  assert.equal(result.references[0], original);
  assert.equal(result.stats[0].reason, 'not_smaller');
  assert.equal(result.stats[0].resized, false);
  assert.deepEqual([result.stats[0].width, result.stats[0].height], [3000, 1500]);
});

test('EXIF rotation is applied before metadata removal, preserving display dimensions', async () => {
  const source = await sharp(pixels(800, 400), { raw: { width: 800, height: 400, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).withMetadata({ orientation: 6 }).toBuffer();
  const result = await prepareImageReferences([dataUrl(source, 'jpeg')]);
  assert.equal(result.stats[0].optimized, true);
  const metadata = await sharp(decode(result.references[0])).metadata();
  assert.deepEqual([metadata.width, metadata.height], [400, 800]);
  assert.equal(metadata.orientation, undefined);
  assert.equal(result.stats[0].resized, false);
});
