import type { Brand } from '../domain/types';
import { hash } from '../domain/hash';
import { withDemoMaterials } from './demoBrandMaterials';

const withSeed = (brand: Omit<Brand, 'characterSeed'>, seed: number): Brand => ({
  ...brand,
  characterSeed: hash(`${seed}:${brand.id}`),
});

/**
 * Two public-brand snapshots prepared specifically for the local presentation.
 * Claims stay in readable fields so the normal relation engine—not an ID override—
 * determines their position and score.
 */
export function demoAnchorBrands(seed = 1): Brand[] {
  return [
    withSeed({
      id: 'cotti-coffee',
      name: '库迪咖啡',
      category: '全球连锁咖啡品牌',
      summary: '以高品质、高性价比与高便利性的咖啡产品连接日常消费场景，并持续提供年轻、时尚的品牌体验。',
      offers: '咖啡与茶饮研发、咖啡烘焙、门店零售、全球供应链、包装、渠道分销、社交媒体内容制作、会员触达与线下活动。',
      needs: '角色 IP 授权、文化叙事、视觉设计、内容制作、商品授权与主题空间创意。',
      intent: '围绕年轻消费者推出一档角色 IP 主题饮品、联名杯套与门店打卡内容，并用小程序和社交媒体同步传播。',
      audience: '年轻白领、大学生、日常咖啡爱好者，以及喜欢新鲜事物的城市消费者。',
      identity: '库迪红 #D52127、奶油白；年轻、时尚、直接、温暖、开放、好奇；利落短发。',
      constraints: '保留库迪咖啡品牌标识与饮品安全规范；联名名称、角色形象、授权范围、物料数量与档期需双方书面确认。',
      supportingEvidence: '演示档案依据库迪咖啡官网公开的产品、商业业态与市场合作入口整理；联名设想为本地演示假设，不代表品牌已授权。',
      evidence: '公开品牌资料快照 · 2026-09-06',
      avatarDataUrl: '/brand-ip/cotti-coffee-v2-white.png',
      fictional: false,
      contact: {
        label: '市场合作',
        email: 'MKT@COTTICOFFEE.COM',
        website: 'https://www.cotticoffee.com/',
        note: '公开商务入口；实际合作需由品牌方确认。',
      },
    }, seed),
    withSeed({
      id: 'nailong',
      name: '奶龙',
      category: '原创动漫角色 IP',
      summary: '第七印象旗下原创动漫 IP。核心角色是一只呆萌、可爱又有点小机灵的异星幼龙，以轻松、治愈的内容连接广泛受众。',
      offers: '角色 IP 授权、商品授权、品牌联名、3D 动画与短视频内容制作、视觉设计、文化叙事、绘本、木偶角色、主题空间与线上宣发。',
      needs: '食品研发、咖啡产品、包装、零售空间、渠道分销与线下门店触点。',
      intent: '把角色内容带进高频日常消费场景，联合推出主题饮品、杯套周边、门店互动和社交内容。',
      audience: '年轻白领、学生、家庭、动漫与潮玩爱好者，以及喜爱轻松治愈内容的消费者。',
      identity: '奶龙黄 #F6C900、奶油白、巧克力棕；呆萌、温暖、趣味、治愈、开放、好奇；奶油金侧分短波波头与圆润绒感服装。',
      constraints: '须遵守奶龙 IP 形象与授权规范；角色使用范围、品类排他、内容审稿、物料数量、区域和档期需由双方确认。',
      supportingEvidence: '奶龙官网公开其品牌联名、商品授权、空间授权、渠道合作与宣发能力，并提供公开商务联络入口。联名设想为本地演示假设。',
      evidence: '公开品牌资料快照 · 2026-09-06',
      avatarDataUrl: '/brand-ip/nailoong-v1-white.png',
      fictional: false,
      contact: {
        label: '品牌授权与商业咨询',
        email: 'dqyx@dqyx.net',
        wechat: 'dqyx-business',
        website: 'https://www.nailoong.com/',
        note: '第七印象官网公开入口；海外授权邮箱为 nailoong708@gmail.com。',
      },
    }, seed),
  ].map(withDemoMaterials);
}
