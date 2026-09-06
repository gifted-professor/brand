import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand } from '../domain/types';
import { deriveBrandAppearance } from '../domain/brandAppearance';
import { BrandCharacter } from './BrandCharacter';
import { AccessoryEvaluationGuide } from './AccessoryEvaluationGuide';
export default function BrandAtlas({brands,onClose,onLocate}:{brands:readonly Brand[];onClose:()=>void;onLocate:(id:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const close=()=>{dialog.current?.close();onClose();};
  const [query,setQuery]=useState('');
  useEffect(()=>{ dialog.current?.showModal(); },[]);
  const catalog=useMemo(()=>brands.map(brand=>({brand,look:deriveBrandAppearance(brand)})),[brands]);
  const filtered=catalog.filter(({brand,look})=>`${brand.name} ${brand.category} ${brand.offers} ${look.label} ${look.hairLook.style.label} ${look.hairLook.color.label} ${look.hairLook.reason}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <dialog ref={dialog} className="brand-atlas" aria-labelledby="brand-atlas-title" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <header className="brand-atlas-header"><div className="brand-atlas-heading"><h2 id="brand-atlas-title">从角色，认识品牌。</h2><button className="brand-atlas-close" onClick={close} aria-label="关闭品牌图鉴">×</button></div><p>发型与发色呼应品牌气质，配饰呈现产品与能力。点选一个角色，在引力场找到它。</p><input className="brand-atlas-search" type="search" autoFocus aria-label="查找品牌或产品" placeholder="搜索品牌、配饰、发型或发色…" value={query} onChange={event=>setQuery(event.target.value)}/></header>
    <div className="brand-atlas-guide"><AccessoryEvaluationGuide/></div>
    <span className="brand-atlas-count" role="status">{query?`找到 ${filtered.length} 个角色`:`${brands.filter(brand=>brand.fictional).length} 个生成品牌样本${brands.some(brand=>!brand.fictional)?` · ${brands.filter(brand=>!brand.fictional).length} 个公开品牌`:''}`}</span>
    <div className="brand-atlas-grid">{filtered.map(({brand,look})=><button className="brand-atlas-card" key={brand.id} onClick={()=>{dialog.current?.close();onLocate(brand.id);}} aria-label={`在引力场找到 ${brand.name}`}><BrandCharacter brand={brand}/><strong>{brand.name}</strong><span className="brand-atlas-style" title={look.hairLook.reason}><i style={{background:look.hairLook.color.hex}}/>{look.hairLook.style.label} · {look.hairLook.color.label}</span><small>{look.props.slice(0,2).map(prop=>prop.label).join(' · ')||'待补充品牌资料'}</small><span>{brand.id==='cotti-coffee'?'我的品牌':brand.fictional?'生成样本':'公开品牌'}</span></button>)}</div>
    {!filtered.length?<p className="brand-atlas-empty">没有找到相关品牌，试试产品名称或配饰关键词。</p>:null}
  </dialog>;
}
