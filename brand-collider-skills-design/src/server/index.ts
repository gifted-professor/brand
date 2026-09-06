import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnvFile } from 'node:process';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadImageConfig } from '../providers/image-config.ts';
import { readCpaConnectionAsync } from '../providers/cpa-connection.ts';
import { OpenAIImageProvider } from '../providers/openai-image-provider.ts';
import { ColliderRuntime } from './runtime.ts';
import { OpenAITextProvider, RuntimeError } from './text-provider.ts';
import { CodexCliProvider } from './codex-cli-provider.ts';
import { GrokCliProvider } from './grok-cli-provider.ts';
import type { TextProvider } from './text-provider.ts';
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
  return createServer(createRequestHandler(runtime, cwd, production));
}

function createRequestHandler(runtime: ColliderRuntime, cwd: string, production = new ProductionRepository(resolve(cwd, '../outputs/manner-hok-20260905'))) {
  const dist = resolve(cwd, 'dist');
  return async (request: IncomingMessage, response: ServerResponse) => {
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
      const videoMatch = /^\/api\/sessions\/(session-[a-f0-9-]+)\/video\/assets\/(video-[a-f0-9-]+)$/.exec(path);
      if (videoMatch && (method === 'GET' || method === 'HEAD')) {
        const file = runtime.videoFile(videoMatch[1], videoMatch[2], url.searchParams.get('v'));
        const bytes = await readFile(file.path);
        if (createHash('sha256').update(bytes).digest('hex') !== file.contentHash) throw new RuntimeError('视频文件校验不一致。', 409);
        const range = request.headers.range;
        const parts = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
        const start = parts ? Number(parts[1]) : 0, end = parts?.[2] ? Math.min(Number(parts[2]), bytes.length - 1) : bytes.length - 1;
        if (range && (!parts || start > end || start >= bytes.length)) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
        response.writeHead(parts ? 206 : 200, { 'Content-Type': file.mimeType, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
          ...(parts ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}),
          ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="${videoMatch[2]}.${file.mimeType.split('/')[1]}"` } : {}) });
        response.end(method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
      }
      const mediaMatch = /^\/api\/sessions\/(session-[a-f0-9-]+)\/media\/(evidence|references|materials)(?:\/([A-Za-z0-9][A-Za-z0-9_-]{0,79}))?$/.exec(path);
      if (mediaMatch && (method === 'GET' || method === 'HEAD')) {
        const [, id, kind, itemId] = mediaMatch;
        if (kind === 'evidence' && !itemId && method === 'GET') return json(response, runtime.mediaEvidence(id, url.searchParams.get('v')));
        if ((kind === 'references' || kind === 'materials') && itemId) {
          const file = await runtime.mediaFile(id, kind, itemId, url.searchParams.get('v'));
          const bytes = await readFile(file.path);
          if (createHash('sha256').update(bytes).digest('hex') !== file.contentHash) throw new RuntimeError('素材文件已改变，不能作为原记录展示。', 409);
          response.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Length': bytes.length, 'Cache-Control': 'no-store',
            ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="${itemId}.${file.mimeType === 'image/jpeg' ? 'jpg' : file.mimeType === 'image/webp' ? 'webp' : 'png'}"` } : {}) });
          response.end(method === 'HEAD' ? undefined : bytes); return;
        }
      }
      const match = /^\/api\/sessions\/(session-[a-f0-9-]+)(?:\/(run|pause|intervene|select|image|export|video-direct|retry-media|correct-media|postprocess-media|amend-production-draft))?$/.exec(path);
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
          const body = await readJson(request, action === 'amend-production-draft' ? 256 * 1024 : 64 * 1024);
          if (action === 'run') return json(response, await runtime.run(id));
          if (action === 'amend-production-draft') return json(response, await runtime.amendProductionDraft(id, body));
          if (action === 'retry-media') return json(response, await runtime.retryMedia(id, body));
          if (action === 'video-direct') return json(response, await runtime.directVideo(id, body));
          if (action === 'correct-media') return json(response, await runtime.correctMedia(id, body));
          if (action === 'postprocess-media') return json(response, await runtime.postprocessMedia(id, body));
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
  };
}

export async function createConfiguredRuntime(cwd = process.cwd(), signal?: AbortSignal) {
  signal?.throwIfAborted();
  try { loadEnvFile(resolve(cwd, '.env.local')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new RuntimeError('无法读取服务端 .env.local。', 500); }
  let config;
  try {
    const cpa = process.env.OPENAI_PROVIDER?.trim() === 'cpa' ? await readCpaConnectionAsync(process.env, signal) : undefined;
    config = loadImageConfig(process.env, cwd, () => {
      if (!cpa) throw new Error('CPA connection unavailable.');
      return cpa;
    });
  } catch { /* Missing/invalid configuration is exposed only as configured:false. */ }
  signal?.throwIfAborted();
  const transport = process.env.COLLIDER_AGENT_TRANSPORT?.trim() || 'codex-cli';
  if (transport !== 'codex-cli' && transport !== 'grok-cli' && transport !== 'api') throw new RuntimeError('COLLIDER_AGENT_TRANSPORT 必须是 codex-cli、grok-cli 或 api。', 500);
  let provider: TextProvider | undefined;
  let executionError: string | undefined;
  const model = transport === 'grok-cli' ? process.env.GROK_CLI_MODEL?.trim() || 'grok-4.6-build'
    : transport === 'codex-cli' ? process.env.CODEX_CLI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-6-astra' : config?.textModel;
  if (transport === 'codex-cli') {
    try {
      const cli = new CodexCliProvider({ cwd, binary: process.env.CODEX_CLI_BIN?.trim(), model, timeoutMs: Number(process.env.CODEX_CLI_TIMEOUT_MS || 600000) });
      await cli.probe(); provider = cli;
    } catch (error) { executionError = error instanceof RuntimeError ? error.message : '无法初始化本地 CLI。'; }
  } else if (transport === 'grok-cli') {
    try {
      const cli = new GrokCliProvider({ cwd, binary: process.env.GROK_CLI_BIN?.trim(), model: process.env.GROK_CLI_MODEL?.trim(), timeoutMs: Number(process.env.GROK_CLI_TIMEOUT_MS || 600000) });
      await cli.probe(); provider = cli;
    } catch (error) { executionError = error instanceof RuntimeError ? error.message : '无法初始化本地 Grok CLI。'; }
  } else if (config) provider = new OpenAITextProvider(config);
  signal?.throwIfAborted();
  const runtime = new ColliderRuntime({ cwd, provider, model, transport, executionError,
    ...(config ? { imageProvider: new OpenAIImageProvider(config), imageOutputDir: config.outputDir } : {}) });
  try { await runtime.init(); }
  catch (error) { await runtime.shutdown('initialization_failed'); throw error; }
  return runtime;
}

type ServerOptions = {
  cwd?: string;
  port?: number;
  runtimeFactory?: (cwd: string, signal: AbortSignal) => Promise<ColliderRuntime>;
  registerSignals?: boolean;
  eventLogPath?: string;
};

/** Own the listening port before restoring sessions or starting provider initialization. */
export async function startConfiguredServer(options: ServerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const eventLogPath = options.eventLogPath ?? resolve(cwd, 'outputs/runtime-events.jsonl');
  let events = Promise.resolve();
  const log = (event: string, fields: { signal?: 'SIGTERM' | 'SIGINT'; code?: string } = {}) => {
    const entry = JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...fields }) + '\n';
    events = events.then(async () => {
      await mkdir(dirname(eventLogPath), { recursive: true, mode: 0o700 });
      await appendFile(eventLogPath, entry, { mode: 0o600 });
    }).catch(() => {});
    return events;
  };
  const errorCode = (error: unknown) => {
    const code = (error as NodeJS.ErrnoException)?.code;
    return ['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL'].includes(code ?? '') ? code! : 'SERVER_FAILURE';
  };
  let state: 'starting' | 'ready' | 'stopping' | 'stopped' = 'starting';
  let handler: ReturnType<typeof createRequestHandler> | undefined;
  const server = createServer((request, response) => {
    if (state === 'ready' && handler) { void handler(request, response); return; }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try { validateLocalRequest(request); }
    catch { json(response, { error: '此服务仅接受本机请求。' }, 403); return; }
    response.setHeader('Retry-After', '1');
    const starting = state === 'starting';
    json(response, { code: starting ? 'service_starting' : 'service_stopping',
      error: starting ? '本地服务正在启动，协作进度稍后恢复。' : '本地服务正在停止，已完成的协作成果会保留。' }, 503);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 4318, '127.0.0.1', () => { server.removeListener('error', reject); resolveListen(); });
    });
  } catch (error) {
    await log('bind_failed', { code: errorCode(error) });
    throw new RuntimeError('工作台服务启动失败，请检查本机端口是否已被占用。', 503);
  }
  void log('listening');
  const controller = new AbortController();
  let initialization: Promise<ColliderRuntime>;
  let runtimeShutdown: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let stopReason = 'service_stopping';
  const stopRuntime = (runtime: ColliderRuntime, reason: string) => runtimeShutdown ??= runtime.shutdown(reason);
  const onSigterm = () => { void stop('SIGTERM'); };
  const onSigint = () => { void stop('SIGINT'); };
  function stop(reason = 'service_stopping'): Promise<void> {
    if (stopping) return stopping;
    state = 'stopping';
    stopReason = reason;
    controller.abort();
    const signal = reason === 'SIGTERM' || reason === 'SIGINT' ? reason : undefined;
    stopping = (async () => {
      await log('stopping', signal ? { signal } : {});
      try {
        const runtime = await initialization.catch(() => undefined);
        if (runtime) await stopRuntime(runtime, reason);
      } catch { await log('shutdown_failed', { code: 'SHUTDOWN_FAILED' }); }
      finally {
        await new Promise<void>(resolveClose => { server.close(() => resolveClose()); server.closeAllConnections(); });
        state = 'stopped';
        process.removeListener('SIGTERM', onSigterm); process.removeListener('SIGINT', onSigint);
        await log('stopped');
      }
    })();
    return stopping;
  }
  if (options.registerSignals !== false) {
    process.once('SIGTERM', onSigterm); process.once('SIGINT', onSigint);
  }
  server.on('error', error => { void log('server_error', { code: errorCode(error) }); void stop('server_error'); });
  initialization = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return (options.runtimeFactory ?? createConfiguredRuntime)(cwd, controller.signal);
  });
  const ready = initialization.then(async runtime => {
    if (controller.signal.aborted) {
      await stopRuntime(runtime, stopReason);
      throw new RuntimeError('本地服务启动已中止。', 503);
    }
    handler = createRequestHandler(runtime, cwd);
    state = 'ready';
    await log('ready');
  }).catch(async error => {
    if (!controller.signal.aborted) await log('initialization_failed', { code: 'INITIALIZATION_FAILED' });
    await stop('initialization_failed');
    throw error instanceof RuntimeError ? error : new RuntimeError('工作台服务初始化失败，请检查本地 Skill 文件与输出目录。', 503);
  });
  void ready.catch(() => {});
  return { server, ready, stop, state: () => state };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const service = await startConfiguredServer();
    await service.ready;
    console.log('品牌联名工作台 API：http://127.0.0.1:4318');
  } catch { console.error('工作台服务启动失败，请检查本机端口、本地 Skill 文件与输出目录。'); process.exitCode = 1; }
}
