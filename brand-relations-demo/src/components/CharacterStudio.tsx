import { useEffect, useRef, useState } from 'react';
import type { Brand } from '../domain/types';
import type { CharacterRecipe, CompanyBrief, PartId } from '../domain/characterRecipe';
import { candidateBrand, createLocalCandidates, PARTS, partSize, SILHOUETTES, validateBrief, validateCandidates } from '../engines/characterGenome';
import { describeBrandCharacter } from '../engines/character';
import { BrandCharacter } from './BrandCharacter';
import { CapabilityIcon } from './CapabilityIcon';
import './studio.css';

const EXAMPLE: CompanyBrief = { name: '苔屿 Moss Isle', category: '可持续材料与生活用品工作室', offers: '我们提供产品设计、材料研发、原型制作和小批量制造。团队也负责内容制作，记录材料的来源与工艺。', needs: '寻找渠道分销、社群运营和零售空间合作伙伴。', identity: '自然、好奇、温暖。喜欢苔绿、陶土与安静的几何形态。' };
const EMPTY: CompanyBrief = { name: '', category: '', offers: '', needs: '', identity: '' };
export function CharacterStudio({ initial, onClose, onApply }: {
  initial?: Brand; onClose: () => void; onApply: (brief: CompanyBrief, recipe: CharacterRecipe) => string | undefined;
}) {
  const [brief, setBrief] = useState<CompanyBrief>(initial ? { name: initial.name, category: initial.category, offers: initial.offers, needs: initial.needs, identity: initial.identity } : EMPTY);
  const [candidates, setCandidates] = useState<CharacterRecipe[]>([]);
  const [selected, setSelected] = useState(0);
  const [highlight, setHighlight] = useState<PartId>('head');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [variation, setVariation] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const node = dialog.current;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node?.showModal();
    const controller = new AbortController();
    fetch('/api/character/status', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); }).then(data => setAvailable(data.available === true))
      .catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => { controller.abort(); pending.current?.abort(); node?.close(); document.body.style.overflow = overflow; focus?.focus(); };
  }, []);
  const update = (key: keyof CompanyBrief, value: string) => {
    setBrief(previous => ({ ...previous, [key]: value })); setCandidates([]); setError('');
  };
  const revealResults = () => requestAnimationFrame(() => {
    results.current?.focus({ preventScroll: true });
    if (window.innerWidth <= 760) results.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  const generate = async (source: 'ai' | 'local') => {
    if (!form.current?.reportValidity()) return;
    setError('');
    let input: CompanyBrief;
    try { input = validateBrief(brief); } catch (error) { setError((error as Error).message); return; }
    if (source === 'local') {
      setBrief(input); setCandidates(createLocalCandidates(input, variation)); setVariation(value => value + 1); setSelected(0);
      revealResults();
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const res = await fetch('/api/character/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成暂时失败，请重试。');
      const next = validateCandidates(data.candidates, input);
      if (controller.signal.aborted) return;
      setBrief(input); setCandidates(next); setSelected(0);
      revealResults();
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : '生成超时，请重试。');
    } finally { if (pending.current === controller) { setBusy(false); pending.current = null; } }
  };
  const chosen = candidates[selected];
  const current = chosen ? candidateBrand(brief, chosen) : undefined;
  const capabilities = current ? describeBrandCharacter(current).capabilities : [];
  const activePart = chosen?.parts.find(part => part.id === highlight);
  const partDefinition = PARTS.find(part => part.id === highlight)!;
  return <dialog className="character-studio" ref={dialog} aria-labelledby="studio-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="studio-header"><div><p className="mono">品牌角色 STUDIO</p><h1 id="studio-title">让品牌，长成自己的样子。</h1><p>从公司资料出发，找到属于你的轮廓。</p></div><button className="atlas-close" aria-label="关闭形象工作室" onClick={onClose}>←</button></header>
    <ol className="studio-steps"><li><span>01</span>填写公司资料</li><li className={candidates.length ? 'step-active' : ''}><span>02</span>选择候选形象</li><li><span>03</span>带入关系场</li></ol>
    <div className="studio-layout">
      <form className="studio-form" ref={form} onSubmit={event => { event.preventDefault(); void generate('ai'); }}>
        <fieldset disabled={busy}>
          <div className="studio-form-heading"><h2>关于你的公司</h2><button type="button" onClick={() => { setBrief(EXAMPLE); setCandidates([]); setError(''); }}>填入示例 ↗</button></div>
          <label>公司名称 <span>必填</span><input value={brief.name} required maxLength={80} placeholder="例如：苔屿 Moss Isle" onChange={event => update('name', event.target.value)} /></label>
          <label>公司定位<input value={brief.category} maxLength={3000} placeholder="用一句话介绍你们" onChange={event => update('category', event.target.value)} /></label>
          <label>已有能力 <span>必填 · 决定部件比例</span><textarea value={brief.offers} required minLength={8} maxLength={3000} rows={4} placeholder="你们擅长什么？提供哪些产品、服务或资源？可附项目经验。" onChange={event => update('offers', event.target.value)} /></label>
          <label>希望寻找的合作<textarea value={brief.needs} maxLength={3000} rows={2} placeholder="你们希望合作伙伴带来什么？" onChange={event => update('needs', event.target.value)} /></label>
          <label>品牌气质与偏好<textarea value={brief.identity} maxLength={3000} rows={2} placeholder="例如：温暖、实验性、自然；喜欢苔绿和陶土色" onChange={event => update('identity', event.target.value)} /></label>
          <p className="studio-service" role="status"><i className={available ? 'connected' : ''} />{available === null ? '正在检查 AI 连接…' : available ? 'AI 已连接 · 生成时将公司资料发送给 OpenAI' : 'AI 尚未连接 · 目前可使用本地规则预览'}</p>
          <button className="primary-button" type="submit" disabled={available !== true || busy}>{busy ? '正在理解品牌与设计形象…' : '✦ AI 生成 3 个候选'}<span>↗</span></button>
          <button className="studio-local-button" type="button" onClick={() => void generate('local')}>{candidates.length ? '重新生成本地候选' : '本地预览 3 个形象'}</button>
          <p className="studio-helper">候选共享能力比例。画风、配色与纹样各不相同。</p>
        </fieldset>
        {busy ? <button type="button" className="studio-local-button" onClick={() => { pending.current?.abort(); setBusy(false); }}>取消本次生成</button> : null}
        {error ? <p className="studio-error" role="alert">{error}</p> : null}
      </form>
      <div className="studio-results" ref={results} tabIndex={-1} aria-label="形象候选与部件说明" aria-busy={busy}>
        {chosen && current ? <>
          <div className="studio-results-heading"><div><p className="mono">品牌的多种表达</p><h2>同一个品牌，三种表达。</h2></div><span className="studio-source">{chosen.source === 'ai' ? 'AI 生成' : '本地规则预览 · 非 AI'}</span></div>
          <div className="studio-candidates" role="radiogroup" aria-label="选择品牌形象">
            {candidates.map((candidate, index) => <label className={`studio-candidate ${index === selected ? 'candidate-selected' : ''}`} key={`${candidate.signature}-${index}`}>
              <input type="radio" name="character-choice" checked={index === selected} onChange={() => setSelected(index)} aria-label={candidate.name} />
              <span className="candidate-number mono">0{index+1}<span>{index === selected ? '✓ 已选择' : '选择这个'}</span></span>
              <span className="candidate-portrait"><BrandCharacter brand={candidateBrand(brief, candidate)} labelled /></span>
              <strong>{candidate.name}</strong><small>{SILHOUETTES.find(shape => shape.id === candidate.silhouette)?.description}</small>
            </label>)}
          </div>
          <div className="studio-capabilities">{capabilities.length ? capabilities.map(cap => <span key={cap.id}><CapabilityIcon id={cap.id} />{cap.label}</span>) : <span>暂未识别到明确能力，请补充资料，或连接 AI 后重新理解。</span>}</div>
          <section className="studio-anatomy"><div className="studio-anatomy-title"><h3>六个部件，来自你的信息</h3><span>点击查看依据</span></div>
            <div className="studio-anatomy-content"><div className="anatomy-portrait" data-highlight={highlight}><BrandCharacter brand={current} labelled /><span className="mono">ID {chosen.signature.toString(16).toUpperCase().padStart(8,'0')}</span></div>
              <div className="studio-parts">{PARTS.map(part => {
                const parameter = chosen.parts.find(value => value.id === part.id)!;
                return <button key={part.id} type="button" aria-pressed={highlight === part.id} onClick={() => setHighlight(part.id)} className="studio-part"><CapabilityIcon id={part.icon} /><span><strong>{part.label}</strong><small>{part.meaning}</small></span><span className="part-meter"><i style={{ width: `${25+parameter.emphasis*75}%` }} /></span><b>{parameter.emphasis ? `${partSize(chosen, part.id)}` : '基础'}</b></button>;
              })}</div></div>
            <div className="studio-evidence" aria-live="polite"><strong>{partDefinition.label} · {partDefinition.measure} {partSize(chosen, highlight)} 单位</strong><p>{activePart?.evidence ? `来自已有能力：“${activePart.evidence}”` : '资料中尚未提及对应能力，保留基础造型。'}</p></div>
            <p className="studio-helper">大小表达资料中的能力侧重，并非能力评分。基础尺寸不代表能力弱。</p>
          </section>
          <footer className="studio-apply"><div><strong>{brief.name}</strong><span>选择将保存在此浏览器，并应用到关系场、图鉴和抽卡。</span></div><button type="button" className="primary-button" disabled={busy} onClick={() => { const message = onApply(brief, chosen); if (message) setError(message); }}>使用这个形象 <span>→</span></button></footer>
        </> : <div className="studio-empty"><div className="studio-empty-portraits">{createLocalCandidates(EXAMPLE).map(recipe => <BrandCharacter key={recipe.silhouette} brand={candidateBrand(EXAMPLE, recipe)} />)}</div><p className="mono">六个部件，独特的角色。</p><h2>能力决定比例。<br />个性决定表达。</h2><p>填入公司信息，生成 3 个可以选择的形象。<br />每个部件都能追溯到你的能力描述。</p><div className="studio-empty-key">{PARTS.map(part => <span key={part.id}><CapabilityIcon id={part.icon} />{part.meaning}</span>)}</div><span className="studio-preview-caption">示意角色 · 尚未生成你的公司形象</span></div>}
      </div>
    </div>
  </dialog>;
}
