import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Project, Side } from './model';
import { currentPreview, isPaused, readyToExport, STATUS_LABELS } from './model';
import { projectApi } from './api';
import { Icon } from '../components/Icon';
import { BriefEditor } from './ProjectBrief';
const ColliderProposal = lazy(() => import('../components/ProposalAi').then(module => ({ default: module.ColliderProposal })));
type Step = 'brief' | 'preview' | 'invitation' | 'studio';
const STEPS: [Step, string][] = [['brief', '合作简报'], ['preview', '联名预演'], ['invitation', '邀请与回应'], ['studio', '共创与物料']];

export default function ProjectWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [step, setStep] = useState<Step>('preview');
  const [side, setSide] = useState<Side>('a');
  const [feedback, setFeedback] = useState('');
  const [note, setNote] = useState('');
  const [imageConfigured, setImageConfigured] = useState(false);
  const [historyId, setHistoryId] = useState('');
  const [showBasis, setShowBasis] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [materialView, setMaterialView] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void projectApi<Project>(`/${id}`, undefined, abort.signal).then(setProject).catch(reason => { if (!abort.signal.aborted) setError(reason.message); });
    void projectApi<{ imageConfigured: boolean }>('/status', undefined, abort.signal).then(value => setImageConfigured(value.imageConfigured)).catch(() => undefined);
    return () => { mounted.current = false; abort.abort(); };
  }, [id]);
  const mutate = async (action: string, body: Record<string, unknown>, base = project) => {
    if (!base) throw new Error('项目尚未读取。');
    const result = await projectApi<Project>(`/${id}/${action}`, { ...body, sequence: base.sequence });
    if (mounted.current) { setProject(result); setHistoryId(''); }
    return result;
  };
  const run = async (operation: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await operation(); } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '操作未完成，请重试。'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const refresh = () => void run(async () => setProject(await projectApi<Project>(`/${id}`)));
  if (!project) return <main className="br-project-loading"><p role={error ? 'alert' : 'status'}>{error || '正在打开联名项目…'}</p><button className="br-button" onClick={onBack}>返回项目</button></main>;
  const { brands, invitation } = project;
  const latest = currentPreview(project);
  const preview = project.previews.find(p => p.id === historyId) ?? latest ?? project.previews.at(-1);
  const stale = preview?.revision !== project.revision;
  const draft = invitation.draft;
  const pending = invitation.status === 'pending';
  const accepted = invitation.status === 'accepted';
  const missingVI = Object.values(brands).some(item => item.visual.source === 'unprovided');
  const invite = (action: Record<string, unknown>) => void run(() => mutate('invitation', { action }));
  const downloadPack = () => void run(async () => {
    const data = await projectApi<unknown>(`/${id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${brands.a.brand.name}×${brands.b.brand.name}-V${project.revision}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return <main className="br-project" aria-busy={busy}>
    <div className="br-project-heading"><button className="br-icon-button" onClick={onBack} aria-label="返回联名项目"><Icon name="back" /></button><div><h1>{draft.title}</h1><p>{brands.a.brand.name} × {brands.b.brand.name}<span>·</span>一对一受众互荐</p></div><div className="br-project-action"><span>{STATUS_LABELS[invitation.status]}</span><button className="br-button primary" onClick={() => setStep(accepted ? 'studio' : 'invitation')}>{accepted ? '继续共创' : '预演邀请'}<Icon name="arrow" /></button></div></div>
    <nav className="br-steps" aria-label="合作流程">{STEPS.map(([key, label], i) => <button key={key} aria-current={step === key ? 'step' : undefined} onClick={() => setStep(key)}><span>0{i + 1}</span>{label}{key === 'studio' && !accepted ? <small>建联后</small> : null}</button>)}</nav>
    {error ? <div className="br-notice" role="alert"><p>{error}</p><button onClick={refresh} disabled={busy}>刷新项目</button></div> : null}
    {busy ? <div className="br-loading-line" role="status">正在处理，请稍候。生成期间可以继续查看内容，结果会保存在项目中。</div> : null}
    {step === 'brief' ? <BriefEditor key={`${project.id}-${project.sequence}`} project={project} busy={busy} onSave={body => void run(async () => { const saved = await mutate('brief', body); await mutate('generate', { mode: 'template' }, saved); setStep('preview'); })} /> : null}
    {step === 'preview' ? <>
      <div className="br-workspace"><section className="br-canvas">
        <div className="br-canvas-toolbar"><div className="br-tabs"><button aria-pressed={!materialView} onClick={() => setMaterialView(false)}>双方渠道预演</button><button aria-pressed={materialView} onClick={() => setMaterialView(true)}>物料清单</button></div><label className="br-version"><span className="sr-only">预演版本</span><select value={preview?.id || ''} onChange={e => setHistoryId(e.target.value)}>{project.previews.map(p => <option value={p.id} key={p.id}>V{p.revision} · {p.source === 'ai' ? 'AI 场景' : '模板'}{p.id === latest?.id ? ' · 当前' : ''}</option>)}</select></label></div>
        {stale ? <div className="br-notice"><p>这是旧版预演。当前简报已到 V{project.revision}，请生成新图后再邀请或确认。</p><button disabled={busy || isPaused(project)} onClick={() => void run(() => mutate('generate', { mode: 'template' }))}>生成当前预演</button></div> : null}
        {missingVI ? <div className="br-notice"><p>尚未提供双方完整 VI，目前以中性排版示意。补充原有标识与配色后才可邀请。</p><button onClick={() => setStep('brief')}>补充视觉资料</button></div> : null}
        {materialView ? <MaterialList project={project} /> : <div className="br-posters">{(['a', 'b'] as const).map(s => <figure key={s}>{preview ? <img src={preview[s]} alt={`${brands[s].brand.name}的渠道联名概念预演 V${preview.revision}`} /> : <div className="br-empty">尚无图片，请生成预演。</div>}<figcaption><strong>{brands[s].brand.name}的{project.channel === 'social' ? '社交渠道' : '门店海报'}</strong><span>原有视觉为主 · 伙伴署名露出</span></figcaption></figure>)}</div>}
      </section><aside className="br-project-sidebar"><h2>一次轻量的相互推荐</h2><p>各发一篇主题内容，在彼此的受众中，多一次被看见的机会。</p><section><h3>共同目标</h3><p>{draft.concept}</p></section><section><h3>保持品牌本色</h3>{(['a', 'b'] as const).map(s => <div className="br-brand-swatch" key={s}><i style={{ background: brands[s].visual.accent }} /><span>{brands[s].brand.name}<small>{brands[s].visual.wordmark}</small></span></div>)}</section><section><h3>预演范围</h3><p>✓ 双方各一张传播图<br />✓ 沿用各自标识与配色<br />✓ 保持原有商品与包装</p></section><button className="br-button wide" onClick={() => setStep('brief')}>编辑合作简报</button></aside></div>
      <footer className="br-workspace-footer"><span>{preview?.source === 'ai' ? `AI 场景 + 品牌模板 · ${preview.model}` : '概念模板预演'} · {stale ? '历史版本' : '不是已发布合作'}</span><div>{preview ? <details className="br-download"><summary>导出图片</summary><div>{(['a', 'b'] as const).map(s => <a key={s} href={`${preview[s]}?format=png&download=1`} download>{brands[s].brand.name} · PNG ↗</a>)}</div></details> : null}<button className="br-button" onClick={() => setShowBasis(value => !value)} aria-expanded={showBasis}>查看生成依据</button></div></footer>
      {showBasis ? <section className="br-basis"><h2>预演如何生成</h2><p>合作意向 → 双方品牌快照与 VI → 一份受众互荐简报 → 各自渠道版式 → 叠加伙伴署名 → 保存两张带概念标记的图片。</p><p>模板模式直接排版现有素材，不调用 AI；示例场景照片为预先制作的 AI 素材。AI 场景模式复用 COLLIDER 的图像适配器，生成背景后再叠加固定标识和文案。每次生成均绑定简报版本，改动后须重新生成、重新确认。</p><p>平台 UI 采用 HackVI 单蓝体系；以上品牌色来自虚构档案或你提供的品牌资料。不会用平台蓝覆盖品牌 VI。</p><button className="br-button" disabled={!imageConfigured || busy || missingVI || isPaused(project)} onClick={() => void run(() => mutate('generate', { mode: 'ai' }))}>{imageConfigured ? '用 AI 生成两张场景预演' : 'AI 图像服务尚未配置'}</button><small>AI 模式会把这份简报和所选场景素材发送到已配置的图像服务；生成结果仍需双方复核。</small></section> : null}
    </> : null}
    {step === 'invitation' ? <div className="br-invitation-grid"><section className="br-invitation-summary"><h2>{accepted ? '双方愿意，合作才开始。' : '带着一个看得见的想法，\n认识彼此。'}</h2><p>{brands.a.brand.name} → {brands.b.brand.name} · 邀请 V{invitation.version}</p>{latest ? <div className="br-mini-posters"><img src={latest.a} alt="发起方预演" /><img src={latest.b} alt="接收方预演" /></div> : <p>请先更新预演图片。</p>}<dl><dt>一起做什么</dt><dd>{(invitation.sentDraft ?? draft).concept}</dd><dt>{brands.a.brand.name} 拟提供</dt><dd>{(invitation.sentDraft ?? draft).contribution}</dd><dt>邀请 {brands.b.brand.name} 参与</dt><dd>{(invitation.sentDraft ?? draft).ask}</dd></dl></section><section className="br-response"><h2>{STATUS_LABELS[invitation.status]}</h2><p>本地交互演示 · 不会向任何品牌发送消息</p>{invitation.feedback ? <blockquote><strong>对方反馈</strong><p>{invitation.feedback}</p></blockquote> : null}
      {invitation.status === 'draft' ? <><p>先让对方看到双方渠道中的呈现，再决定是否继续讨论。</p><button className="br-button primary wide" disabled={busy || !latest || missingVI} onClick={() => invite({ type: 'send', actor: 'sender' })}>提交预演邀请（演示）<Icon name="arrow" /></button>{!latest || missingVI ? <p>请先补充 VI 并更新预演。</p> : null}</> : null}
      {pending ? <><div className="br-perspective" role="group" aria-label="邀请演示视角"><button aria-pressed={side === 'a'} onClick={() => setSide('a')}>发起方</button><button aria-pressed={side === 'b'} onClick={() => setSide('b')}>接收方</button></div>{side === 'a' ? <><h3>等一个独立的回应。</h3><p>切换接收方视角，可以演示接受、提出调整或暂不参与。</p><button className="br-button wide" onClick={() => setSide('b')}>预演对方如何查看</button><button className="br-text-button" disabled={busy} onClick={() => invite({ type: 'withdraw', actor: 'sender' })}>撤回邀请</button></> : <><label>你希望怎样合作？<textarea value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={2000} rows={5} placeholder="例如：希望先用已有照片，发一篇书单互荐，时间一起确认。" /></label><button className="br-button primary wide" disabled={busy} onClick={() => invite({ type: 'respond', actor: 'recipient', response: 'accepted', feedback })}>同意继续沟通<Icon name="arrow" /></button><div className="br-response-buttons"><button className="br-button" disabled={busy || !feedback.trim()} onClick={() => invite({ type: 'respond', actor: 'recipient', response: 'revision', feedback })}>希望调整</button><button className="br-button" disabled={busy} onClick={() => invite({ type: 'respond', actor: 'recipient', response: 'declined', feedback })}>暂不参与</button></div></>}</> : null}
      {accepted ? <><p>已确认继续沟通的意向。双方现在可以调整内容、核对视觉、分别确认当前物料。</p><button className="br-button primary wide" onClick={() => setStep('studio')}>进入共创与物料<Icon name="arrow" /></button></> : null}
      {isPaused(project) ? <><p>原有图片与邀请记录会保留。准备新版本后可以重新调整，再次发起邀请。</p><button className="br-button wide" disabled={busy} onClick={() => invite({ type: 'revise', actor: 'sender' })}>准备新版本</button></> : null}
      <p className="br-fine-print">同意建联代表愿意继续沟通。具体排期、授权和发布需另行确认。</p></section></div> : null}
    {step === 'studio' ? !accepted ? <section className="br-locked"><Icon name="orbit" /><h2>等双方愿意，再一起往下走。</h2><p>单方可以准备预演，双方同意建联后解锁共创和物料确认。</p><button className="br-button primary" onClick={() => setStep('invitation')}>查看邀请状态<Icon name="arrow" /></button></section> : <div className="br-studio-grid"><section><h2>把想法，落到每一张图。</h2><p className="br-section-intro">当前简报 V{project.revision} · 修改内容或重新生成图片后，双方需要再次确认。</p><MaterialList project={project} /><div className="br-approval-grid">{(['a', 'b'] as const).map(s => <section key={s}><strong>{brands[s].brand.name}</strong><p>{project.approvals[s] ? '✓ 已确认当前版本（演示）' : '等待确认本方及伙伴露出'}</p><button className="br-button" disabled={busy || !latest || project.approvals[s]} onClick={() => void run(() => mutate('approve', { side: s }))}>{project.approvals[s] ? '已确认' : `模拟 ${brands[s].brand.name} 确认`}</button></section>)}</div><div className="br-delivery"><div><h3>{readyToExport(project) ? '演示物料包已就绪' : '物料仍在共同确认中'}</h3><p>{readyToExport(project) ? '含双方图片链接、简报、版本和确认记录。' : '双方确认当前图片后，物料包会记录共同确认状态。'}</p></div><button className="br-button primary" onClick={downloadPack} disabled={busy}>{readyToExport(project) ? '导出物料记录包' : '导出待确认提案包'}<Icon name="arrow" /></button></div><button className="br-text-button" onClick={() => setStep('brief')}>调整合作简报与物料 →</button><button className="br-text-button" onClick={() => setShowAI(value => !value)} aria-expanded={showAI}>COLLIDER · 深化合作提案 {showAI ? '−' : '+'}</button>{showAI ? <Suspense fallback={<p>正在打开提案工具…</p>}><ColliderProposal home={brands.a.brand} partner={brands.b.brand} draft={draft} onApply={next => void run(async () => { await mutate('brief', { draft: { ...draft, ...next }, headlines: project.headlines, channel: project.channel, visuals: { a: brands.a.visual, b: brands.b.visual } }); setStep('brief'); })} /></Suspense> : null}</section><aside className="br-discussion"><h2>共同讨论</h2><p>在同一个项目里，保留彼此的想法。</p><div className="br-thread">{project.notes.length ? project.notes.map(item => <article key={item.id}><strong>{brands[item.side].brand.name}<small>演示</small></strong><p>{item.text}</p><time>{new Date(item.createdAt).toLocaleString('zh-CN')}</time></article>) : <p>从一次具体的反馈开始。比如哪一张图最像自己的品牌。</p>}</div><form onSubmit={e => { e.preventDefault(); void run(async () => { await mutate('note', { side, text: note }); setNote(''); }); }}><label>演示发言方<select value={side} onChange={e => setSide(e.target.value as Side)}><option value="a">{brands.a.brand.name}</option><option value="b">{brands.b.brand.name}</option></select></label><label><span className="sr-only">共创想法</span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={4} placeholder="写下具体的调整建议…" /></label><button className="br-button wide" disabled={!note.trim() || busy}>记录想法<Icon name="arrow" /></button></form></aside></div> : null}
  </main>;
}

function MaterialList({ project }: { project: Project }) {
  const preview = currentPreview(project);
  return <div className="br-material-list"><div className="br-material-head"><span>物料 / 归属渠道</span><span>规格与状态</span><span>文件</span></div>{(['a', 'b'] as const).map(side => <div className="br-material-row" key={side}><div>{preview ? <img src={preview[side]} alt="" /> : null}<span><strong>{project.brands[side].brand.name} · 伙伴推荐图</strong><small>{project.channel === 'social' ? '品牌社交渠道' : '门店展示位'} · V{project.revision}</small></span></div><p>{project.channel === 'social' ? '900 × 1200' : '900 × 1272'}<small>{!preview ? '等待更新预演' : project.approvals[side] ? '已确认（演示）' : '待品牌确认'}</small></p>{preview ? <a href={`${preview[side]}?format=png&download=1`} download>PNG ↗</a> : <span>—</span>}</div>)}<p className="br-fine-print">保留概念标记；曝光效果通过试投放后的阅读、收藏与品牌访问观察，未预设效果数字。</p></div>;
}
