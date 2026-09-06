import type { Brand } from './types';
import { currentOwnClauses, extractCapabilities } from '../engines/character';
import { deriveBrandHair } from './brandHair';
import { hash } from './hash';

// All visual claims originate in current, self-owned offers. Needs never equip a character.
export const PROP_CATALOG = [
  ['tea', '茶壶', /茶壶|茶叶|tea sourcing/i],
  ['coffee', '咖啡杯', /咖啡|coffee/i],
  ['vase', '陶器', /陶瓷|陶壶|陶艺|ceramics/i],
  ['camera', '相机', /相机|摄影|camera|photography/i],
  ['headphones', '监听耳机', /耳机|声音设计|sound design|headphone/i],
  ['recorder', '录音机', /录音机|录音|recorder/i],
  ['yarn', '纱线', /纱线|针织|围巾|yarn|scarf/i],
  ['swatches', '材料色样', /材料色样|material research|材料研究|sustainable materials|可持续材料/i],
  ['book', '书籍图录', /书籍|图录|绘本|笔记本|publishing|出版/i],
  ['tablet', '交互终端', /交互终端|数字交互|digital interaction/i],
  ['chip', '芯片模块', /芯片|人工智能|ai technology/i],
  ['parcel', '包装盒', /包装盒|packaging|包装/i],
  ['crate', '配送货箱', /配送货箱|distribution|logistics|渠道|物流/i],
  ['plant', '盆栽', /植物盆栽|园艺|plant|gardening/i],
  ['watering', '浇水壶', /浇水壶|watering/i],
  ['bread', '面包', /面包|bread|bakery/i],
  ['bottle', '滴管瓶', /滴管瓶|香氛|护理|perfume/i],
  ['glass', '玻璃容器', /玻璃瓶|玻璃|glass/i],
  ['lamp', '灯具', /灯具|灯光|lighting/i],
  ['wheel', '自行车轮', /轮组|自行车|bicycle/i],
  ['helmet', '骑行头盔', /头盔|helmet/i],
  ['leash', '宠物牵引绳', /牵引绳|leash/i],
  ['bone', '宠物玩具', /骨头玩具|pet toy/i],
  ['blocks', '积木器物', /积木|building block|prototyping|原型/i],
  ['puppet', '木偶', /木偶|puppet/i],
  ['model', '空间模型', /家具模型|空间模型|spatial design|空间设计/i],
  ['megaphone', '活动扩音器', /扩音器|社群运营|community building/i],
  ['ticket', '活动票券', /票券|event production|活动制作/i],
  ['pen', '画笔文具', /铅笔|画笔|雕刻工具|pencil/i],
  ['board', '设计图板', /设计图板|配色画板|product design|产品设计/i],
  ['ruler', '尺具', /直尺|软尺|ruler/i],
  ['wrench', '制作工具', /扳手|small-batch manufacturing|小批量制造/i],
  ['gear', '工业零件', /齿轮|金属零件|production engineering|生产工程/i],
  ['calculator', '财税计算器', /计算器|tax reporting|财税|税务申报/i],
  ['folder', '工作夹', /工作夹|报表|audit preparation|审计准备/i],
  ['compass', '户外装备', /登山杖|营地水壶|outdoor equipment/i],
  ['basket', '食材茶篮', /茶篮|食材篮|咖啡豆袋|food sourcing|食材采购/i],
  ['specimen', '植物与材料标本', /培养样本|植物标本|specimen/i],
  ['stamp', '拓印章', /拓印章|stamp/i],
  ['speaker', '便携音箱', /音箱|speaker/i],
  ['scanner', '扫码器', /扫码器|scanner/i],
  ['solar', '太阳能板', /太阳能板|solar/i],
  ['battery', '储能电池', /储能电池|battery/i],
] as const;
export type PropId = typeof PROP_CATALOG[number][0];
export interface VisualProp { id: PropId; label: string; evidence: string }
const fallbackProps: Record<string, PropId> = { design:'board',manufacturing:'wrench',materials:'swatches',craft:'vase',technology:'chip',packaging:'parcel',distribution:'crate',space:'model',culture:'book',content:'camera',community:'megaphone',events:'ticket',food:'basket',textiles:'yarn',digital:'tablet',finance:'calculator',sound:'headphones',prototype:'blocks' };
const palettes = [
  ['#3a6871','#bed8d0','#dfb26e'], ['#706099','#e3d7ed','#e2ad82'],
  ['#a66043','#f1d8bb','#899565'], ['#365dad','#dbe6f5','#d9af59'],
  ['#63764f','#dce4c8','#d58c6b'], ['#aa6275','#f1d5dc','#c5aa67'],
  ['#3f777e','#cce5e6','#d49b66'], ['#796350','#e7dcc9','#9cae82'],
] as const;

export function deriveBrandAppearance(brand: Brand) {
  const identity = hash((brand.visualSeed ?? brand.name).normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase());
  const clauses = currentOwnClauses(brand.offers).flatMap(clause=>clause.split(/[，,、]|\band\b|以及|和|与/iu)).map(clause=>clause.trim()).filter(Boolean);
  const candidates: VisualProp[] = [];
  for (const clause of clauses) {
    // Match order in the source, not catalog ranking or brand popularity.
    const matches = PROP_CATALOG.flatMap(([id,label,pattern]) => {
      const match = pattern.exec(clause);
      return match ? [{ id, label, evidence: clause, index: match.index }] : [];
    }).sort((a,b)=>a.index-b.index);
    for (const match of matches) if (!candidates.some(item=>item.id===match.id)) candidates.push(match);
    if (!matches.length) for (const capability of extractCapabilities(clause)) {
      const prop=PROP_CATALOG.find(item=>item[0]===fallbackProps[capability.id]);
      if(prop&&!candidates.some(item=>item.id===prop[0]))candidates.push({id:prop[0],label:prop[1],evidence:capability.evidence});
    }
  }
  // Two readable tools plus a small new-detail charm. Added information can change the charm.
  const props = candidates.length > 3 ? [candidates[0],candidates[1],candidates[candidates.length-1]] : candidates;
  const primary = props[0]?.id;
  const garment = ['tea','coffee','vase','bread','basket','wrench','glass','plant','watering'].includes(primary ?? '') ? 'apron'
    : ['compass','wheel','solar','crate','helmet'].includes(primary ?? '') ? 'vest'
    : ['yarn','book','puppet','bottle'].includes(primary ?? '') ? 'knit' : 'jacket';
  const hairLook=deriveBrandHair(brand,props);
  const palette=hairLook.explicitColor?[hairLook.color.hex,hairLook.color.highlight,palettes[identity % palettes.length][2]] as const:palettes[identity % palettes.length];
  return { props, hair: hairLook.style.id, hairLook, palette, garment,
    signature: `${hairLook.style.id}:${hairLook.color.hex}:${identity % palettes.length}:${garment}:${props.map(prop=>prop.id).join('+')}`,
    label: props.length ? props.map(prop=>prop.label).join(' · ') : '基础角色 · 等待品牌产品与内容' };
}
