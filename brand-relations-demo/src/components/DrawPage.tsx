import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { Brand, RelationResult } from '../domain/types';
import { WearableCharacter } from './WearableCharacter';
import { drawWearable } from '../domain/drawWardrobe';
import { Icon } from './Icon';
import { BrandVisualKey } from './BrandVisualKey';
import { BrandCharacter } from './BrandCharacter';

export function shuffleBrands(brands: readonly Brand[], ownId: string, preferredId?: string): Brand[] {
  const pool = brands.filter(brand => brand.id !== ownId);
  for (let i = pool.length - 1; i > 0; i--) { const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; const j = Math.floor(random * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const preferred = preferredId ? pool.find(brand => brand.id === preferredId) : undefined;
  if (!preferred) return pool.slice(0, 3);
  const hand = pool.filter(brand => brand.id !== preferred.id).slice(0, 2);
  const index = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * (hand.length + 1));
  hand.splice(index, 0, preferred);
  return hand;
}

export function DrawPage({ brands, home, relations, preferredId, onChoose }: { brands: readonly Brand[]; home: Brand; relations: ReadonlyMap<string, RelationResult>; preferredId?: string; onChoose: (id: string) => void }) {
  const [deck, setDeck] = useState(() => shuffleBrands(brands, home.id, preferredId));
  const [selected, setSelected] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const [round, setRound] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const chosen = deck.find(brand => brand.id === selected);
  const relation = selected ? relations.get(selected) : undefined;
  const reveal = (id: string) => {
    if (closing || selected === id) return;
    // Finish the deal before measuring; otherwise the return target keeps moving.
    for (const card of cardRefs.current.values()) for (const animation of card.getAnimations()) animation.finish();
    setSelected(id);
  };
  useLayoutEffect(() => {
    if (!selected || !dialog.current) return;
    const modal = dialog.current;
    if (!modal.open) modal.showModal();
    const measure = () => {
      const source = cardRefs.current.get(selected)?.getBoundingClientRect();
      const target = modal.getBoundingClientRect();
      if (source) {
        modal.style.setProperty('--card-dx', `${source.x + source.width / 2 - target.x - target.width / 2}px`);
        modal.style.setProperty('--card-dy', `${source.y + source.height / 2 - target.y - target.height / 2}px`);
        modal.style.setProperty('--card-sx', String(source.width / target.width));
        modal.style.setProperty('--card-sy', String(source.height / target.height));
        modal.style.setProperty('--source-width', `${source.width}px`);
        modal.style.setProperty('--source-height', `${source.height}px`);
        modal.style.setProperty('--back-sx', String(target.width / source.width));
        modal.style.setProperty('--back-sy', String(target.height / source.height));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(modal);
    const card = cardRefs.current.get(selected);
    if (card) observer.observe(card);
    return () => observer.disconnect();
  }, [selected]);
  const finishDismiss = useCallback(() => {
    dialog.current?.close();
    flushSync(() => { setSelected(null); setClosing(false); });
    if (selected) cardRefs.current.get(selected)?.focus({ preventScroll: true });
  }, [selected]);
  useEffect(() => {
    if (!closing) return;
    // Also close if animationend is lost (background tab, motion preference change).
    const timer = window.setTimeout(finishDismiss, 520);
    return () => window.clearTimeout(timer);
  }, [closing, finishDismiss]);
  const dismiss = () => {
    if (closing || !selected) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishDismiss(); return; }
    const motion=dialog.current?.querySelector<HTMLElement>('.draw-dialog-motion');
    if(motion) motion.style.setProperty('--close-transform',getComputedStyle(motion).transform);
    setClosing(true);
  };
  return <main className="draw-page" aria-label="抽卡匹配页面">
    <div className="draw-heading"><h1>下一位伙伴，会是谁？</h1></div>
    <div className="draw-table" key={round}>
      {deck.map((brand, index) => <button key={brand.id} style={{ '--deal-index': index } as CSSProperties} ref={element => { if (element) cardRefs.current.set(brand.id, element); else cardRefs.current.delete(brand.id); }} className={`draw-card ${selected === brand.id ? 'is-revealing' : ''}`} onClick={() => reveal(brand.id)} aria-label={`翻开第 ${index + 1} 张卡`}>
        <span className="draw-card-body"><DrawCharacterFace brand={brand} />
        <span className="draw-face draw-front" aria-hidden="true"><span className="draw-card-number">品牌资料</span><strong>{brand.name}</strong><span>{brand.category}</span><span className="draw-front-summary">{brand.summary}</span><span>查看品牌资料 ↗</span></span></span>
      </button>)}
    </div>
    <button className="flow-secondary draw-again" onClick={() => { setDeck(shuffleBrands(brands, home.id, preferredId)); setSelected(null); setRound(value => value + 1); }}>重新洗牌</button>
    <p className="draw-note">本期最高匹配 + 2 个随机品牌 · 评价仅供参考</p>
    <dialog ref={dialog} className={`draw-dialog ${closing ? 'is-closing' : ''}`} aria-labelledby="draw-dialog-title" onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
      {chosen ? <div className="draw-dialog-motion" key={chosen.id} onAnimationEnd={event => { if (closing && event.target === event.currentTarget && event.animationName === 'spring-card-close') finishDismiss(); }}><div className="draw-dialog-back" aria-hidden="true"><DrawCharacterFace brand={chosen} /></div><div className="draw-dialog-content">
        <button className="page-close" autoFocus onClick={dismiss} aria-label="返回卡牌"><Icon name="back" /></button>
        <div className="draw-dialog-scroll"><div className="draw-dialog-identity"><BrandCharacter brand={chosen}/><div><p className="mono">品牌资料</p><h2 id="draw-dialog-title">{chosen.name}</h2><p>{chosen.category}</p></div></div><p className="draw-dialog-score">{relation ? `${relation.collaborationFit} / 100 · 智能评价` : '资料待补充'}</p>
        <BrandVisualKey brand={chosen} compact/><dl>{([['品牌介绍', chosen.summary], ['已有能力', chosen.offers], ['寻找什么', chosen.needs], ['联名目标', chosen.intent], ['目标消费者', chosen.audience], ['品牌气质', chosen.identity], ['合作边界', chosen.constraints], ['案例与依据', chosen.supportingEvidence], ['合作可能', relation?.reason]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '待补充'}</dd></div>)}</dl></div>
        <button className="flow-primary" onClick={() => { dialog.current?.close(); onChoose(chosen.id); }}>选择这个伙伴<Icon name="arrow" /></button>
      </div></div> : null}
    </dialog>
  </main>;
}

function DrawCharacterFace({ brand }: { brand: Brand }) {
  return <span className="draw-face draw-back" aria-hidden="true"><span className="draw-card-number">品牌角色</span><WearableCharacter brand={brand} look={drawWearable(brand)} /></span>;
}
