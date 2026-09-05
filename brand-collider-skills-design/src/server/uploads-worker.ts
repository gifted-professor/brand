import { parentPort, workerData } from 'node:worker_threads';

try {
  const bytes = Buffer.from(workerData.bytes);
  let text: string;
  if (workerData.extension === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else {
    const mammoth = (await import('mammoth')).default;
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
  }
  parentPort?.postMessage({ text });
} catch { parentPort?.postMessage({ error: true }); }
