import { useEffect, useRef, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, FileText, History, Image as ImageIcon, LoaderCircle, MessageSquare, Pause, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, Workflow, X } from 'lucide-react';
import { SKILLS } from '../src/collider-types';
import type { Brand, Message, RuntimeInfo, Session, SkillId } from '../src/collider-types';
import type { ProductionNode, ProductionProject, ProductionProjectSummary } from '../src/production-types';
import { ProductionWorkspace } from './components/ProductionWorkspace';
import { api, uploadFile } from './api';
import './unified-workspace.css';

const emptyBrands = (): [Brand, Brand] => [{ id: 'a', name: '', description: '', files: [] }, { id: 'b', name: '', description: '', files: [] }];
const EXAMPLE_BRANDS: [Brand, Brand] = [
  { id: 'a', name: '早八咖啡', description: '虚构品牌 · 社区咖啡店，面向通勤人群。可用资源：现有纸杯、店内数字屏幕。', files: [] },
  { id: 'b', name: '留白书店', description: '虚构品牌 · 独立书店。可用资源：主题书单、店内阅读区。希望让阅读融入日常生活。', files: [] },
];
const STATUS: Record<Session['status'], string> = { idle: '准备就绪', running: '正在协作', paused: '已暂停', awaiting_selection: '等待选择方向', completed: '本轮已完成', error: '需要处理' };
const ROLE_LABELS = { orchestrator: '联名总策划', research: '研究 Agent', creative: '创作 Agent', review: '审查 Agent' };
const ROLE_ICONS = { orchestrator: Workflow, research: Search, creative: Sparkles, review: ShieldCheck };
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
      <p className="muted">让 Agent 了解品牌的性格、受众与真实可用资源。</p>
      <label>品牌名称<input autoFocus required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：你的品牌名称" /></label>
      <label>品牌介绍<textarea rows={5} value={draft.description} maxLength={12000} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="品牌定位、目标人群、语气、产品，以及这次能够投入的资源……" /></label>
      <button type="button" className={`upload-zone ${uploading ? 'loading' : ''}`} disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleFiles([...event.dataTransfer.files]); }}>
        {uploading ? <LoaderCircle className="spin" size={24} /> : <Upload size={24} />}<strong>{uploading ? '正在读取品牌资料…' : '点击上传，或把品牌资料拖到这里'}</strong><span>PDF、Word、TXT、Markdown、JSON · 每份不超过 8 MB</span>
      </button>
      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.json" className="visually-hidden" aria-label="上传品牌资料" onChange={event => { void handleFiles([...(event.target.files || [])]); event.target.value = ''; }} />
      {draft.files.map((file, index) => <div className="uploaded-file" key={`${index}-${file.name}`}><FileText size={17} /><span><strong>{file.name}</strong><small>已读取 {file.text.length.toLocaleString()} 字符</small></span><button type="button" className="icon-button" aria-label={`移除 ${file.name}`} onClick={() => setDraft({ ...draft, files: draft.files.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-foot"><span className="muted small">上传的资料会参与本项目的 AI 分析。</span><button className="button primary" disabled={uploading || !draft.name.trim() || (!draft.description.trim() && !draft.files.length)}>保存品牌资料<Check size={16} /></button></div>
    </form>
  </Modal>;
}

function DialogueMessage({ message, brands, showSkills, onArtifact }: { message: Message; brands: [Brand, Brand]; showSkills: boolean; onArtifact: (id: string) => void }) {
  const role = messageRole(message), Icon = ROLE_ICONS[role];
  if (message.kind === 'skill') {
    if (!showSkills) return null;
    return <details className={`u-skill-event ${message.status || ''}`}><summary>{message.status === 'running' ? <LoaderCircle size={13} className="spin" /> : message.status === 'error' ? <X size={13} /> : <Check size={13} />}<span>{SKILLS.find(skill => skill.id === message.skill)?.name || '工作记录'}</span><small>{message.status === 'running' ? '执行中' : message.status === 'error' ? '未完成' : '已完成'}</small><ChevronDown size={12} /></summary><p>{message.content}</p>{message.detail && <pre>{message.detail}</pre>}<small>{message.model && `${message.model} · `}简报 v{message.revision}</small>{message.skill && message.status === 'done' && <button onClick={() => onArtifact(message.skill!)}>在画布查看<ArrowRight size={12} /></button>}</details>;
  }
  const user = message.role === 'user';
  const brand = brands.find(brand => brand.id === message.role);
  const title = user ? '你' : message.agentRole ? ROLE_LABELS[role] : brand ? `${brand.name} · 品牌视角` : '联名总策划';
  return <article className={`u-message ${user ? 'is-user' : `is-${role}`}`}><div className="u-message-head"><span className="u-agent-avatar">{user ? '你' : <Icon size={14} />}</span><strong>{title}</strong><small>{brand ? message.agentRole ? brand.name : '历史记录' : user ? '创意主理人' : '主控'}</small><time>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><div className="u-message-content">{message.content}</div></article>;
}

export default function App() {
  const initialRoute = useRef(new URLSearchParams(location.search));
  const [restoring, setRestoring] = useState(true);
  const [brands, setBrands] = useState<[Brand, Brand]>(emptyBrands);
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [projectId, setProjectId] = useState<string | null>(() => new URLSearchParams(location.search).get('project'));
  const [sourceProject, setSourceProject] = useState<ProductionProject | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [modal, setModal] = useState<'skills' | 'history' | 'help' | 'brief' | null>(null);
  const [editingBrand, setEditingBrand] = useState<'a' | 'b' | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillId>('brand-profile');
  const [history, setHistory] = useState<Session[]>([]);
  const [projects, setProjects] = useState<ProductionProjectSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSkills, setShowSkills] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [contextNode, setContextNode] = useState<ProductionNode | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [followRequest, setFollowRequest] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followRef = useRef(true);
  const navigationRef = useRef(0);
  const requestRef = useRef(0);
  const sessionId = session?.id;
  const running = session?.status === 'running';
  const pendingCall = !!session?.messages.some(message => message.kind === 'skill' && message.status === 'running');
  const imageInFlight = !!session?.messages.some(message => message.kind === 'skill' && message.role === 'system' && message.skill === 'visual-production' && message.status === 'running');
  const shownBrands = session?.brands || brands;
  const projectTitle = sourceProject?.title || session?.title || (brands.every(b => b.name) ? `${brands[0].name} × ${brands[1].name}` : '未命名联名项目');
  const isNew = !session && !projectId;
  const activeRole = session?.activeSkill === 'brand-profile' ? 'research' : session?.activeSkill === 'quality-review' ? 'review' : session?.activeSkill || imageInFlight ? 'creative' : 'orchestrator';

  useEffect(() => {
    const controller = new AbortController();
    const params = initialRoute.current;
    let savedId = params.get('session');
    if (!savedId && params.get('project')) { try { savedId = localStorage.getItem(`collider.discussion.v1.${params.get('project')}`); } catch { /* optional */ } }
    void api<RuntimeInfo>('/runtime', undefined, controller.signal).then(setRuntime).catch(err => { if (!controller.signal.aborted) setError('暂时无法连接工作台服务，请检查本地服务是否启动。'); });
    if (savedId) void api<Session>(`/sessions/${encodeURIComponent(savedId)}`, undefined, controller.signal).then(value => { if (!controller.signal.aborted && navigationRef.current === 0) { setSession(value); setMode(value.mode); } }).catch(() => { /* A missing old session does not block a new project. */ }).finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    else setRestoring(false);
    return () => controller.abort();
  }, []);
  useEffect(() => { if (!restoring) rememberUrl(session?.id || null, projectId); }, [session?.id, projectId, restoring]);
  useEffect(() => {
    if (!sessionId || (!running && !pendingCall)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const request = requestRef.current;
      try {
        const next = await api<Session>(`/sessions/${sessionId}`, undefined, controller.signal);
        if (!controller.signal.aborted && request === requestRef.current) setSession(current => current?.id === next.id && next.revision >= current.revision ? next : current);
      } catch { if (!controller.signal.aborted) setError('连接暂时中断，正在重新获取协作进度。'); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1400);
    }
    timer = setTimeout(poll, 600);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, running, pendingCall]);
  useEffect(() => {
    if (followRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length, session?.messages.at(-1)?.status]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);

  function applySession(value: Session) {
    setSession(current => current?.id === value.id && current.revision > value.revision ? current : value);
    requestRef.current += 1;
    if (projectId) try { localStorage.setItem(`collider.discussion.v1.${projectId}`, value.id); } catch { /* optional */ }
  }
  async function mutate(action: string, payload: unknown = {}) {
    if (!session || busy) return;
    const navigation = navigationRef.current;
    setBusy(true); setError(''); requestRef.current += 1;
    try { const updated = await api<Session>(`/sessions/${session.id}/${action}`, payload); if (navigation === navigationRef.current) { applySession(updated); if (['select', 'run', 'image'].includes(action)) setFollowRequest(value => value + 1); } }
    catch (err) { if (navigation === navigationRef.current) setError(err instanceof Error ? err.message : '操作未完成，请重试。'); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  async function start(initialText?: string) {
    if (busy) return;
    if (brands.some(brand => !brand.name.trim() || (!brand.description.trim() && !brand.files.length))) { setError('先补充两个品牌的名称，以及品牌介绍或资料。'); return; }
    const navigation = navigationRef.current;
    setBusy(true); setError(''); followRef.current = true;
    try {
      const created = await api<Session>('/sessions', { brands, goal: goal.trim() || initialText?.trim() || '探索两个品牌的联名可能', mode, constraints: initialText && goal.trim() ? [...constraints, initialText] : constraints });
      if (navigation !== navigationRef.current) return;
      applySession(created); setInput(''); setFollowRequest(value => value + 1);
      const updated = await api<Session>(`/sessions/${created.id}/run`, {});
      if (navigation === navigationRef.current) applySession(updated);
    } catch (err) { if (navigation === navigationRef.current) setError(err instanceof Error ? err.message : '启动失败，请重试。'); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  async function intervene(event?: FormEvent) {
    event?.preventDefault();
    const value = input.trim();
    if (!value || busy) return;
    if (isNew) { await start(value); return; }
    const navigation = navigationRef.current;
    setBusy(true); setError(''); requestRef.current += 1;
    try {
      let current = session;
      if (!current && projectId) {
        current = await api<Session>(`/production/projects/${encodeURIComponent(projectId)}/discuss`, {});
        if (navigation !== navigationRef.current) return;
        applySession(current);
      }
      if (!current) return;
      const artifactContext = contextNode ? {
        title: contextNode.title.slice(0, 200),
        content: [`状态：${contextNode.statusLabel || contextNode.status}`, contextNode.summary, contextNode.content || ''].join('\n\n').slice(0, 12000),
        sources: contextNode.sources.slice(0, 20).map(source => `${source.label}${source.path ? ` · ${source.path}` : ''}`.slice(0, 300)),
      } : undefined;
      const updated = await api<Session>(`/sessions/${current.id}/intervene`, { text: value, artifactContext });
      if (navigation !== navigationRef.current) return;
      applySession(updated); setInput(v => v === value ? '' : v); setContextNode(null); setFollowRequest(value => value + 1); followRef.current = true;
      if (updated.status === 'paused' && current.status !== 'paused' && !imageInFlight) {
        const resumed = await api<Session>(`/sessions/${current.id}/run`, {});
        if (navigation === navigationRef.current) applySession(resumed);
      }
      setToast('新标准已写入简报，画布会随本轮工作更新。');
    } catch (err) { if (navigation === navigationRef.current) setError(err instanceof Error ? err.message : '发送失败，内容已保留。'); }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  function resetNavigation() {
    navigationRef.current += 1; requestRef.current += 1; setBusy(false); setInput(''); setError(''); setContextNode(null); setFocusNodeId(null); followRef.current = true;
  }
  function newProject() { resetNavigation(); setSession(null); setProjectId(null); setSourceProject(null); setBrands(emptyBrands()); setGoal(''); setConstraints([]); setMode('live'); setModal(null); }
  async function openHistory() {
    setModal('history'); setHistoryLoading(true);
    const results = await Promise.allSettled([api<Session[]>('/sessions'), api<ProductionProjectSummary[]>('/production/projects')]);
    if (results[0].status === 'fulfilled') setHistory(results[0].value);
    if (results[1].status === 'fulfilled') setProjects(results[1].value);
    if (results.some(r => r.status === 'rejected')) setError('部分项目未能读取，可以重试。');
    setHistoryLoading(false);
  }
  async function loadProject(id: string) {
    resetNavigation(); setSession(null); setSourceProject(null); setProjectId(id); setModal(null);
    const navigation = navigationRef.current;
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(`collider.discussion.v1.${id}`); } catch { /* optional */ }
    if (!savedId) return;
    setBusy(true);
    try {
      const saved = await api<Session>(`/sessions/${encodeURIComponent(savedId)}`);
      if (navigation === navigationRef.current) { setSession(saved); setMode(saved.mode); }
    } catch { /* Missing archived discussions can be started again. */ }
    finally { if (navigation === navigationRef.current) setBusy(false); }
  }
  function discuss(node?: ProductionNode) { setContextNode(node || null); inputRef.current?.focus(); }
  function focusArtifact(id: string) { setFocusNodeId(null); requestAnimationFrame(() => setFocusNodeId(id)); }
  const initialBrief = <div className="u-setup"><div className="u-welcome-symbol"><Workflow size={25} strokeWidth={1.4} /></div><h2>一起，做一次有意思的联名。</h2><p>告诉我两个品牌。我会组织研究、创作与审查，让每一步的成果出现在画布上。</p><div className="u-brand-inputs">{brands.map((brand, i) => <button key={brand.id} onClick={() => setEditingBrand(brand.id)}><span>{brand.name.slice(0, 1) || (i ? 'B' : 'A')}</span><div><strong>{brand.name || `添加品牌 ${i ? 'B' : 'A'}`}</strong><small>{brand.name ? `${brand.files.length} 份资料 · 点击编辑` : '品牌介绍 / 上传资料'}</small></div><Plus size={15} /></button>)}</div><label className="u-goal-label">这次想一起做什么？<textarea rows={3} value={goal} maxLength={5000} onChange={event => setGoal(event.target.value)} placeholder="例如：围绕年轻人的日常，做一款让双方都有辨识度的联名饮品。" /></label><div className="u-setup-actions"><select aria-label="协作模式" value={mode} onChange={event => setMode(event.target.value as 'live' | 'demo')}><option value="live">AI 实时协作</option><option value="demo">交互演示</option></select><button onClick={() => { setBrands(structuredClone(EXAMPLE_BRANDS)); setGoal('让咖啡与主题阅读形成具体关联，增加周末到店。'); setMode('demo'); }}>填入演示品牌</button></div><button className="u-primary u-start" disabled={busy || !runtime || (mode === 'live' && !runtime.configured)} onClick={() => void start()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}开始联名协作<ArrowRight size={15} /></button><small className="u-setup-note">1 位主控 · 研究、创作、审查按阶段协作</small></div>;

  return <div className="unified-app">
    <header className="u-topbar"><div className="u-logo"><span className="u-logo-mark"><i /><i /><i /></span><strong>碰撞<span>COLLIDER</span></strong></div><div className="u-project-switch"><button onClick={() => void openHistory()}><span>{projectTitle}</span><ChevronDown size={14} /></button><small>{projectId ? '已有项目' : session?.mode === 'demo' ? '交互演示' : '联名创作空间'}</small></div><div className="u-header-actions"><span className={`u-connection ${runtime?.configured ? 'ready' : ''}`}><i />{runtime?.model || '连接中'}</span><button title="项目简报与资料" aria-label="项目简报与资料" onClick={() => setModal('brief')}><FileText size={16} /></button><button title="工作方法" aria-label="工作方法" onClick={() => setModal('skills')}><Settings2 size={16} /></button><button className="u-new" onClick={newProject} disabled={busy}><Plus size={15} /><span>新建</span></button>{session && <a className="u-export" href={`/api/sessions/${session.id}/export`}><ArrowDownToLine size={14} /><span>导出</span></a>}</div></header>
    <div className="u-workspace"><section className="u-canvas-area" aria-label="项目成果画布"><ProductionWorkspace session={session} projectId={projectId} onProjectLoaded={setSourceProject} onDiscuss={discuss} focusNodeId={focusNodeId} followRequest={followRequest} /></section>
      <aside className="u-dialogue" aria-label="多 Agent 协作对话"><div className="u-dialogue-header"><MessageSquare size={17} /><h1>协作对话</h1><span>{running || imageInFlight ? <><i className="u-live-dot" />协作中</> : session ? STATUS[session.status] : projectId ? '成果已同步' : '准备开始'}</span></div><div className="u-agent-team">{Object.entries(ROLE_LABELS).map(([role, label]) => { const Icon = ROLE_ICONS[role as keyof typeof ROLE_ICONS]; return <span key={role} className={activeRole === role && (running || imageInFlight || isNew) ? 'active' : ''} title={role === 'orchestrator' ? '整理简报、分派阶段、汇总结果' : label}><Icon size={12} />{label.replace(' Agent', '')}</span>; })}<button aria-label="显示工作记录" aria-pressed={showSkills} className={showSkills ? 'on' : ''} onClick={() => setShowSkills(!showSkills)}><Workflow size={13} /></button></div>
      {error && <div className="u-error" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={14} /></button></div>}
      <div className="u-chat-scroll" ref={scrollRef} onScroll={event => { const el = event.currentTarget; followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; setShowJump(!followRef.current); }}>
        {isNew ? initialBrief : <div className="u-message-list">
          {sourceProject && <><article className="u-message is-orchestrator"><div className="u-message-head"><span className="u-agent-avatar"><Workflow size={14} /></span><strong>联名总策划</strong><small>项目资料</small></div><div className="u-message-content">已载入 {sourceProject.brandNames.join(' × ')} 的工作成果。画布先展示当前物料，研究、故事和审查记录都保留在对应阶段。你可以点选任一成果，直接在这里继续修改。</div></article><div className="u-record-label"><span />已保存成果<span /></div>{[['research', 'strategy', '品牌研究与方向'], ['creative', 'materials', '产品与效果图'], ['review', 'review', '方案审查']].map(([role, lane, title]) => { const nodes = sourceProject.nodes.filter(n => n.lane === lane && n.status !== 'planned'); const first = nodes.find(n => n.primaryAssetId) || nodes[0]; const Icon = ROLE_ICONS[role as keyof typeof ROLE_ICONS]; return first ? <button className="u-artifact-link" key={lane} onClick={() => focusArtifact(first.id)}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{nodes.length} 项已保存记录 · 在画布查看</small></div><ArrowRight size={14} /></button> : null; })}<p className="u-record-note">以上来自已有项目文件。新的协作发言会接在下面。</p></>}
          {session && <><div className="u-session-label">{session.mode === 'demo' ? '演示流程 · 模板内容' : '本轮协作'}<span>简报 v{session.revision}</span></div>{session.messages.map(message => <DialogueMessage key={message.id} message={message} brands={shownBrands} showSkills={showSkills} onArtifact={focusArtifact} />)}{running && <div className="u-working"><LoaderCircle size={14} className="spin" />{SKILLS.find(skill => skill.id === session.activeSkill)?.name || '主控'}正在推进…</div>}{session.status === 'awaiting_selection' && <div className="u-concepts"><p>方向已整理好，选一个继续深化。</p>{session.concepts.map((concept, i) => <button key={concept.id} disabled={busy} onClick={() => void mutate('select', { conceptId: concept.id })}><small>方向 0{i + 1}</small><strong>{concept.title}</strong><p>{concept.description}</p><span>选定并深化<ArrowRight size={13} /></span></button>)}</div>}{session.status === 'error' && <div className="u-error-block"><p>{session.error || '本轮未完成，已保留进度。'}</p><button className="u-primary" disabled={busy} onClick={() => void mutate('run')}><Play size={13} />重试本轮</button></div>}{session.status === 'completed' && <div className="u-completed"><Check size={15} /><p>本轮方案已保存。继续补充标准，或生成概念视觉。</p>{session.mode === 'live' && !session.proposal?.imageUrl && <button className="u-primary" disabled={busy || imageInFlight} onClick={() => void mutate('image')}><ImageIcon size={14} />{imageInFlight ? '正在生成…' : '生成概念视觉'}</button>}</div>}</>}
        </div>}
      </div>
      {showJump && <button className="u-jump" onClick={() => { followRef.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }}><ArrowDown size={13} />最新进度</button>}
      <div className="u-composer-area">{contextNode && <div className="u-context"><FileText size={12} /><span>正在讨论：{contextNode.title}</span><button aria-label="取消关联成果" onClick={() => setContextNode(null)}><X size={12} /></button></div>}{session && <div className="u-run-controls"><span>简报 v{session.revision} · {session.constraints.length} 条标准</span>{running ? <button disabled={busy} onClick={() => void mutate('pause')}><Pause size={12} />暂停</button> : ['paused', 'idle'].includes(session.status) ? <button disabled={busy} onClick={() => void mutate('run')}><Play size={12} />继续</button> : null}</div>}<form className="u-composer" onSubmit={event => void intervene(event)}><textarea ref={inputRef} aria-label="给联名团队补充标准" value={input} maxLength={1800} rows={2} placeholder={isNew ? '补充合作目标、受众或你想试试的方向…' : '补充标准、调整方向，或聊聊这张图…'} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void intervene(); } }} /><div><button type="button" className="u-attach" title="品牌资料" aria-label="品牌资料" onClick={() => isNew ? setEditingBrand('a') : setModal('brief')}><Plus size={18} /></button><small>交给总策划，协调下一步</small><button className="u-send" aria-label="发送新标准" disabled={!input.trim() || busy || (isNew && !runtime?.configured && mode === 'live')}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}</button></div></form><div className="u-composer-foot"><span>你的新标准会同步到后续工作</span><span>↵ 发送</span></div></div>
      </aside>
    </div>
    {toast && <div className="toast u-toast" role="status"><Check size={15} />{toast}</div>}
    {editingBrand && <BrandEditor brand={brands[editingBrand === 'a' ? 0 : 1]} onClose={() => setEditingBrand(null)} onSave={next => { setBrands(current => current.map(brand => brand.id === next.id ? next : brand) as [Brand, Brand]); setEditingBrand(null); }} />}
    {modal === 'skills' && <Modal title="团队共用的创作方法" wide onClose={() => setModal(null)}><p className="modal-description">总策划维护简报与阶段顺序。研究、创作、审查角色共用项目资料，按当前任务调用以下 Skill。</p><div className="skill-browser"><nav>{SKILLS.map((skill, index) => <button key={skill.id} className={selectedSkill === skill.id ? 'selected' : ''} onClick={() => setSelectedSkill(skill.id)}><span>0{index + 1}</span>{skill.name}<ChevronRight size={14} /></button>)}</nav><section><h3>{SKILLS.find(skill => skill.id === selectedSkill)?.name}</h3><p className="muted">{SKILLS.find(skill => skill.id === selectedSkill)?.description}</p><pre>{runtime?.skills.find(skill => skill.id === selectedSkill)?.content || '正在读取…'}</pre></section></div></Modal>}
    {modal === 'history' && <Modal title="打开项目" onClose={() => setModal(null)}><div className="history-list">{historyLoading ? <div className="loading-state"><LoaderCircle className="spin" />正在读取…</div> : <>{projects.map(project => <button key={project.id} onClick={() => loadProject(project.id)}><div className="history-icon"><ImageIcon size={20} /></div><span><strong>{project.title}</strong><small>{project.assetCount} 个真实文件 · {project.nodeCount} 项成果</small></span><ChevronRight size={15} /></button>)}{history.map(item => <button key={item.id} onClick={() => { resetNavigation(); setProjectId(null); setSourceProject(null); setSession(item); setMode(item.mode); setModal(null); }}><div className="history-icon"><MessageSquare size={20} /></div><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString('zh-CN')} · {item.mode === 'demo' ? '演示' : 'AI 协作'} · {STATUS[item.status]}</small></span><ChevronRight size={15} /></button>)}{!projects.length && !history.length && <p className="loading-state">还没有保存的项目。</p>}</>}</div></Modal>}
    {modal === 'brief' && <Modal title="项目简报与共同资料" onClose={() => setModal(null)}><div className="u-brief"><p>{sourceProject?.summary || session?.goal || goal || '先在右侧添加两个品牌和合作目标。'}</p>{(sourceProject && !session ? sourceProject.brandNames.map((name, i) => ({ id: i ? 'b' : 'a', name, description: '研究报告可在画布的研究与方向阶段查看。', files: [] })) : shownBrands).map(brand => <section key={brand.id}><h3>{brand.name || `品牌 ${brand.id.toUpperCase()}`}</h3><p>{brand.description || '还未添加品牌介绍。'}</p>{brand.files.map(file => <p key={file.name}><FileText size={12} /> {file.name}</p>)}{isNew && <button className="u-primary" onClick={() => { setModal(null); setEditingBrand(brand.id as 'a' | 'b'); }}>编辑品牌资料</button>}</section>)}{(session?.constraints || constraints).length > 0 && <section><h3>当前标准</h3>{(session?.constraints || constraints).map((constraint, i) => <p key={i}>{constraint}</p>)}</section>}<p className="muted">研究成果、选定方向与审查意见均保留在本项目中。运行后可直接在对话中追加或修改标准。</p></div></Modal>}
  </div>;
}
