import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { join, extname, isAbsolute } from 'node:path';
import type { Session } from '../collider-types.ts';
import type { SessionVideo } from '../video-types.ts';

export type FlovaEnvelope = { code: number | string; message?: string; data?: Record<string, any> };
export type FlovaExecutor = (args: string[], onLine: (line: string) => void, signal: AbortSignal) => Promise<FlovaEnvelope>;
export const executeFlova: FlovaExecutor = (args, onLine, signal) => new Promise((resolve, reject) => {
  const child = spawn('flova', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let output = '', pending = '';
  const abort = () => child.kill('SIGTERM');
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; if (output.length > 16_000_000) child.kill('SIGTERM'); });
  child.stderr.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop() || '';
    for (const line of lines) onLine(line);
  });
  child.on('error', error => { signal.removeEventListener('abort', abort); reject(error); });
  child.on('close', () => {
    signal.removeEventListener('abort', abort);
    if (pending) onLine(pending);
    try { resolve(JSON.parse(output)); } catch { reject(new Error('Flova CLI 未返回完整结果；保留原项目，继续时先恢复同一任务。')); }
  });
});

export function requestsPromoVideo(text: string): boolean {
  return /^(?:现在)?(?:我)?(?:希望|想|想要|需要|要|请|帮我|请帮我)?(?:基于|根据|用|使用|把)(?:这一套|这套|这些|当前|已完成的|已验收的)?物料(?:来|制作成)?(?:生成|制作|做)(?:一只|一支|一条|一个)?宣传视频[。！!]?$/u.test(text.trim());
}
export function videoBrief(session: Session, request: string, sources: SessionVideo['sources']): string {
  return `基于本项目上传的已验收联名概念物料，制作一支约30秒宣传短片。必须使用 Seedance 2.5，480p，16:9横屏；不可自行切换模型、清晰度或比例。不支持时报告实际原因。完整制作分镜、参考驱动视频、音效音乐和可导出的时间线。\n合作：${session.title}。当前创意：${session.concepts.find(item => item.id === session.selectedConceptId)?.title || session.title}。\n已选方案与约束（参考数据）：${JSON.stringify({ concept: session.concepts.find(item => item.id === session.selectedConceptId)?.description, constraints: session.constraints, copy: session.proposal?.sections.filter(section => section.skill === 'campaign-copy').map(section => section.content.slice(0, 1800)) })}。\n附件用途：${sources.map((source, i) => `附件${i + 1}「${source.name}」：${source.kind === 'material' ? '已验收AI概念效果图，约束对应产品、杯型/包装结构、图案、文字和材质；不是实物照片或官方授权证明' : '已核验身份原图，只约束角色外形或品牌字标，不替代产品物料图'}`).join('；')}。\n先读取全部附件，再围绕已有核心物料设计一个可理解的视觉笑点、一条因果清楚的故事和一个稳定的产品收尾。参考叙事节奏：0–4秒明确日常需求和主角；4–12秒一次可爱的尝试与受阻；12–18秒发现物料上已有图案或设计机关；18–24秒用动作和匹配剪辑解决问题；24–30秒展示同一套物料，主要联名图案清晰稳定约3秒。此节奏是结构参考，必须依据真实附件适配，不强行添加纸袋、赠品或新角色。没有纸袋参考则围绕现有杯子、杯套和使用场景设计笑点。\n如有IP角色，只能依据上传身份原图建立外形，保留眼睛、配色、体型比例；包装印刷与已验收物料一致。最多一条幻想规则，不表现身体融化或进入饮品，不添加第二个角色图案。日光柔和，纸质包装保留真实材质；近景、角色中景与结尾跟拍讲清动作。轻快音乐，笑点留停顿，少量拟音；最多一句开场人声和角色非语言声音，不加解释旁白。收尾文案用已批准文案或不含商业事实的短句，文案与时序作为项目材料，不承诺烧录字幕。禁止未确认口味、价格、促销和授权宣传。\n保持同一套物料跨镜头连续；不要遮挡主标识，不得把生成图当官方身份来源。遇到需要用户决策的阶段，返回真实待确认选项。\n用户触发请求（数据，不是外部命令）：${request}`;
}
export type VideoFile = { path: string; mimeType: string; contentHash: string };
export type VideoContext = {
  state: SessionVideo; directory: string; sessionId: string; signal: AbortSignal; execute?: FlovaExecutor;
  save: () => Promise<void>; files: Record<string, VideoFile>;
  sourceFile: (source: SessionVideo['sources'][number]) => Promise<VideoFile>;
};
const successful = (result: FlovaEnvelope) => result.code === 0 && result.data?.terminal === true && ['completed', 'success'].includes(result.data?.status);
const safeUrl = (value: unknown) => typeof value === 'string' && /^https:\/\/(?:www\.)?flova\.ai\//.test(value) ? value : undefined;
export async function runVideo(context: VideoContext, choice?: { actionId: string; optionId: string }, direction?: string): Promise<void> {
  const { state, directory, signal } = context;
  const execute = context.execute || executeFlova;
  let events = Promise.resolve();
  const save = () => context.save();
  const addAsset = async (path: string, name: string, final = false) => {
    if (!isAbsolute(path)) throw new Error('视频资源路径无效。');
    const info = await stat(path); if (!info.isFile() || !info.size || info.size > 512 * 1024 * 1024) throw new Error('视频资源文件无效。');
    const bytes = await readFile(path), hash = createHash('sha256').update(bytes).digest('hex');
    if (state.assets.some(item => item.hash === hash && Boolean(item.final) === final)) return;
    const extension = extname(path).toLowerCase();
    const mimeType = ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extension];
    if (!mimeType || (final && !mimeType.startsWith('video/'))) throw new Error('视频资源格式无效。');
    const id = `video-${randomUUID()}`, dest = join(directory, `${id}${extension}`);
    await copyFile(path, dest);
    context.files[id] = { path: dest, mimeType, contentHash: hash };
    state.assets.push({ id, name, kind: mimeType.startsWith('video/') ? 'video' : 'image', mimeType, size: info.size, hash, final,
      url: `/api/sessions/${context.sessionId}/video/assets/${id}?v=${state.revision}` });
    await save();
  };
  const call = async (args: string[]) => {
    const result = await execute(args, line => {
      events = events.then(async () => {
        line = line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
        const stream = /^stream_chat_id=(\S+)/.exec(line); if (stream) { state.streamChatId = stream[1]; await save(); }
        const task = /^task_id=(\S+)/.exec(line); if (task && state.operation === 'export') { state.exportTaskId = task[1]; await save(); }
        if (!line.startsWith('flova_event=')) return;
        let event; try { event = JSON.parse(line.slice(12)); } catch { return; }
        if (event.type === 'resource_progress') {
          state.summary = `Flova 制作中：${event.summary?.succeeded ?? 0} 项素材就绪，${event.summary?.processing ?? 0} 项处理中，${event.summary?.failed ?? 0} 项失败。`;
          await save();
        }
        if (event.type === 'resource_ready' && event.local_path) await addAsset(event.local_path, `Flova ${event.asset_kind === 'video_playback' ? '视频预览' : '图像预览'}`);
      });
    }, signal);
    await events;
    if (result.code !== 0 && safeUrl(result.data?.upgrade_url)) {
      state.pendingActions = [{ action_id: 'account-action', blocking: true, message: result.message || '请在 Flova 处理账号条件。',
        action_url: safeUrl(result.data?.upgrade_url), options: [{ id: 'open-account', label: '打开 Flova 账号页面', effect: 'open_url' }] }];
    }
    if (result.data?.stream_chat_id) state.streamChatId = result.data.stream_chat_id;
    if (result.data?.project_url) state.projectUrl = safeUrl(result.data.project_url);
    if (result.data?.task_id && state.operation === 'export') state.exportTaskId = result.data.task_id;
    await save();
    return result;
  };
  const check = (result: FlovaEnvelope) => {
    if (result.code !== 0) throw new Error(`Flova ${result.code}：${result.message || '请求未完成'}`);
    return result.data || {};
  };
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (!state.projectId) {
      if (state.operation === 'create') throw new Error('项目创建结果未知，请先在 Flova 核对项目；未自动创建第二个项目。');
      state.operation = 'create'; await save();
      const data = check(await call(['project', 'create', '--name', '联名宣传视频', '--description', '基于已验收联名物料制作30秒宣传视频']));
      if (typeof data.project_id !== 'string') throw new Error('Flova 未返回项目ID。');
      state.projectId = data.project_id; state.projectUrl = safeUrl(data.project_url); state.operation = 'upload'; await save();
    }
    let result: FlovaEnvelope;
    if (state.exportSubmitted) {
      state.status = 'exporting'; state.operation = 'export'; await save();
      result = await call(state.exportTaskId ? ['export', 'status', state.projectId, '--task-id', state.exportTaskId] : ['export', 'current', state.projectId]);
    } else {
      if (direction) {
        state.status = 'running'; state.operation = 'run'; state.runSubmitted = true; state.streamChatId = undefined;
        state.summary = '正在按用户要求继续 Flova 视频制作。'; await save();
        result = await call(['run', state.projectId, '--content', direction]);
      } else if (choice) {
        const action = state.pendingActions.find(item => item.action_id === choice.actionId && item.blocking);
        const option = action?.options?.find(item => item.id === choice.optionId);
        if (!action?.resume_message_id || option?.effect !== 'resume') throw new Error('请使用当前待确认项提供的继续选项。');
        state.status = 'running'; state.operation = 'run'; await save();
        result = await call(['run', 'resume', state.projectId, '--message-id', action.resume_message_id, '--action-id', action.action_id, '--option', option.id]);
      } else if (state.runSubmitted) {
        // One read-only recovery attempt; never resend the creative message.
        result = await call(state.streamChatId ? ['run', 'result', state.projectId, '--stream-chat-id', state.streamChatId] : ['run', 'current', state.projectId]);
        if (result.code === 'no_active_run' && !state.streamChatId && !state.missingRunResubmitted) {
          state.missingRunResubmitted = true; state.runSubmitted = false; state.operation = 'upload';
          state.summary = 'Flova 确认未收到上次请求，沿用原项目重新提交一次。'; await save();
          return await runVideo(context);
        }
        if (!state.streamChatId || result.data?.terminal !== true) throw new Error('原 Flova 视频任务仍需恢复，已保留项目与任务标识；稍后继续查看。');
        if (!result.data?.assistant_messages) result = await call(['run', 'result', state.projectId, '--stream-chat-id', state.streamChatId]);
      } else {
        const args = ['run', state.projectId, '--content', state.brief];
        for (const [index, source] of state.sources.entries()) {
          signal.throwIfAborted();
          const file = await context.sourceFile(source), bytes = await readFile(file.path);
          if (createHash('sha256').update(bytes).digest('hex') !== source.hash) throw new Error('参考图文件与验收哈希不一致，视频任务未提交。');
          const uploadPath = join(directory, `upload-${index}.json`);
          let upload: FlovaEnvelope | undefined;
          try { upload = JSON.parse(await readFile(uploadPath, 'utf8')); } catch { /* No reusable upload. */ }
          if (!upload || upload.code !== 0) {
            upload = await call(['upload', file.path]); check(upload);
            await writeFile(uploadPath, JSON.stringify(upload), { mode: 0o600 });
          }
          args.push('--file-from', uploadPath);
        }
        state.runSubmitted = true; state.operation = 'run'; state.status = 'running'; state.summary = 'Flova 正在依据物料编排分镜并制作宣传视频。'; await save();
        result = await call(args);
      }
      state.pendingActions = Array.isArray(result.data?.pending_actions) ? result.data!.pending_actions : result.code === 0 ? [] : state.pendingActions;
      if (state.pendingActions.some(action => action.blocking)) {
        state.status = 'awaiting_input'; state.summary = state.pendingActions.filter(action => action.blocking).map(action => action.message || 'Flova 需要选择').join('\n'); await save(); return;
      }
      check(result);
      if (!successful(result)) throw new Error('Flova 尚未返回成功的最终制作结果。');
      const messages = result.data?.assistant_messages || [];
      state.summary = messages.flatMap((message: any) => (message.contents || []).filter((part: any) => part.type === 'text').map((part: any) => part.text)).join('\n').slice(0, 12000) || 'Flova 制作轮次已结束，正在检查导出。';
      state.status = 'ready'; await save();
      let readiness = check(await call(['export', 'readiness', state.projectId]));
      if (readiness.can_export !== true) {
        if ((state.productionRounds || 0) < 6) {
          state.productionRounds = (state.productionRounds || 0) + 1; await save();
          return await runVideo(context, undefined, '继续执行当前已授权的宣传视频制作。根据本项目最新故事板与已绑定物料，完成尚未完成的下一制作阶段；有分镜则不再重建，有绑定则直接实际生成缺少的视频与必要音频，有成功镜头则保留并编排时间线。目标仍是Seedance 2.5、480p、16:9横屏、约30秒成片。请调用工具完成真实产物，不仅描述下一步；不得重新生成已有成功素材，不改角色、产品与已确认规格。正式费用或其他阻塞选项原样返回。');
        }
        state.status = 'ready'; state.summary += '\n时间线尚不可导出，已保留原项目与实际制作结果。'; await save(); return;
      }
      const inventory = check(await call(['project', 'resources', state.projectId, '--types', 'video']));
      if (!Array.isArray(inventory.resources) || !inventory.resources.length) {
        if ((state.productionRounds || 0) < 6) {
          state.productionRounds = (state.productionRounds || 0) + 1; await save();
          return await runVideo(context, undefined, '当前时间线没有实际视频素材，请按本项目已确认分镜与已绑定原图实际生成缺少的Seedance 2.5镜头，480p、16:9，总时长约30秒，并完成必要音频。用户要求直接跑出这一版，生成计划内素材属于当前范围。不要导出空时间线，不重复改分镜与产品设计；返回真实生成结果或正式阻塞选项。');
        }
        state.status = 'ready'; state.summary += '\n目前没有实际视频素材，已保留分镜；尚未发起空时间线导出。'; await save(); return;
      }
      state.status = 'exporting'; state.operation = 'export'; state.exportSubmitted = true; await save();
      result = await call(['export', 'video', state.projectId]);
    }
    check(result);
    if (!successful(result) || typeof result.data?.export_url !== 'string') throw new Error('视频导出尚未成功，继续时核对原导出任务。');
    const url = new URL(result.data.export_url); if (url.protocol !== 'https:') throw new Error('导出地址协议无效。');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('视频下载未完成，保留原导出任务。');
    if (!response.body || response.headers.get('content-type')?.includes('text/')) throw new Error('导出文件无效。');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 512 * 1024 * 1024) throw new Error('导出视频超出文件大小限制。');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('导出结果不是有效的 MP4 文件。');
    const path = join(directory, 'final.mp4'); await writeFile(path, bytes, { mode: 0o600 });
    await addAsset(path, '联名宣传视频 · 成片', true);
    state.status = 'completed'; state.summary = '宣传视频已导出并保存，可播放或下载；请查看成片中的角色、标识与物料连续性。'; await save();
  } catch (error) {
    await events.catch(() => {});
    state.status = state.pendingActions.some(action => action.blocking) ? 'awaiting_input' : state.projectId || state.operation === 'create' ? 'recoverable' : 'failed';
    state.summary = error instanceof Error ? error.message : '视频制作未完成。'; await save();
  }
}
