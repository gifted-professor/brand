import type { Brand } from '../domain/types';
import type { InvitationDraft } from '../domain/invitation';
import type { ProjectBrand, VisualIdentity } from './model';
import { demoAnchorBrands } from '../data/demoBrands';

const [cottiCoffee, nailong] = demoAnchorBrands(1);
export const DEMO_BRANDS: ProjectBrand[] = [
  { brand: cottiCoffee, visual: { wordmark: 'COTTI COFFEE', background: '#D52127', foreground: '#FFF8E8', accent: '#D52127', source: 'provided' } },
  { brand: nailong, visual: { wordmark: 'NAILOONG', background: '#F6C900', foreground: '#4A2D1F', accent: '#F6C900', source: 'provided' } },
];
export function visualForBrand(value: Brand): VisualIdentity {
  return DEMO_BRANDS.find(item => item.brand.id === value.id)?.visual ?? { wordmark: value.name, background: '#FFFFFF', foreground: '#111111', accent: '#111111', source: 'unprovided' };
}
export function initialBrief(a: Brand, b: Brand): InvitationDraft {
  const cottiNailong = new Set([a.id, b.id]).size === 2 && [a.id, b.id].every(id => ['cotti-coffee', 'nailong'].includes(id));
  return { title: cottiNailong ? '今天也要，奶一口好咖啡。' : `${a.name} × ${b.name} · 日常相遇`,
    concept: cottiNailong ? '以角色主题饮品、联名杯套和门店打卡为核心，先在少量门店与社交渠道验证年轻消费者对“轻松治愈 × 高频咖啡”的兴趣；本预演只用于沟通概念，不代表授权或发布。' : `围绕共同的日常生活场景，${a.name} 与 ${b.name} 各发布一篇伙伴介绍，向原有受众提供一个值得了解的新品牌。`,
    contribution: cottiNailong ? '拟由库迪咖啡提供饮品研发、门店触点、杯套与社交渠道；试点城市、门店数、物料量和排期均待确认。' : `拟由 ${a.name} 提供已有品牌素材，在自己的渠道发布一次伙伴介绍；具体渠道与时间待确认。`,
    ask: cottiNailong ? '邀请奶龙提供角色形象授权规范、可用素材与内容审稿；授权品类、区域、期限、费用和排他范围均由双方另行确认。' : `邀请 ${b.name} 提供已有素材，并在其渠道介绍 ${a.name}；是否参与、渠道与时间由对方确认。`,
    diagnostics: cottiNailong ? ['消费者价值假设：用治愈角色降低新品尝试门槛，并为门店提供可分享的体验；先以扫码互动、杯套领取和主题饮品复购验证。', '库迪投入产品、供应链、门店和渠道，奶龙投入授权、角色内容与审稿；预算、保底、分成和素材制作成本待双方确认。', '饮品安全与门店交付由库迪负责；角色授权与形象一致性由奶龙复核；客服、赠品质量、售罄、延期和退出机制待共同约定。'] : ['消费者可以从熟悉品牌的推荐中发现相关的产品和生活方式；实际兴趣需以内容反馈验证。', '各自承担本方内容制作、审稿与发布；关注新增品牌认知，不预设销量或曝光保证。', '本方审核自己的标识与内容，对方复核涉及自己的表述；排期、素材许可和退出方式待双方确认。'] };
}
