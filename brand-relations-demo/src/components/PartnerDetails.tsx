import type { Brand } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { FlowIcon } from './FlowIcon';
import { Icon } from './Icon';

export function PartnerDetails({ home, partner, onBack, onPreview }: { home: Brand; partner: Brand; onBack: () => void; onPreview: () => void }) {
  return <main className="partner-details"><button className="flow-close" aria-label="关闭伙伴详情" onClick={onBack}><FlowIcon name="close" /></button><div className="partner-details-header"><div><p className="detail-overline">潜在伙伴</p><h1>{partner.name}</h1><p>{partner.summary}</p></div><BrandCharacter brand={partner} labelled /></div><dl className="partner-facts">{([
    ['产品与能力', partner.offers], ['合作需求', partner.needs], ['联名目标', partner.intent], ['目标消费者', partner.audience], ['品牌个性', partner.identity], ['预算与交付边界', partner.constraints], ['案例与证据', partner.evidence],
  ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '待品牌补充'}</dd></div>)}</dl><div className="partner-contact"><h2>让对方先看见合作的可能。</h2><p>以 {home.name} 的身份，准备一份联名预演邀请。</p><button className="flow-primary" onClick={onPreview}>用联名预演建立联系<Icon name="arrow" /></button><button className="entry-text-button" onClick={onBack}>暂不建立联系，继续看看</button></div></main>;
}
