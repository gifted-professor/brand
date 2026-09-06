import { chineseLabel } from '../domain/chinese';
import { useEffect, useRef } from 'react';
import type { Brand } from '../domain/types';
import { describeBrandCharacter } from '../engines/character';
import type { CharacterStyle } from '../engines/character';
import { BrandCharacter } from './BrandCharacter';
import { CapabilityIcon } from './CapabilityIcon';

export function CharacterStylePicker({ value, onChange }: { value: CharacterStyle; onChange: (style: CharacterStyle) => void }) {
  return <div className="character-style-picker" role="group" aria-label="角色视觉风格">
    <button aria-pressed={value === 'facet'} onClick={() => onChange('facet')}>低多边形</button>
    <button aria-pressed={value === 'halftone'} onClick={() => onChange('halftone')}>半色调</button>
  </div>;
}

export function CharacterPanel({ brand, style, onStyleChange, count, onShowAtlas }: {
  brand: Brand; style: CharacterStyle; onStyleChange: (style: CharacterStyle) => void; count: number; onShowAtlas: () => void;
}) {
  const { capabilities, primary, needs } = describeBrandCharacter(brand);
  return <section className="character-panel" aria-label={`${brand.name} capabilities`}>
    <div className="character-panel-heading"><span className="mono">品牌角色</span>{brand.character ? <span>{brand.character.source === 'ai' ? 'AI 生成' : '本地规则预览'}</span> : <CharacterStylePicker value={style} onChange={onStyleChange} />}</div>
    <div className="character-profile">
      <div className="character-portrait"><BrandCharacter brand={brand} labelled /></div>
      <div className="character-profile-copy">
        <p className="character-caption">已有能力</p>
        <strong className="character-primary"><CapabilityIcon id={primary?.id ?? 'unknown'} />{chineseLabel(primary?.label ?? '待补充')}</strong>
        <div className="character-capabilities">{capabilities.slice(1).map(capability => <span key={capability.id} title={`Brand brief: ${capability.evidence}`}><CapabilityIcon id={capability.id} />{capability.label}</span>)}</div>
      </div>
    </div>
    <details className="capability-evidence"><summary>查看能力简介</summary><p>{brand.offers || '尚未提供能力资料。'}</p></details>
    <p className="character-seeking"><span>正在寻找</span>{needs.length ? needs.map(capability => chineseLabel(capability.label)).join(' · ') : brand.needs || '待补充'}</p>
    <button className="character-atlas-link" onClick={onShowAtlas}>查看全部 {count} 个角色 <span aria-hidden="true">↗</span></button>
  </section>;
}

export function CharacterAtlas({ brands, style, onStyleChange, onClose, onInspect }: {
  brands: readonly Brand[]; style: CharacterStyle; onStyleChange: (style: CharacterStyle) => void;
  onClose: () => void; onInspect: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog className="character-atlas" ref={dialogRef} aria-labelledby="character-atlas-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="character-atlas-body">
      <header className="character-atlas-header"><div><p className="mono">品牌伙伴图鉴</p><h1 id="character-atlas-title">不同的能力，共同的可能。</h1><p>配饰对应品牌资料中的能力，选择角色开始探索。</p></div><button className="atlas-close" aria-label="返回角色页面" onClick={onClose}>←</button></header>
      <div className="character-atlas-toolbar"><span>{brands.length} brand characters</span><CharacterStylePicker value={style} onChange={onStyleChange} /></div>
      <div className="character-atlas-grid">{brands.map(brand => {
        const { primary, capabilities } = describeBrandCharacter(brand);
        return <button className="atlas-card" key={brand.id} onClick={() => onInspect(brand.id)} aria-label={`查看 ${brand.name}：${chineseLabel(primary?.label ?? '能力待补充')}`}>
          <span className="atlas-portrait"><BrandCharacter brand={brand} /></span><strong>{brand.name}</strong>
          <span className="atlas-primary"><CapabilityIcon id={primary?.id ?? 'unknown'} />{chineseLabel(primary?.label ?? '待补充')}</span>
          <span className="atlas-secondary">{capabilities.slice(1, 3).map(capability => chineseLabel(capability.label)).join(' · ') || 'Read the brand brief'}{capabilities.length > 3 ? ` +${capabilities.length - 3}` : ''}</span>
        </button>;
      })}</div>
    </div>
  </dialog>;
}
