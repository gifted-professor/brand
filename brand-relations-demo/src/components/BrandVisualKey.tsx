import type { Brand } from '../domain/types';
import { deriveBrandAppearance } from '../domain/brandAppearance';
import { BrandProp } from './BrandProp';
import { ACCESSORY_GUIDE } from '../domain/accessoryGuide';
import { AccessoryEvaluationGuide } from './AccessoryEvaluationGuide';

export function BrandVisualKey({brand,compact=false}:{brand:Brand;compact?:boolean}) {
  const look=deriveBrandAppearance(brand);
  return <section className={`brand-visual-key ${compact?'is-compact':''}`} aria-label="角色上的品牌信息">
    <p>从角色认识品牌{brand.fictional?<span>虚构示例</span>:null}</p>
    <div className="brand-style-key" aria-label="品牌气质与发色" title={look.hairLook.reason}><i style={{background:look.hairLook.color.hex}} aria-hidden="true"/><span><strong>{look.hairLook.style.label} · {look.hairLook.color.label}</strong>{!compact?<small>{look.hairLook.reason}</small>:null}</span></div>
    <ul>{look.props.map((prop,index)=><li key={prop.id} title={prop.evidence}><svg viewBox="0 0 68 80" aria-hidden="true"><BrandProp id={prop.id} color={look.palette[0]} light={look.palette[1]}/></svg><span><strong>{prop.label}</strong>{!compact?<><small>{ACCESSORY_GUIDE[prop.id].capability}</small><small>{['手持物','随身装备','内容挂件'][index]} · {brand.fictional?'虚构资料':'品牌陈述'}：{prop.evidence}</small></>:null}</span></li>)}</ul>
    {!compact?<AccessoryEvaluationGuide propIds={look.props.map(prop=>prop.id)}/>:null}
  </section>;
}
