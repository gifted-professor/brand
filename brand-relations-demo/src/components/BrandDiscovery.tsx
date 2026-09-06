import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Brand, RelationResult } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { describeBrandCharacter } from '../engines/character';
import { Icon } from './Icon';
import './discovery.css';

type Mode = 'tarot' | 'pack' | 'comet';
type Phase = 'idle' | 'opening' | 'choosing' | 'drawing' | 'revealed';
const MODES: { id: Mode; label: string; description: string }[] = [
  { id: 'tarot', label: '翻牌', description: '安静探索新的伙伴。' },
  { id: 'pack', label: '卡包', description: '打开新的合作可能。' },
  { id: 'comet', label: '流星', description: '沿着连接探索品牌世界。' },
];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function CardBack() {
  return <span className="discovery-card-back" aria-hidden="true">
    <span className="card-corner top">B / G</span>
    <svg className="card-constellation" viewBox="0 0 180 240" fill="none">
      <ellipse cx="90" cy="120" rx="60" ry="29" transform="rotate(-45 90 120)" />
      <ellipse cx="90" cy="120" rx="60" ry="29" transform="rotate(45 90 120)" />
      <circle cx="90" cy="120" r="43" /><circle cx="90" cy="120" r="17" />
      <path d="M90 38v25m0 114v25M30 120H15m135 0h15M90 82v76m-38-38h76" />
      <path d="m90 98 6 16 16 6-16 6-6 16-6-16-16-6 16-6Z" fill="currentColor" stroke="none" />
      <circle cx="47" cy="78" r="3" fill="currentColor" /><circle cx="133" cy="162" r="3" fill="currentColor" />
    </svg>
    <span className="card-corner bottom">探索合作可能</span>
  </span>;
}

export function BrandDiscovery({ brands, relations, focus, onClose, onExplore }: {
  brands: readonly Brand[]; relations: readonly RelationResult[]; focus: Brand;
  onClose: () => void; onExplore: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const exploreRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>('tarot');
  const [round, setRound] = useState(0);
  const [draw, setDraw] = useState<{ phase: Phase; index: number | null }>({ phase: 'choosing', index: null });
  const candidates = useMemo(() => {
    const byId = new Map(brands.map(brand => [brand.id, brand]));
    return [...relations].sort((a, b) => b.collaborationFit - a.collaborationFit || a.targetBrandId.localeCompare(b.targetBrandId))
      .flatMap(relation => {
        const brand = byId.get(relation.targetBrandId);
        return brand && brand.id !== focus.id ? [{ brand, relation }] : [];
      });
  }, [brands, relations, focus.id]);
  const deck = useMemo(() => Array.from({ length: Math.min(5, candidates.length) }, (_, index) => candidates[(round * 5 + index) % candidates.length]), [candidates, round]);
  const chosen = draw.index === null ? undefined : deck[draw.index];
  const busy = draw.phase === 'drawing' || draw.phase === 'opening';
  const revealed = draw.phase === 'revealed';

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const duration = reduceMotion() ? 0 : draw.phase === 'opening' ? 650 : mode === 'comet' ? 1850 : 1350;
    const timer = window.setTimeout(() => setDraw(previous => ({ ...previous, phase: previous.phase === 'opening' ? 'choosing' : 'revealed' })), duration);
    return () => window.clearTimeout(timer);
  }, [busy, draw.phase, mode]);

  useEffect(() => { if (revealed) exploreRef.current?.focus(); }, [revealed]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setDraw({ phase: next === 'tarot' ? 'choosing' : 'idle', index: null });
  };
  const choose = (index: number) => {
    if (busy || revealed || !deck[index]) return;
    setDraw({ phase: reduceMotion() ? 'revealed' : 'drawing', index });
  };
  const again = () => { setRound(value => value + 1); changeMode(mode); };
  const selectedMode = MODES.find(item => item.id === mode)!;

  return <dialog ref={dialogRef} className="discovery-dialog" aria-labelledby="discovery-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <article className={`discovery-panel mode-${mode} phase-${draw.phase}`}>
      <header className="discovery-header">
        <span className="discovery-eyebrow"><Icon name="orbit" /> 品牌连接</span>
        <button className="discovery-close" aria-label="返回匹配" onClick={onClose}>←</button>
      </header>
      <div className="discovery-heading">
        <p className="discovery-kicker">为 {focus.name} 发现新视角</p>
        <h1 id="discovery-title">让新的可能找到你。</h1>
        <p>{selectedMode.description}</p>
      </div>
      <div className="discovery-modes" role="group" aria-label="抽卡动画风格">
        {MODES.map(item => <button key={item.id} aria-pressed={mode === item.id} disabled={busy} onClick={() => changeMode(item.id)}>{item.label}</button>)}
      </div>
      <div className="discovery-stage" data-testid="discovery-stage" data-phase={draw.phase} data-mode={mode}>
        <div className="stage-orbit stage-orbit-outer" aria-hidden="true" /><div className="stage-orbit stage-orbit-inner" aria-hidden="true" />
        <span className="stage-star star-one" aria-hidden="true">✦</span><span className="stage-star star-two" aria-hidden="true">✧</span>
        {deck.length === 0 ? <p className="discovery-empty">这里暂时没有其他品牌。</p> : <>
          {(draw.phase === 'idle' || draw.phase === 'opening') && mode === 'pack' ? <button className="discovery-pack" disabled={busy} onClick={() => setDraw({ phase: 'opening', index: null })} aria-label="打开卡包"><CardBack /><span className="pack-seal">打开卡包</span></button> : null}
          {draw.phase === 'idle' && mode === 'comet' ? <button className="comet-launch" onClick={() => choose(0)}><span aria-hidden="true">✦</span>探索一条连接<Icon name="arrow" /></button> : null}
          {mode === 'comet' && draw.phase === 'drawing' ? <div className="comet-trail" aria-hidden="true"><i /><i /><i /></div> : null}
          {(draw.phase === 'choosing' || draw.phase === 'drawing' || revealed) ? <div className="discovery-deck" key={round}>
            {deck.map(({ brand, relation }, index) => {
              const active = draw.index === index;
              const offset = index - (deck.length - 1) / 2;
              return <button key={brand.id} className={`discovery-card ${active ? 'is-drawn' : ''} ${draw.index !== null && !active ? 'is-away' : ''}`}
                style={{ '--card-offset': offset, '--card-rise': `${Math.abs(offset) * 15}px`, '--card-delay': `${index * 65}ms` } as CSSProperties}
                disabled={busy || revealed} aria-label={revealed && active ? `${brand.name}, ${relation.collaborationFit} collaboration fit` : `Reveal card ${index + 1}`}
                aria-hidden={draw.index !== null && !active ? true : undefined} onClick={() => choose(index)}>
                <span className="discovery-card-inner"><CardBack />
                  <span className="discovery-card-front" aria-hidden={!revealed || !active}>
                    <span className="card-corner top">新的连接</span>
                    <span className="card-portrait"><BrandCharacter brand={brand} /></span>
                    <strong>{brand.name}</strong><span className="card-category card-capability">{describeBrandCharacter(brand).capabilities.slice(0, 2).map(capability => capability.label).join(' · ') || 'Capability not specified'}</span>
                    <span className="card-fit">{relation.collaborationFit}<small>合作评价</small></span>
                  </span>
                </span>
              </button>;
            })}
          </div> : null}
          {draw.phase === 'drawing' || revealed ? <div className="discovery-burst" aria-hidden="true" key={`burst-${round}`} /> : null}
        </>}
      </div>
      <footer className="discovery-footer">
        {revealed && chosen ? <div className="discovery-result" role="status">
          <p className="discovery-relation-type">{chosen.relation.relationType}</p>
          <p className="discovery-outcome">{chosen.relation.possibleOutcome}</p>
          <div className="discovery-result-actions"><button className="quiet-button" onClick={again}>继续探索</button><button ref={exploreRef} className="primary-button" onClick={() => onExplore(chosen.brand.id)}>查看这个伙伴<Icon name="arrow" /></button></div>
        </div> : <div className="discovery-instructions" role="status">
          <p>{busy ? '正在发现新的连接…' : draw.phase === 'choosing' ? '选择卡片，认识新的伙伴。' : '从一次好奇开始新的连接。'}</p>
          {busy ? <button className="discovery-skip" onClick={() => setDraw(previous => ({ ...previous, phase: previous.phase === 'opening' ? 'choosing' : 'revealed' }))}>跳过动画</button> : <span>{candidates.length} 条连接 · 当前品牌 {focus.name}</span>}
        </div>}
      </footer>
    </article>
  </dialog>;
}
