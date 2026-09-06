import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, FileText, Image as ImageIcon, LoaderCircle, MessageSquare, Pause, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, Workflow, X } from 'lucide-react';
import { SKILLS } from '../src/collider-types';
import type { Brand, Message, RuntimeInfo, Session, SkillId } from '../src/collider-types';
import type { ProductionNode, ProductionProject } from '../src/production-types';
import { ProductionWorkspace } from './components/ProductionWorkspace';
import { api, isServiceUnavailable, uploadFile } from './api';
import { currentSessionAutomation, isSessionFinalReviewPending, isSessionMediaComplete, isSessionMediaRunning, mediaProgressLabel } from './session-automation';
import './unified-workspace.css';

const emptyBrands = (): [Brand, Brand] => [{ id: 'a', name: '', description: '', files: [] }, { id: 'b', name: '', description: '', files: [] }];
const EXAMPLE_BRANDS: [Brand, Brand] = [
  { id: 'a', name: '早八咖啡', description: '虚构品牌 · 社区咖啡店，面向通勤人群。可用资源：现有纸杯、店内数字屏幕。', files: [] },
  { id: 'b', name: '留白书店', description: '虚构品牌 · 独立书店。可用资源：主题书单、店内阅读区。希望让阅读融入日常生活。', files: [] },
];
const STATUS: Record<Session['status'], string> = { idle: '准备就绪', running: '正在协作', paused: '已暂停', awaiting_selection: '等待选择方向', completed: '本轮已完成', error: '需要处理' };
const ROLE_LABELS = { orchestrator: '联名总策划', research: '研究 Agent', creative: '创作 Agent', review: '审查 Agent' };
const ROLE_ICONS = { orchestrator: Workflow, research: Search, creative: Sparkles, review: ShieldCheck };
const RECONNECTING = '本地服务连接中断，正在核对已保存的协作进度。本次操作不会自动重复提交。';
const DIALOGUE_WIDTH_KEY = 'brand-relations.canvas.dialogue-width.v1';
const DEFAULT_DIALOGUE_WIDTH = 390;
function storedDialogueWidth() {
  try {
    const value = Number(localStorage.getItem(DIALOGUE_WIDTH_KEY));
    return Number.isFinite(value) && value >= 280 && value <= 720 ? value : DEFAULT_DIALOGUE_WIDTH;
  } catch { return DEFAULT_DIALOGUE_WIDTH; }
}
function messageRole(message: Message) {
  return message.agentRole || (message.role === 'system' ? 'orchestrator' : message.skill === 'brand-profile' ? 'research' : message.skill === 'quality-review' ? 'review' : 'creative');
}
function rememberUrl(sessionId: string | null, projectId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  if (sessionId) url.searchParams.set('session', sessionId); else url.searchParams.delete('session');
  if (projectId) url.searchParams.set('project', projectId); else url.searchParams.delete('project');
  window.history.replaceState(null, '', url);
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={19} /></button></div>{children}
  </dialog>;
}

function BrandEditor({ brand, onSave, onClose }: { brand: Brand; onSave: (brand: Brand) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Brand>(() => structuredClone(brand));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  async function handleFiles(files: File[]) {
    if (!files.length || uploading) return;
    if (draft.files.length + files.length > 6) { setError('每个品牌最多保留 6 份资料。'); return; }
    setUploading(true); setError('');
    try {
      const results = await Promise.all(files.map(uploadFile));
      setDraft(current => ({ ...current, files: [...current.files, ...results] }));
    } catch (err) { setError(err instanceof Error ? err.message : '资料解析失败。'); }
    finally { setUploading(false); }
  }
  return <Modal title={`品牌 ${brand.id.toUpperCase()} · 资料档案`} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() }); }} className="brand-form">
      <p className="muted">只填品牌名也可以开始。资料越具体，方案越能贴合你的实际条件。</p>
      <label>品牌名称<input autoFocus required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：你的品牌名称" /></label>
      <label>品牌介绍（选填）<textarea rows={5} value={draft.description} maxLength={12000} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="品牌定位、目标人群、语气、产品，以及这次能够投入的资源……" /></label>
      <button type="button" className={`upload-zone ${uploading ? 'loading' : ''}`} disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleFiles([...event.dataTransfer.files]); }}>
        {uploading ? <LoaderCircle className="spin" size={24} /> : <Upload size={24} />}<strong>{uploading ? '正在读取品牌资料…' : '点击上传，或把品牌资料拖到这里'}</strong><span>PDF、Word、TXT、Markdown、JSON · 每份不超过 8 MB</span>
      </button>
      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.json" className="visually-hidden" aria-label="上传品牌资料" onChange={event => { void handleFiles([...(event.target.files || [])]); event.target.value = ''; }} />
      {draft.files.map((file, index) => <div className="uploaded-file" key={`${index}-${file.name}`}><FileText size={17} /><span><strong>{file.name}</strong><small>已读取 {file.text.length.toLocaleString()} 字符</small></span><button type="button" className="icon-button" aria-label={`移除 ${file.name}`} onClick={() => setDraft({ ...draft, files: draft.files.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-foot"><span className="muted small">上传的资料会参与本项目的 AI 分析。</span><button className="button primary" disabled={uploading || !draft.name.trim()}>保存品牌资料<Check size={16} /></button></div>
    </form>
  </Modal>;
}

function DirectionPicker({ session, busy, pendingCall, imageInFlight, onSelect }: { session: Session; busy: boolean; pendingCall: boolean; imageInFlight: boolean; onSelect: (conceptId: string) => void }) {
  if (!session.concepts.length) return null;
  const running = session.status === 'running';
  const selected = session.concepts.find(concept => concept.id === session.selectedConceptId);
  const disabled = busy || running || pendingCall || imageInFlight;
  return <details className="u-skill-event u-direction-picker" open={session.status === 'awaiting_selection'}>
    <summary><Sparkles size={13} /><span>创意方向{selected ? ` · 当前：${selected.title}` : ' · 选择后继续深化'}</span><ChevronDown size={13} /></summary>
    <div className="u-concepts">
      <p>{running ? '正在按当前方向继续深化。如需切换，请先暂停协作。' : imageInFlight ? '概念视觉正在生成，完成后可切换方向。' : pendingCall ? '正在停止当前任务，结束后可切换方向。' : selected ? '改用其他方向后，会保留品牌研究，并重新深化设计、文案、视觉计划与审查。' : '选一个方向，继续深化完整方案。'}</p>
      {session.concepts.map((concept, i) => <button key={concept.id} type="button" disabled={disabled || concept.id === selected?.id} aria-pressed={concept.id === selected?.id} onClick={() => onSelect(concept.id)}>
        <small>方向 0{i + 1}{concept.id === selected?.id ? session.selectionSource === 'orchestrator' ? ' · 主控推荐 · 当前方向' : ' · 你的选择 · 当前方向' : ''}</small><strong>{concept.title}</strong><p>{concept.description}</p><span>{concept.id === selected?.id ? <>正在采用<Check size={13} /></> : <>改用这个方向<ArrowRight size={13} /></>}</span>
      </button>)}
    </div>
  </details>;
}

function CliExecution({ message }: { message: Message }) {
  const run = message.execution;
  if (!run) return null;
  const states = { starting: '准备启动', running: '运行中', completed: '已退出 · 结果已返回', failed: '执行失败', interrupted: '已停止' };
  return <div className="u-cli-execution"><small>本地 {run.transport === 'grok-cli' ? 'Grok' : 'Codex'} CLI · {run.agentId} · {states[run.state]}</small><pre>{[
    run.pid ? `进程 PID：${run.pid}` : '等待进程启动', run.threadId ? `独立会话：${run.threadId}` : '正在建立会话',
    `任务：${run.runId}`, `简报版本：${run.revision}`, run.finishedAt ? `结束：${new Date(run.finishedAt).toLocaleTimeString('zh-CN')}` : '',
  ].filter(Boolean).join('\n')}</pre></div>;
}
function DialogueMessage({ message, brands, showSkills, onArtifact }: { message: Message; brands: [Brand, Brand]; showSkills: boolean; onArtifact: (id: string) => void }) {
  const role = messageRole(message), Icon = ROLE_ICONS[role];
  if (message.kind === 'skill') {
    if (!showSkills) return null;
    return <details className={`u-skill-event ${message.status || ''}`}><summary>{message.status === 'running' ? <LoaderCircle size={13} className="spin" /> : message.status === 'error' ? <X size={13} /> : <Check size={13} />}<span>{SKILLS.find(skill => skill.id === message.skill)?.name || '工作记录'}</span><small>{message.status === 'running' ? '执行中' : message.status === 'error' ? '未完成' : '已完成'}</small><ChevronDown size={12} /></summary><p>{message.content}</p>{message.detail && <pre>{message.detail}</pre>}<CliExecution message={message} /><small>{message.model && `${message.model} · `}简报 v{message.revision}</small>{message.skill && message.status === 'done' && <button onClick={() => onArtifact(message.skill!)}>在画布查看<ArrowRight size={12} /></button>}</details>;
  }
  const user = message.role === 'user';
  const brand = brands.find(brand => brand.id === message.role);
  const title = user ? '你' : message.agentRole ? ROLE_LABELS[role] : brand ? `${brand.name} · 品牌视角` : '联名总策划';
  return <article className={`u-message ${user ? 'is-user' : `is-${role}`}`}><div className="u-message-head"><span className="u-agent-avatar">{user ? '你' : <Icon size={14} />}</span><strong>{title}</strong><small>{brand ? message.agentRole ? brand.name : '历史记录' : user ? '创意主理人' : message.execution ? '主控 CLI' : '主控'}</small><time>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><div className="u-message-content">{message.execution && message.status === 'error' ? message.detail || '此轮主控 CLI 未完成，未提交交接。' : message.content}</div>{showSkills && message.kind === 'notice' && message.execution && <details className="u-skill-event"><summary>本地 CLI 工作记录 · {message.status === 'running' ? '运行中' : message.status === 'error' ? '已停止 / 未完成' : '已完成'}<ChevronDown size={12} /></summary><CliExecution message={message} /></details>}</article>;
}

export default function App({ channelPreviewMode = false }: { channelPreviewMode?: boolean } = {}) {
  const initialRoute = useRef(new URLSearchParams(location.search));
  const [restoring, setRestoring] = useState(true);
  const [brands, setBrands] = useState<[Brand, Brand]>(emptyBrands);
  const [goal, setGoal] = useState('');
  const [constraints] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [projectId] = useState<string | null>(() => new URLSearchParams(location.search).get('project'));
  const [sourceProject, setSourceProject] = useState<ProductionProject | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [modal, setModal] = useState<'skills' | 'help' | 'brief' | null>(null);
  const [editingBrand, setEditingBrand] = useState<'a' | 'b' | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillId>('brand-profile');
  const [input, setInput] = useState('');
  const [working, setBusy] = useState(false);
  const [showSkills, setShowSkills] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const busy = working || restoring || Boolean(reconcileId);
  const [contextNode, setContextNode] = useState<ProductionNode | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [followRequest, setFollowRequest] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [initialDialogueWidth] = useState(storedDialogueWidth);
  const dialogueWidthRef = useRef(initialDialogueWidth);
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const followRef = useRef(true);
  const navigationRef = useRef(0);
  const requestRef = useRef(0);
  const sessionId = session?.id;
  const mediaRunning = isSessionMediaRunning(session);
  const automation = currentSessionAutomation(session);
  const running = session?.status === 'running' || mediaRunning;
  const pendingCall = !!session?.messages.some(message => message.status === 'running');
  const imageInFlight = !!session?.messages.some(message => message.kind === 'skill' && message.role === 'system' && message.skill === 'visual-production' && message.status === 'running')
    || Boolean(mediaRunning && automation?.materials.some(material => material.status === 'running'));
  const shownBrands = session?.brands || brands;
  const projectTitle = sourceProject?.title || session?.title || (brands.every(b => b.name) ? `${brands[0].name} × ${brands[1].name}` : '未命名联名项目');
  const isNew = !session && !projectId;
  const startUnavailable = mode === 'live' && (!runtime?.configured || runtime.autoProductionConfigured === false);
  const automaticProductionError = isNew && mode === 'live' && runtime?.autoProductionConfigured === false
    ? runtime.automaticProductionError || '自动素材采集与图像制作暂未就绪，请先检查本地服务配置。' : '';
  const activeRole = session?.activeSkill === 'brand-profile' ? 'research' : session?.activeSkill === 'quality-review' ? 'review' : session?.activeSkill || imageInFlight ? 'creative' : 'orchestrator';

  const applyDialogueWidth = useCallback((requestedWidth: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return requestedWidth;
    const maxWidth = Math.max(280, Math.min(720, workspace.clientWidth - 356));
    const nextWidth = Math.round(Math.min(maxWidth, Math.max(280, requestedWidth)));
    dialogueWidthRef.current = nextWidth;
    workspace.style.setProperty('--u-dialogue-width', `${nextWidth}px`);
    resizeHandleRef.current?.setAttribute('aria-valuenow', String(nextWidth));
    return nextWidth;
  }, []);

  useEffect(() => {
    applyDialogueWidth(initialDialogueWidth);
    const fitToViewport = () => applyDialogueWidth(dialogueWidthRef.current);
    window.addEventListener('resize', fitToViewport, { passive: true });
    return () => window.removeEventListener('resize', fitToViewport);
  }, [applyDialogueWidth, initialDialogueWidth]);

  useEffect(() => {
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const params = initialRoute.current;
    let savedId = params.get('session');
    if (!savedId && params.get('project')) { try { savedId = localStorage.getItem(`collider.discussion.v1.${params.get('project')}`); } catch { /* optional */ } }
    async function restoreRuntime() {
      try {
        const info = await api<RuntimeInfo>('/runtime', undefined, controller.signal);
        if (!controller.signal.aborted) { setRuntime(info); setError(previous => info.executionError || (!savedId && previous === RECONNECTING ? '' : previous)); }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(isServiceUnavailable(err) ? RECONNECTING : err instanceof Error ? err.message : '无法读取本地服务状态。');
          if (isServiceUnavailable(err)) timers.push(setTimeout(() => void restoreRuntime(), 3000));
        }
      }
    }
    async function restoreSession() {
      try {
        const value = await api<Session>(`/sessions/${encodeURIComponent(savedId!)}`, undefined, controller.signal);
        if (!controller.signal.aborted && navigationRef.current === 0) { setSession(value); setMode(value.mode); setError(previous => previous === RECONNECTING ? '' : previous); setRestoring(false); }
      } catch (err) {
        if (!controller.signal.aborted && navigationRef.current === 0) {
          if (isServiceUnavailable(err)) { setError(RECONNECTING); timers.push(setTimeout(() => void restoreSession(), 3000)); }
          else { setError(err instanceof Error ? err.message : '无法读取已保存的项目。'); setRestoring(false); }
        }
      }
    }
    void restoreRuntime();
    if (savedId) void restoreSession();
    else setRestoring(false);
    return () => { controller.abort(); timers.forEach(clearTimeout); };
  }, []);
  useEffect(() => { if (!restoring) rememberUrl(session?.id || null, projectId); }, [session?.id, projectId, restoring]);
  useEffect(() => {
    const id = reconcileId || sessionId;
    if (!id || (!running && !pendingCall && !reconcileId)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const request = requestRef.current;
      try {
        const next = await api<Session>(`/sessions/${id}`, undefined, controller.signal);
        if (!controller.signal.aborted && request === requestRef.current) {
          setSession(current => (!current && reconcileId === next.id) || (current?.id === next.id && next.revision >= current.revision) ? next : current);
          setMode(next.mode); setReconcileId(null); setError(previous => previous === RECONNECTING ? '' : previous);
        }
      } catch (err) {
        if (!controller.signal.aborted && request === requestRef.current) {
          setError(isServiceUnavailable(err) ? RECONNECTING : err instanceof Error ? err.message : '无法读取协作进度。');
          if (!isServiceUnavailable(err)) setReconcileId(null);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1400);
    }
    timer = setTimeout(poll, 600);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, running, pendingCall, reconcileId]);
  useEffect(() => {
    if (followRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length, session?.messages.at(-1)?.status]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);

  function applySession(value: Session) {
    setSession(current => current?.id === value.id && current.revision > value.revision ? current : value);
    requestRef.current += 1;
    if (projectId) try { localStorage.setItem(`collider.discussion.v1.${projectId}`, value.id); } catch { /* optional */ }
  }
  function handleOperationError(err: unknown, id?: string) {
    if (isServiceUnavailable(err) && id) { setReconcileId(id); setError(RECONNECTING); }
    else setError(err instanceof Error ? err.message : '操作未完成，已保存的进度被保留。');
  }
  async function mutate(action: string, payload: unknown = {}) {
    if (!session || busy) return;
    const navigation = navigationRef.current;
    setBusy(true); setError(''); requestRef.current += 1;
    try { const updated = await api<Session>(`/sessions/${session.id}/${action}`, payload); if (navigation === navigationRef.current) { applySession(updated); if (['select', 'run', 'image'].includes(action)) setFollowRequest(value => value + 1); } }
    catch (err) { if (navigation === navigationRef.current) handleOperationError(err, session.id); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  async function start(initialText?: string) {
    if (busy) return;
    if (startUnavailable) { setError(automaticProductionError || '本地协作服务尚未就绪，请稍后重试。'); return; }
    if (brands.some(brand => !brand.name.trim())) { setError('填写两个品牌的名称即可开始，介绍和文件可以稍后补充。'); return; }
    const navigation = navigationRef.current;
    setBusy(true); setError(''); followRef.current = true;
    let createdId: string | undefined;
    try {
      const created = await api<Session>('/sessions', { brands, goal: goal.trim() || initialText?.trim() || '探索两个品牌的联名可能', mode,
        autoAdvance: true, autoProduce: mode === 'live', combineCreativeStages: true, constraints: initialText && goal.trim() ? [...constraints, initialText] : constraints });
      if (navigation !== navigationRef.current) return;
      createdId = created.id;
      applySession(created); setInput(''); setFollowRequest(value => value + 1);
      const updated = await api<Session>(`/sessions/${created.id}/run`, {});
      if (navigation === navigationRef.current) applySession(updated);
    } catch (err) { if (navigation === navigationRef.current) handleOperationError(err, createdId); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  async function intervene(event?: FormEvent) {
    event?.preventDefault();
    const value = input.trim();
    if (!value || busy) return;
    if (isNew) { await start(value); return; }
    const navigation = navigationRef.current;
    setBusy(true); setError(''); requestRef.current += 1;
    let currentId = session?.id;
    try {
      let current = session;
      if (!current && projectId) {
        current = await api<Session>(`/production/projects/${encodeURIComponent(projectId)}/discuss`, {});
        if (navigation !== navigationRef.current) return;
        applySession(current);
      }
      if (!current) return;
      currentId = current.id;
      const artifactContext = contextNode ? {
        title: contextNode.title.slice(0, 200),
        content: [`状态：${contextNode.statusLabel || contextNode.status}`, contextNode.summary, contextNode.content || ''].join('\n\n').slice(0, 12000),
        sources: contextNode.sources.slice(0, 20).map(source => `${source.label}${source.path ? ` · ${source.path}` : ''}`.slice(0, 300)),
      } : undefined;
      const updated = await api<Session>(`/sessions/${current.id}/intervene`, { text: value, artifactContext, ...(channelPreviewMode ? { restartFrom: 1 } : {}) });
      if (navigation !== navigationRef.current) return;
      applySession(updated); setInput(v => v === value ? '' : v); setContextNode(null); setFollowRequest(value => value + 1); followRef.current = true;
      if (updated.status === 'paused' && current.status !== 'paused' && !imageInFlight) {
        const resumed = await api<Session>(`/sessions/${current.id}/run`, {});
        if (navigation === navigationRef.current) applySession(resumed);
      }
      setToast(updated.revision === current.revision
        ? '消息已记录，当前进度和已有成果保留。'
        : '已按指定起点重做，之前的阶段成果保留。');
    } catch (err) { if (navigation === navigationRef.current) handleOperationError(err, currentId); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  function beginDialogueResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(max-width: 700px)').matches) return;
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: document.getElementById('canvas-dialogue')?.getBoundingClientRect().width || dialogueWidthRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
  }
  function updateDialogueResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    applyDialogueWidth(resize.startWidth + resize.startX - event.clientX);
  }
  function finishDialogueResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    delete event.currentTarget.dataset.dragging;
    try { localStorage.setItem(DIALOGUE_WIDTH_KEY, String(dialogueWidthRef.current)); } catch { /* optional preference */ }
  }
  function resizeDialogueWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowLeft' ? 24 : event.key === 'ArrowRight' ? -24 : 0;
    if (!delta && event.key !== 'Home') return;
    event.preventDefault();
    const nextWidth = applyDialogueWidth(event.key === 'Home' ? DEFAULT_DIALOGUE_WIDTH : dialogueWidthRef.current + delta);
    try { localStorage.setItem(DIALOGUE_WIDTH_KEY, String(nextWidth)); } catch { /* optional preference */ }
  }
  function discuss(node?: ProductionNode) { setContextNode(node || null); inputRef.current?.focus(); }
  function focusArtifact(id: string) { setFocusNodeId(null); requestAnimationFrame(() => setFocusNodeId(id)); }
  const initialBrief = <div className="u-setup"><div className="u-welcome-symbol"><img src="/brand-relations/assets/mark-blue-black.svg" width="48" height="48" alt="" /></div><h2>从两个品牌开始。</h2><p>从真实品牌素材开始，自动完成研究、设计、逐件出图与审查，成果会逐步呈现在画布上。</p><div className="u-brand-inputs">{brands.map((brand, i) => <button key={brand.id} onClick={() => setEditingBrand(brand.id)}><span>{brand.name.slice(0, 1) || (i ? 'B' : 'A')}</span><div><strong>{brand.name || `添加品牌 ${i ? 'B' : 'A'}`}</strong><small>{brand.name ? `${brand.files.length} 份资料 · 点击编辑` : '品牌介绍 / 上传资料'}</small></div><Plus size={15} /></button>)}</div><label className="u-goal-label">这次想一起做什么？<textarea rows={3} value={goal} maxLength={5000} onChange={event => setGoal(event.target.value)} placeholder="例如：围绕年轻人的日常，做一款让双方都有辨识度的联名饮品。" /></label><div className="u-setup-actions"><select aria-label="协作模式" value={mode} onChange={event => setMode(event.target.value as 'live' | 'demo')}><option value="live">{runtime?.transport?.endsWith('-cli') ? '本地 CLI 协作' : 'AI 实时协作'}</option><option value="demo">交互演示</option></select><button onClick={() => { setBrands(structuredClone(EXAMPLE_BRANDS)); setGoal('让咖啡与主题阅读形成具体关联，增加周末到店。'); setMode('demo'); }}>填入演示品牌</button></div><button className="u-primary u-start" disabled={busy || !runtime || startUnavailable} onClick={() => void start()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}开始联名协作<ArrowRight size={15} /></button><small className="u-setup-note">{mode === 'demo' ? '演示九步协作流程 · 使用固定示例内容' : '九步自动协作 · 核心与推荐物料最多 4 并发生图'}</small>{mode === 'live' && <small className="u-setup-note">自动采集真实素材并附图验收。可在目标中限定制作范围，可选物料保留为候选。</small>}{automaticProductionError && <p className="form-error" role="alert">{automaticProductionError}</p>}</div>;

  return <div className={`unified-app${isNew ? ' is-new' : ''}`}>
    <header className="u-topbar"><button className="u-logo" type="button" aria-label="返回第一页" onClick={() => window.location.assign('/')}><img className="u-brand-symbol" src="/brand-relations/assets/mark-black.svg" alt="" /></button><div className="u-project-switch"><span className="u-project-title">{projectTitle}</span><small>{projectId ? '已有项目' : session?.mode === 'demo' ? '交互演示' : '联名创作空间'}</small></div><div className="u-header-actions"><span className={`u-connection ${runtime?.configured ? 'ready' : ''}`}><i />{runtime?.transport === 'grok-cli' ? 'Grok CLI · ' : runtime?.transport === 'codex-cli' ? 'Codex CLI · ' : ''}{runtime?.model || '连接中'}</span><button title="项目简报与资料" aria-label="项目简报与资料" onClick={() => setModal('brief')}><FileText size={16} /></button><button title="工作方法" aria-label="工作方法" onClick={() => setModal('skills')}><Settings2 size={16} /></button>{session && <a className="u-export" aria-label="导出当前方案" href={`/api/sessions/${session.id}/export`}><ArrowDownToLine size={14} /><span>导出</span></a>}</div></header>
    <div ref={workspaceRef} className="u-workspace" style={{ '--u-dialogue-width': `${initialDialogueWidth}px` } as CSSProperties}><section id="canvas-results" className="u-canvas-area" aria-label="项目成果画布"><ProductionWorkspace session={session} projectId={projectId} onProjectLoaded={setSourceProject} onDiscuss={discuss} focusNodeId={focusNodeId} followRequest={followRequest} /></section>
      <div ref={resizeHandleRef} className="u-resize-handle" role="separator" aria-label="调整画布与对话宽度" aria-orientation="vertical" aria-controls="canvas-results canvas-dialogue" aria-valuemin={280} aria-valuemax={720} aria-valuenow={Math.round(initialDialogueWidth)} tabIndex={0} onPointerDown={beginDialogueResize} onPointerMove={updateDialogueResize} onPointerUp={finishDialogueResize} onPointerCancel={finishDialogueResize} onKeyDown={resizeDialogueWithKeyboard} />
      <aside id="canvas-dialogue" className="u-dialogue" aria-label="多 Agent 协作对话"><div className="u-dialogue-header"><MessageSquare size={17} /><h1>协作对话</h1><span>{running || imageInFlight ? <><i className="u-live-dot" />协作中</> : session ? STATUS[session.status] : projectId ? '成果已同步' : '准备开始'}</span></div><div className="u-agent-team">{Object.entries(ROLE_LABELS).map(([role, label]) => { const Icon = ROLE_ICONS[role as keyof typeof ROLE_ICONS]; return <span key={role} className={activeRole === role && (running || imageInFlight || isNew) ? 'active' : ''} title={role === 'orchestrator' ? '整理简报、分派阶段、汇总结果' : label}><Icon size={12} />{label.replace(' Agent', '')}</span>; })}<button aria-label="显示工作记录" aria-pressed={showSkills} className={showSkills ? 'on' : ''} onClick={() => setShowSkills(!showSkills)}><Workflow size={13} /></button></div>
      {error && <div className="u-error" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={14} /></button></div>}
      <div className="u-chat-scroll" ref={scrollRef} onScroll={event => { const el = event.currentTarget; followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; setShowJump(!followRef.current); }}>
        {restoring ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={18} />正在恢复已保存的协作进度…</div> : isNew ? initialBrief : <div className="u-message-list">
          {sourceProject && <><article className="u-message is-orchestrator"><div className="u-message-head"><span className="u-agent-avatar"><Workflow size={14} /></span><strong>联名总策划</strong><small>项目资料</small></div><div className="u-message-content">已载入 {sourceProject.brandNames.join(' × ')} 的工作成果。画布先定位到当前物料，研究、故事和审查记录都保留在同一张无限画布上。左下角图层可以定位或隐藏各类成果。你可以点选任一成果，直接在这里继续修改。</div></article><div className="u-record-label"><span />已保存成果<span /></div>{[['research', 'strategy', '品牌研究与方向'], ['creative', 'materials', '产品与效果图'], ['review', 'review', '方案审查']].map(([role, lane, title]) => { const nodes = sourceProject.nodes.filter(n => n.lane === lane && n.status !== 'planned'); const first = nodes.find(n => n.primaryAssetId) || nodes[0]; const Icon = ROLE_ICONS[role as keyof typeof ROLE_ICONS]; return first ? <button className="u-artifact-link" key={lane} onClick={() => focusArtifact(first.id)}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{nodes.length} 项已保存记录 · 在画布查看</small></div><ArrowRight size={14} /></button> : null; })}<p className="u-record-note">以上来自已有项目文件。新的协作发言会接在下面。</p></>}
          {session && <><div className="u-session-label">{session.mode === 'demo' ? '演示流程 · 模板内容' : '本轮协作'}<span>简报 v{session.revision}</span></div>{session.messages.map(message => <DialogueMessage key={message.id} message={message} brands={shownBrands} showSkills={showSkills} onArtifact={focusArtifact} />)}{running && <div className="u-working"><LoaderCircle size={14} className="spin" />{mediaRunning ? mediaProgressLabel(session) : `${SKILLS.find(skill => skill.id === session.activeSkill)?.name || '主控'}正在推进…`}</div>}<DirectionPicker key={session.id} session={session} busy={busy} pendingCall={pendingCall} imageInFlight={imageInFlight} onSelect={conceptId => void mutate('select', { conceptId })} />{session.status === 'error' && <div className="u-error-block"><p>{session.error || '本轮未完成，已保留进度。'}</p><button className="u-primary" disabled={busy} onClick={() => void mutate('run')}><Play size={13} />重试本轮</button></div>}{session.status === 'completed' && !running && <div className="u-completed">{!session.autoProduce || (isSessionMediaComplete(session) && !isSessionFinalReviewPending(session)) ? <Check size={15} /> : <ShieldCheck size={15} />}<p>{session.autoProduce ? isSessionMediaComplete(session) && !isSessionFinalReviewPending(session) ? '本轮方案与范围内物料已完成，来源、附图与验收证据已保存在画布。' : '当前成果已保存，部分物料或验收证据仍需处理，请查看画布记录。' : '本轮方案已保存。继续补充标准，或生成概念视觉。'}</p>{!session.autoProduce && session.mode === 'live' && !session.proposal?.imageUrl && <button className="u-primary" disabled={busy || imageInFlight} onClick={() => void mutate('image')}><ImageIcon size={14} />{imageInFlight ? '正在生成…' : '生成概念视觉'}</button>}</div>}</>}
        </div>}
      </div>
      {showJump && <button className="u-jump" onClick={() => { followRef.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }}><ArrowDown size={13} />最新进度</button>}
      <div className="u-composer-area">{contextNode && <div className="u-context"><FileText size={12} /><span>正在讨论：{contextNode.title}</span><button aria-label="取消关联成果" onClick={() => setContextNode(null)}><X size={12} /></button></div>}{session && <div className="u-run-controls"><span>简报 v{session.revision} · {session.constraints.length} 条标准</span>{running ? <button disabled={busy} onClick={() => void mutate('pause')}><Pause size={12} />暂停</button> : ['paused', 'idle'].includes(session.status) ? <button disabled={busy} onClick={() => void mutate('run')}><Play size={12} />继续</button> : null}</div>}<form className="u-composer" onSubmit={event => void intervene(event)}><textarea ref={inputRef} aria-label="给联名团队补充标准" value={input} maxLength={1800} rows={2} placeholder={channelPreviewMode ? '例如：咖啡渠道突出周末阅读，书店渠道突出日常咖啡；各自保留原 VI。' : isNew ? '补充合作目标、受众或你想试试的方向…' : '补充标准、调整方向，或聊聊这张图…'} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void intervene(); } }} /><div><button type="button" className="u-attach" title="品牌资料" aria-label="品牌资料" onClick={() => isNew ? setEditingBrand('a') : setModal('brief')}><Plus size={18} /></button><small>交给总策划，协调下一步</small><button className="u-send" aria-label={channelPreviewMode ? "生成或更新双方渠道预演" : "发送新标准"} disabled={!input.trim() || busy || (isNew && startUnavailable)}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}{channelPreviewMode && <span className="u-send-label">{session?.proposal ? '更新预演' : '生成预演'}</span>}</button></div></form><div className="u-composer-foot"><span>{channelPreviewMode ? (runtime?.imageConfigured ? '提交后按新要求重新生成；历史成果会保留' : '图像生成未连接 · 生成方案与提示词') : '消息不会自动回退进度；重做请指定步骤'}</span><span>↵ 发送</span></div></div>
      </aside>
    </div>
    {toast && <div className="toast u-toast" role="status"><Check size={15} />{toast}</div>}
    {editingBrand && <BrandEditor brand={brands[editingBrand === 'a' ? 0 : 1]} onClose={() => setEditingBrand(null)} onSave={next => { setBrands(current => current.map(brand => brand.id === next.id ? next : brand) as [Brand, Brand]); setEditingBrand(null); }} />}
    {modal === 'skills' && <Modal title="团队共用的创作方法" wide onClose={() => setModal(null)}><p className="modal-description">总策划维护简报与阶段顺序。研究、创作、审查角色共用项目资料，按当前任务调用以下 Skill。</p><div className="skill-browser"><nav>{SKILLS.map((skill, index) => <button key={skill.id} className={selectedSkill === skill.id ? 'selected' : ''} onClick={() => setSelectedSkill(skill.id)}><span>0{index + 1}</span>{skill.name}<ChevronRight size={14} /></button>)}</nav><section><h3>{SKILLS.find(skill => skill.id === selectedSkill)?.name}</h3><p className="muted">{SKILLS.find(skill => skill.id === selectedSkill)?.description}</p><pre>{runtime?.skills.find(skill => skill.id === selectedSkill)?.content || '正在读取…'}</pre></section></div></Modal>}
    {modal === 'brief' && <Modal title="项目简报与共同资料" onClose={() => setModal(null)}><div className="u-brief"><p>{sourceProject?.summary || session?.goal || goal || '先在右侧添加两个品牌和合作目标。'}</p>{(sourceProject && !session ? sourceProject.brandNames.map((name, i) => ({ id: i ? 'b' : 'a', name, description: '研究报告可从画布左下角的研究图层查看。', files: [] })) : shownBrands).map(brand => <section key={brand.id}><h3>{brand.name || `品牌 ${brand.id.toUpperCase()}`}</h3><p>{brand.description || '还未添加品牌介绍。'}</p>{brand.files.map(file => <p key={file.name}><FileText size={12} /> {file.name}</p>)}{isNew && <button className="u-primary" onClick={() => { setModal(null); setEditingBrand(brand.id as 'a' | 'b'); }}>编辑品牌资料</button>}</section>)}{(session?.constraints || constraints).length > 0 && <section><h3>当前标准</h3>{(session?.constraints || constraints).map((constraint, i) => <p key={i}>{constraint}</p>)}</section>}<p className="muted">研究成果、选定方向与审查意见均保留在本项目中。运行后可直接在对话中追加或修改标准。</p></div></Modal>}
  </div>;
}
