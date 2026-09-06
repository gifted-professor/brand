import { BrandVisualKey } from './BrandVisualKey';
import type { Brand, RelationResult } from '../domain/types';
import { EvaluationDimensions } from './EvaluationDimensions';
import { BrandCharacter } from './BrandCharacter';
import { Icon } from './Icon';
import { JourneyFooter } from './JourneyFooter';

const DETAILS: [keyof Brand, string][] = [['offers', '已有能力'], ['needs', '希望获得'], ['intent', '联名目标'], ['audience', '目标消费者'], ['identity', '品牌气质'], ['constraints', '边界与限制'], ['supportingEvidence', '案例与依据']];

export function PartnerDetailPage({ home, partner, relation, onClose, onContact }: { home: Brand; partner: Brand; relation?: RelationResult; onClose: () => void; onContact: () => void }) {
  return <main className="partner-detail-page">
    <button className="page-close" onClick={onClose} aria-label="返回匹配"><Icon name="back" /></button>
    <header className="partner-detail-head"><div className="partner-detail-portrait"><BrandCharacter brand={partner} labelled /></div><div><p className="mono">已选择的伙伴</p><h1>{partner.name}</h1><p>{partner.category}</p></div>{relation ? <div className="partner-detail-score"><strong>{relation.collaborationFit}</strong><span>/100<br />智能评价</span></div> : null}</header>
    <BrandVisualKey brand={partner}/><div className="partner-detail-layout"><section className="partner-evaluation"><h2>为什么值得进一步了解</h2><p>{relation?.reason || partner.summary}</p>{relation ? <EvaluationDimensions relation={relation} /> : null}<h2>可能一起做什么</h2><p>{relation?.possibleOutcome || '需要双方进一步讨论具体产物。'}</p>{relation?.caveat ? <p className="partner-caveat">待确认：{relation.caveat}</p> : null}</section>
      <section className="partner-profile"><h2>品牌资料</h2><p className="partner-summary">{partner.summary}</p><dl>{DETAILS.map(([key, label]) => partner[key] ? <div key={key}><dt>{label}</dt><dd>{String(partner[key])}</dd></div> : null)}</dl>{partner.contact ? <section className="partner-public-contact" aria-label="公开建联信息"><h2>{partner.contact.label}</h2><div className="partner-contact-links">{partner.contact.email ? <a href={`mailto:${partner.contact.email}`}>{partner.contact.email}</a> : null}{partner.contact.wechat ? <span>企业微信：{partner.contact.wechat}</span> : null}{partner.contact.website ? <a href={partner.contact.website} target="_blank" rel="noreferrer">官方网站 ↗</a> : null}</div><p>{partner.contact.note}</p></section> : null}</section></div>
    <section className="partner-contact"><div><strong>{home.name} × {partner.name}</strong><span>{partner.contact ? `已整理${partner.contact.label}，先用联名预演形成一份可讨论的邀请。` : '先让对方看见联名的可能，再决定是否合作。'}</span></div><button className="flow-primary" type="button" onClick={onContact}>进入共创画布<Icon name="arrow" /></button></section>
    <JourneyFooter current="partner" />
  </main>;
}
