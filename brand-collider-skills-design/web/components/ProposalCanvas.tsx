import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, FileText, LoaderCircle, X } from 'lucide-react';
import { SKILLS, type Session, type SkillId } from '../../src/collider-types';
import '../proposal-cards.css';

export type ProposalCanvasProps = {
  session: Session | null;
  onSelect: (id: string) => void;
  onExport: () => void;
  busy: boolean;
  onBack: () => void;
};

type CardPoint = { label: string; content: string };
type CanvasCard = { skill: SkillId; title: string; summary: string; points: CardPoint[]; original: string; structured: boolean };
const EDITIONS = ['THE BRANDS', 'THE BIG IDEA', 'THE EXPERIENCE', 'THE VOICE', 'THE VISUAL', 'THE CHECK'] as const;

function plainText(value: string): string {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '').trim();
}

function excerpt(value: string, length: number): string {
  const text = plainText(value).replace(/\s+/g, ' ');
  return text.length <= length ? text : `${text.slice(0, length).trimEnd()}…`;
}

function previewPoints(card: CanvasCard): CardPoint[] {
  if (card.skill === 'brand-profile') {
    const a = card.points.filter(point => /^A\s*[·:：]/.test(point.label));
    const b = card.points.filter(point => /^B\s*[·:：]/.test(point.label));
    if (a.length && b.length) return [a[0], b[0], a[1], b[1]].filter((point): point is CardPoint => Boolean(point));
  }
  return card.points.slice(0, 4);
}

// Older sessions only have section text. These are excerpts of that saved output,
// not a second model pass or newly invented card copy.
function fallbackCard(skill: SkillId, name: string, original: string): CanvasCard {
  const paragraphs = original.split(/\n\s*\n/).map(plainText).filter(value => value && !/^[-*_]+$/.test(value));
  const meaningful = paragraphs.filter(value => value.length > 12);
  const summary = excerpt(meaningful[0] || paragraphs[0] || '', 135);
  const points = meaningful.slice(1, 4).map((value, index) => {
    const lines = value.split('\n').filter(Boolean);
    return lines.length > 1 && lines[0].length <= 28
      ? { label: lines[0], content: excerpt(lines.slice(1).join(' '), 150) }
      : { label: `内容摘录 ${String(index + 1).padStart(2, '0')}`, content: excerpt(value, 150) };
  });
  return { skill, title: name, summary, points, original, structured: false };
}

function inlineText(value: string) {
  // Render only text and emphasis. Model-supplied HTML, links and image tags never execute.
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function SourceText({ content }: { content: string }) {
  const lines = content.split('\n');
  return <div className="proposal-source-text">{lines.map((line, index) => {
    if (!line.trim()) return <div className="proposal-source-text__space" key={index} />;
    if (/^\s*[-*_]{3,}\s*$/.test(line)) return <hr key={index} />;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) return <h4 key={index}>{inlineText(heading[1])}</h4>;
    const bullet = line.match(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)(.+)$/);
    if (bullet) return <p className="proposal-source-text__bullet" key={index}>{inlineText(bullet[1])}</p>;
    return <p key={index}>{inlineText(line)}</p>;
  })}</div>;
}

function CardReader({ card, session, onClose }: { card: CanvasCard; session: Session; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const skill = SKILLS.find(item => item.id === card.skill)!;
  return <dialog ref={ref} className="proposal-reader" aria-labelledby="proposal-reader-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="proposal-reader__header">
      <div><span>{skill.name} · V{session.revision}</span><h3 id="proposal-reader-title">{card.title}</h3></div>
      <button type="button" aria-label="关闭完整内容" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="proposal-reader__body">
      {card.structured && <details className="proposal-reader__card-detail"><summary>查看完整卡片摘要与 {card.points.length} 个要点<ChevronDown size={14} /></summary><p>{card.summary}</p><dl>{card.points.map((point, index) => <div key={index}><dt>{plainText(point.label)}</dt><dd>{plainText(point.content)}</dd></div>)}</dl></details>}
      <div className="proposal-reader__source"><FileText size={14} /><span>原始 Skill 产出</span><code>{card.skill}</code></div>
      <SourceText content={card.original || '这一板块还在生成中。'} />
      {card.skill === 'visual-production' && session.proposal?.imagePrompt && <details className="proposal-reader__prompt"><summary>查看完整视觉提示词<ChevronDown size={14} /></summary><SourceText content={session.proposal.imagePrompt} /></details>}
    </div>
    <footer>来自本次品牌协作的已保存内容 · {session.mode === 'live' ? session.model || '历史模型未记录' : '流程演示'}</footer>
  </dialog>;
}

export function ProposalCanvas({ session, onSelect, onExport, busy, onBack }: ProposalCanvasProps) {
  const [reading, setReading] = useState<SkillId | null>(null);
  const proposal = session?.proposal;
  const concepts = session?.concepts ?? [];
  const selected = concepts.find(concept => concept.id === session?.selectedConceptId);
  const running = session?.status === 'running';
  const canSelect = !busy && (session?.status === 'awaiting_selection' || session?.status === 'completed');
  const cards: CanvasCard[] = SKILLS.map(skill => {
    const source = proposal?.sections.filter(section => section.skill === skill.id).map(section => section.content).join('\n\n---\n\n') || '';
    const card = proposal?.cards?.find(item => item.skill === skill.id);
    return card ? { ...card, original: source, structured: true } : fallbackCard(skill.id, skill.name, source);
  });
  const activeCard = reading ? cards.find(card => card.skill === reading) : null;
  const availableCards = cards.filter(card => card.original || card.summary).length;

  if (!session) return <section className="proposal-canvas proposal-canvas--empty">
    <span className="proposal-canvas__eyebrow">THE NEXT COLLABORATION</span>
    <div className="proposal-canvas__empty-mark" aria-hidden="true">A<span>×</span>B</div>
    <h2>下一次联名，<br />从一次对话开始。</h2>
    <p>添加两个品牌的资料，让双方 Agent 一起打磨想法。<br />六个板块会在这里，逐步形成一份完整方案。</p>
    <button type="button" className="proposal-canvas__button" onClick={onBack}>回到品牌对话<ArrowUpRight size={15} /></button>
  </section>;

  return <section className="proposal-canvas" aria-label="联名方案卡片画布">
    <div className="proposal-canvas__utility">
      <button type="button" onClick={onBack}><ArrowLeft size={13} />品牌对话</button>
      <span>{session.mode === 'live' ? 'MODEL COLLABORATION' : 'WORKFLOW DEMO'}<i />V{session.revision}</span>
      <button type="button" onClick={onExport} disabled={busy || (!proposal && !concepts.length)}><ArrowDownToLine size={14} />导出方案</button>
    </div>

    <header className="proposal-canvas__hero">
      <div className="proposal-canvas__hero-top"><span>COLLABORATION / EDITION {String(session.revision).padStart(2, '0')}</span><span className="proposal-canvas__hero-status">{running && <LoaderCircle size={12} className="proposal-canvas__spinner" />}{session.status === 'completed' ? '本轮方案已完成' : session.status === 'awaiting_selection' ? '等待你选择方向' : running ? '方案持续生长中' : session.status === 'paused' ? '协作已暂停' : session.status === 'error' ? '协作需要处理' : '等待品牌开始协作'}</span></div>
      <div className="proposal-canvas__hero-main">
        <div className="proposal-canvas__hero-copy">
          <div className="proposal-canvas__brands"><span>{session.brands[0].name}</span><b>×</b><span>{session.brands[1].name}</span></div>
          <h2>{selected?.title || '让两个品牌，\n长出一个新想法。'}</h2>
          <p>{selected?.tagline || session.goal}</p>
        </div>
        <div className="proposal-canvas__hero-emblem" aria-hidden="true"><span>共</span><span>创</span><i>✳</i></div>
      </div>
      {selected && <details className="proposal-canvas__hero-summary"><summary>展开联名机制与消费者价值<ChevronDown size={12} /></summary><p>{proposal?.summary || selected.description}</p></details>}
      <div className="proposal-canvas__hero-footer"><span>{session.mode === 'live' ? session.model || '历史会话 · 模型未记录' : '演示模式 · 非实时生成'}</span><span>{availableCards} / 06 个方案板块</span></div>
    </header>

    {concepts.length > 0 && !selected && <section className="proposal-canvas__directions" aria-labelledby="proposal-directions-heading">
      <div className="proposal-canvas__section-label"><span>CHOOSE A DIRECTION</span><span>01 — 03</span></div>
      <h3 id="proposal-directions-heading">三个想法，选一个继续。</h3>
      <p>双方已完成第一轮碰撞。选择一个方向，继续展开设计、文案与视觉计划。</p>
      <div className="proposal-canvas__direction-grid">{concepts.map((concept, index) => <article className="proposal-direction" key={concept.id}>
        <div className="proposal-direction__index">0{index + 1}<ArrowUpRight size={22} /></div>
        <h4>{concept.title}</h4><p className="proposal-direction__tagline">{concept.tagline}</p><p className="proposal-direction__description">{concept.description}</p>
        <dl><div><dt>{session.brands[0].name}</dt><dd>{concept.contributionA}</dd></div><div><dt>{session.brands[1].name}</dt><dd>{concept.contributionB}</dd></div>{concept.consumerValue && <div><dt>消费者获得</dt><dd>{concept.consumerValue}</dd></div>}</dl>
        <button type="button" onClick={() => onSelect(concept.id)} disabled={!canSelect}>选择这个方向<ArrowUpRight size={15} /></button>
      </article>)}</div>
    </section>}

    {(selected || !concepts.length) && <>
      <div className="proposal-canvas__collection-heading"><div><span className="proposal-canvas__eyebrow">ONE IDEA, SIX CHAPTERS</span><h3>把想法，一张张展开。</h3></div><span>{String(availableCards).padStart(2, '0')} / 06</span></div>
      <div className="proposal-canvas__grid">{cards.map((card, index) => {
        const skill = SKILLS[index];
        const hasContent = !!(card.summary || card.original);
        const complete = session.completedSkills.includes(skill.id);
        const active = session.activeSkill === skill.id && running;
        return <article className={`proposal-card proposal-card--${index + 1}${!hasContent ? ' proposal-card--waiting' : ''}`} key={skill.id} aria-label={`${skill.name}方案卡片`}>
          <div className="proposal-card__topline"><span>{EDITIONS[index]}</span><span>{hasContent ? card.structured ? '协作提炼' : '原文摘录' : active ? '正在生成' : '待展开'}</span></div>
          <div className="proposal-card__heading"><div><span className="proposal-card__skill-name">{skill.name}</span><h4>{hasContent ? card.title : skill.name}</h4></div><span className="proposal-card__number">0{index + 1}</span></div>
          {hasContent ? <>
            <p className="proposal-card__summary">{excerpt(card.summary || card.original, 180)}</p>
            {card.skill === 'visual-production' && proposal?.imageUrl && <a className="proposal-card__image" href={proposal.imageUrl} target="_blank" rel="noreferrer"><img src={proposal.imageUrl} alt={`${proposal.title}的已生成概念视觉`} /><span>打开概念视觉<ArrowUpRight size={12} /></span></a>}
            {card.skill === 'visual-production' && !proposal?.imageUrl && <div className="proposal-card__visual-label"><span>VISUAL DIRECTION</span><span>视觉计划 · 待出图</span></div>}
            {card.points.length > 0 && <dl className="proposal-card__points">{previewPoints(card).map((point, pointIndex) => <div key={`${pointIndex}-${point.label}`}><dt>{plainText(point.label)}</dt><dd>{plainText(point.content)}</dd></div>)}</dl>}
          </> : <div className="proposal-card__placeholder"><span aria-hidden="true">{active ? <LoaderCircle className="proposal-canvas__spinner" size={23} strokeWidth={1.3} /> : '✳'}</span><p>{skill.description}</p><small>{active ? '品牌 Agent 正在调用这个 Skill' : selected ? '随协作进度更新' : '完成对话并选定方向后展开'}</small></div>}
          <div className="proposal-card__footer"><span>{complete ? <><Check size={11} />已完成</> : hasContent ? '阶段产出' : '等待协作'}</span><button type="button" onClick={() => setReading(skill.id)} disabled={!card.original}>展开原文<ArrowUpRight size={14} /></button></div>
        </article>;
      })}</div>
    </>}

    {proposal && <>
      <div className={`proposal-canvas__review-note${proposal.reviewStatus === 'needs_revision' ? ' needs-revision' : ''}`}><span>REVIEW NOTE</span><p>{proposal.reviewStatus === 'passed' ? '本轮方案审查已完成。落地前仍需确认双方资源与执行安排。' : proposal.reviewStatus === 'needs_revision' ? '方案审查标记了待完善内容。请打开「方案审查」卡片查看，再回到对话中补充新标准。' : '请在「方案审查」中核对执行条件；视觉计划不代表图像已经生成或通过人工审核。'}</p></div>
      {proposal.pendingConfirmations.length > 0 && <details className="proposal-canvas__pending"><summary><span>落地之前，还需要确认</span><span>{String(proposal.pendingConfirmations.length).padStart(2, '0')} 项<ChevronDown size={15} /></span></summary><ol>{proposal.pendingConfirmations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol></details>}
    </>}
    {selected && concepts.length > 1 && <details className="proposal-canvas__alternatives"><summary>回看其他创意方向<ChevronDown size={14} /></summary><div>{concepts.map(concept => <article key={concept.id}><h4>{concept.title}{concept.id === selected.id && <span>当前方向</span>}</h4><p>{concept.description}</p>{concept.id !== selected.id && <button type="button" onClick={() => onSelect(concept.id)} disabled={!canSelect}>改用这个方向<ArrowUpRight size={13} /></button>}</article>)}</div></details>}
    <footer className="proposal-canvas__colophon"><span>BRAND COLLIDER</span><p>每一个想法，都能回到对话中继续生长。</p><button type="button" onClick={onBack}>补充新的标准<ArrowUpRight size={13} /></button></footer>
    {activeCard && <CardReader key={`${session.id}-${session.revision}-${activeCard.skill}`} card={activeCard} session={session} onClose={() => setReading(null)} />}
  </section>;
}
