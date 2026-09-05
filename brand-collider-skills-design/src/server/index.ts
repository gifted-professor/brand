import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnvFile } from 'node:process';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadImageConfig } from '../providers/image-config.ts';
import { OpenAIImageProvider } from '../providers/openai-image-provider.ts';
import { ColliderRuntime } from './runtime.ts';
import { OpenAITextProvider, RuntimeError } from './text-provider.ts';
import { parseUpload } from './uploads.ts';
import { ProductionRepository } from './production.ts';

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new RuntimeError('此接口需要 application/json 请求。', 415);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        rejected = true; chunks.length = 0;
        reject(new RuntimeError('请求内容过大。单个上传文件上限为 8 MB。', 413));
      } else if (!rejected) chunks.push(chunk);
    });
    request.on('error', () => reject(new RuntimeError('请求连接中断。')));
    request.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new RuntimeError('JSON 请求语法无效。')); }
    });
  });
}
function validateLocalRequest(request: IncomingMessage) {
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) throw new RuntimeError('此服务仅接受本机请求。', 403);
  if (request.headers.origin) {
    try {
      const origin = new URL(request.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('non-local');
    } catch { throw new RuntimeError('不允许跨站请求本机服务。', 403); }
  }
}
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };

export function createHttpServer(runtime: ColliderRuntime, cwd: string, production = new ProductionRepository(resolve(cwd, '../outputs/manner-hok-20260905'))) {
  const dist = resolve(cwd, 'dist');
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      validateLocalRequest(request);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;
      const method = request.method ?? 'GET';
      if (path === '/api/production/projects' && method === 'GET') return json(response, await production.list());
      const productionMatch = /^\/api\/production\/projects\/([a-zA-Z0-9-]+)(?:\/(discuss)|\/assets\/(asset-[a-f0-9]{24}))?$/.exec(path);
      if (productionMatch) {
        const [, projectId, action, assetId] = productionMatch;
        if (!action && !assetId && method === 'GET') return json(response, await production.get(projectId));
        if (action === 'discuss' && method === 'POST') return json(response, await production.discuss(projectId, await readJson(request, 16 * 1024), runtime), 201);
        if (assetId && (method === 'GET' || method === 'HEAD')) return await production.serveAsset(projectId, assetId, request, response, url.searchParams.get('download') === '1');
      }
      if (path === '/api/runtime' && method === 'GET') return json(response, runtime.info());
      if (path === '/api/uploads' && method === 'POST') return json(response, await parseUpload(await readJson(request, 12 * 1024 * 1024)));
      if (path === '/api/sessions' && method === 'GET') return json(response, runtime.list());
      if (path === '/api/sessions' && method === 'POST') return json(response, await runtime.create(await readJson(request, 2 * 1024 * 1024)), 201);
      const match = /^\/api\/sessions\/(session-[a-f0-9-]+)(?:\/(run|pause|intervene|select|image|export))?$/.exec(path);
      if (match) {
        const [, id, action] = match;
        if (!action && method === 'GET') return json(response, runtime.get(id));
        if (action === 'export' && method === 'GET') {
          const text = runtime.export(id);
          response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${id}.md"`, 'Cache-Control': 'no-store' });
          response.end(text); return;
        }
        if (action === 'image' && method === 'GET') {
          const image = runtime.image(id);
          const bytes = await readFile(image.path);
          response.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
          response.end(bytes); return;
        }
        if (method === 'POST') {
          const body = await readJson(request, 64 * 1024);
          if (action === 'run') return json(response, await runtime.run(id));
          if (action === 'pause') return json(response, await runtime.pause(id));
          if (action === 'intervene') return json(response, await runtime.intervene(id, body));
          if (action === 'select') return json(response, await runtime.select(id, body));
          if (action === 'image') return json(response, await runtime.generateImage(id));
        }
      }
      if (path.startsWith('/api/')) throw new RuntimeError('接口不存在或请求方法不支持。', 404);
      if (method !== 'GET' && method !== 'HEAD') throw new RuntimeError('请求方法不支持。', 405);
      let decoded: string;
      try { decoded = decodeURIComponent(path); } catch { throw new RuntimeError('路径编码无效。'); }
      let file = resolve(dist, `.${decoded}`);
      if (file !== dist && !file.startsWith(dist + sep)) throw new RuntimeError('路径无效。', 403);
      try { if (!(await stat(file)).isFile()) file = resolve(dist, 'index.html'); }
      catch { if (extname(file)) throw new RuntimeError('文件不存在。', 404); file = resolve(dist, 'index.html'); }
      let bytes: Buffer;
      try { bytes = await readFile(file); }
      catch { throw new RuntimeError('页面尚未构建。开发请运行 npm run dev，生产请先运行 npm run build。', 404); }
      response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      response.end(method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!response.headersSent) json(response, { error: error instanceof RuntimeError ? error.message : '服务暂时无法完成请求。已保存的会话仍被保留。' }, error instanceof RuntimeError ? error.status : 500);
      else response.end();
    }
  });
}

export async function createConfiguredRuntime(cwd = process.cwd()) {
  try { loadEnvFile(resolve(cwd, '.env.local')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new RuntimeError('无法读取服务端 .env.local。', 500); }
  let config;
  try { config = loadImageConfig(process.env, cwd); } catch { /* Missing/invalid configuration is exposed only as configured:false. */ }
  const runtime = new ColliderRuntime({ cwd, ...(config ? { provider: new OpenAITextProvider(config), imageProvider: new OpenAIImageProvider(config), model: config.textModel } : {}) });
  await runtime.init();
  return runtime;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const cwd = process.cwd();
  try {
    const runtime = await createConfiguredRuntime(cwd);
    const server = createHttpServer(runtime, cwd);
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    server.on('error', () => { console.error('工作台服务启动失败，请检查本机 4318 端口是否已被占用。'); process.exitCode = 1; });
    server.listen(4318, '127.0.0.1', () => console.log('品牌联名工作台 API：http://127.0.0.1:4318'));
    let stopping = false;
    const stop = async () => {
      if (stopping) return; stopping = true;
      await runtime.shutdown();
      server.close(); server.closeAllConnections();
      process.exit(0);
    };
    process.once('SIGTERM', () => { void stop(); });
    process.once('SIGINT', () => { void stop(); });
  } catch { console.error('工作台服务初始化失败，请检查本地 Skill 文件与输出目录。'); process.exitCode = 1; }
}
