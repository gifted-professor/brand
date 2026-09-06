import type { Brand } from './types';
export const BASE_AVATAR = '/avatars/base-reference-v2.png';
export function brandWearable(brand: Brand) {
  if(brand.id.startsWith('lab-') && /^\/lab-avatars\/[a-z-]+\.(jpg|png)$/.test(brand.avatarDataUrl || '')) return {url:brand.avatarDataUrl!,label:'用户提供的品牌形象参考',source:'example' as const};
  const generated = brand.profile?.wearable;
  if (generated?.source === 'generated' && /^\/api\/collider\/avatar-assets\/[a-f0-9-]{36}\.(png|jpeg|webp)$/.test(generated.url)) return {url: generated.url, label: '品牌产品穿搭 · AI 概念效果', source: 'generated' as const};
  // Local previews are explicit product directions, never evidence of a real SKU.
  const declarations = brand.offers.split(/[。！？.!?;；\n]/u).filter(text => !/不|没有|未|计划|希望|寻找|合作方|客户|partner|client|without|not|plan|seek/i.test(text)).join(' ');
  const options = [
    {id:'scarf', pattern:/围巾|scarf|scarves/i, label:'围巾穿搭'},
    {id:'jacket', pattern:/夹克|外套|冲锋衣|jacket|outerwear/i, label:'外套穿搭'},
    {id:'bag', pattern:/背包|挎包|手袋|包袋|messenger bag|backpack|handbag/i, label:'包袋穿搭'},
  ];
  const choice = options.find(item => item.pattern.test(declarations));
  return choice ? {url:`/avatars/wearables-v2/${choice.id}-final.png`, label:`${choice.label} · 产品方向示意`, source:'example' as const} : {url:BASE_AVATAR,label:'基础角色 · 等待产品资料',source:'base' as const};
}
