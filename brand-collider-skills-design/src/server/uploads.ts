import { extname, basename } from 'node:path';
import { Worker } from 'node:worker_threads';
import { RuntimeError } from './text-provider.ts';

export const UPLOAD_LIMIT = 8 * 1024 * 1024;
export const TEXT_LIMIT = 120000;
export const UPLOAD_FORMATS = ['.txt', '.md', '.json', '.pdf', '.docx'];

// Bound expansion before handing an untrusted ZIP to the document parser.
function validateDocxArchive(bytes: Buffer) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new RuntimeError('DOCX 文件格式无效。');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (count > 1000 || count === 0 || offset >= end) throw new RuntimeError('DOCX 文件结构过大或无效。');
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new RuntimeError('DOCX 文件结构无效。');
    const size = bytes.readUInt32LE(offset + 24);
    expanded += size;
    if (size > 8 * 1024 * 1024 || expanded > 32 * 1024 * 1024) throw new RuntimeError('DOCX 解压内容过大。', 413);
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
}

export async function parseUpload(input: unknown): Promise<{ name: string; text: string }> {
  if (!input || typeof input !== 'object') throw new RuntimeError('上传数据无效。');
  const { name, data } = input as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 220 || name.includes('\0')) throw new RuntimeError('文件名称无效。');
  const extension = extname(name).toLowerCase();
  if (!UPLOAD_FORMATS.includes(extension)) throw new RuntimeError('支持 TXT、Markdown、JSON、PDF 和 DOCX 文件。');
  if (typeof data !== 'string' || data.length > Math.ceil(UPLOAD_LIMIT / 3) * 4) throw new RuntimeError('单个文件不能超过 8 MB。', 413);
  if (!data.length || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new RuntimeError('文件编码无效。');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > UPLOAD_LIMIT) throw new RuntimeError('单个文件不能超过 8 MB。', 413);
  if (bytes.toString('base64') !== data) throw new RuntimeError('文件编码无效。');
  let text: string;
  if (['.txt', '.md', '.json'].includes(extension)) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new RuntimeError('请将文本文件保存为 UTF-8 编码。'); }
    if (extension === '.json') { try { JSON.parse(text); } catch { throw new RuntimeError('JSON 文件语法无效。'); } }
  } else {
    if (extension === '.pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new RuntimeError('PDF 文件格式无效。');
    if (extension === '.docx') validateDocxArchive(bytes);
    text = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(new URL('./uploads-worker.ts', import.meta.url), {
        workerData: { bytes, extension }, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
      });
      const timer = setTimeout(() => { void worker.terminate(); reject(new RuntimeError('文件解析超时，请改为较小的文件或粘贴文字。', 408)); }, 20000);
      worker.once('message', result => {
        clearTimeout(timer); void worker.terminate();
        if (typeof result?.text === 'string') resolve(result.text);
        else reject(new RuntimeError('无法读取该文件，请检查是否损坏、加密，或改为粘贴文字。'));
      });
      worker.once('error', () => { clearTimeout(timer); reject(new RuntimeError('文件解析失败，请改为较小文件或粘贴文字。')); });
      worker.once('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new RuntimeError('文件解析停止，请改为较小文件或粘贴文字。')); } });
    });
  }
  text = text.replace(/\u0000/g, '').trim();
  if (!text) throw new RuntimeError('文件没有可读取的文字；扫描 PDF 请先进行 OCR 或直接粘贴文字。');
  if (text.length > TEXT_LIMIT) throw new RuntimeError('文件文字超过 12 万字符，请精简后上传。', 413);
  return { name: basename(name.replace(/\\/g, '/')), text };
}
