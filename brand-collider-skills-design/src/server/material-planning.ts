import { MATERIAL_CATEGORIES, MATERIAL_PRIORITIES, MATERIAL_ASPECT_RATIOS } from '../material-plan.ts';
import type { MaterialItem, MaterialPlan, MaterialVisual } from '../material-plan.ts';

// A response-size guard, not a creative quota or a target number of deliverables.
export const MAX_MATERIAL_ITEMS = 80;
export const MATERIAL_PLANNING_POLICY = `物料策划共同原则：适用于品牌×IP、品牌×品牌，以及与设计师、文化机构、服务或内容方的合作。先从双方资料识别核心产品、内容或服务体验与各自贡献；承载方可以是 A、B 或双方共同开发（both）。品类使用自由文本，不受固定品牌或品类清单限制。把双方可用的原料、技术、工艺、产品形态、设计符号、角色、文化内容、渠道或服务能力转译为具体设计与消费者价值；不能预设必须有虚拟角色、世界观或一方只提供贴图。每个方向必须说清合作结晶是什么、双方如何改变它。有辨识度的产品、内容或体验可独立构成联名价值，无须强加复杂剧情或任务玩法。
围绕该核心按适配性选择五类候选：product 主营产品（含数字商品与内容）、packaging 包装与随附、communication 传播物料、merchandise 延伸周边、experience 场景与体验（含核心服务）。deliveryScope 按用户范围选择：full_collaboration 表示完整联名方案（旧记录未填时同样按此处理），至少有一项 product + core 或 experience + core，不能只有包装、传播或泛周边。仅当用户明确限制交付范围、已有核心只作为设计依据时使用 focused_deliverables，在 scopeNote 写明用户范围与既有核心依据；本次清单只含范围内交付，可仅有传播、包装或周边，不把既有核心重复塞入清单。不得默认用 focused_deliverables 掩盖全案缺少核心。服务/内容联名无需虚构实体产品、包装或赠品，各类不必强行覆盖。默认充分探索约 20–30 个有独立用途的候选项目，按 core 核心项、recommended 推荐项、optional 可选项分级；这是软目标，用户窄范围、预算、不能新增/印刷等明确约束优先，有理由可更多或更少，在 scopeNote 说明取舍。不得用无关周边、同款换角色/配色、同图换尺寸凑数；这些记为 variants。不同品类、用途或结构的产品可作为独立候选。核心/推荐/可选只是制作建议，不表示用户已选中、已生产或已出图。ipAssets 与 ipExpression 是兼容旧记录的字段名，分别记录合作资产与它们的具体设计转译，不要求存在 IP。未知SKU、材质含量、配方、授权、性能、资源与工艺写在 feasibility，不以品牌名猜参数，不编成已确认事实；概念探索不要求先拿到刀版或量产参数。
遵循已加载的开放品类适配方法，从业务、用户场景与产品部位推导候选，分类只整理结果。`;

export const materialPlanGuide = {
  productAnchor: { brandId: 'a 或 b；双方共同开发用 both', category: '自由文本，写本案产品、内容或服务的实际品类', coreProduct: '本案核心产品、内容或服务体验', rationale: '为什么以它为核心，承载方与双方贡献', ipAssets: ['双方资料支持的合作资产，如工艺、技术、原料、设计符号、文化内容、角色或服务能力；创意建议明确标注'], translation: '合作资产如何进入产品、内容或服务的具体设计与消费者体验' },
  deliveryScope: 'full_collaboration | focused_deliverables；仅当用户明确限定交付且核心为既有设计依据时选 focused_deliverables，不能用它掩盖全案缺核心',
  scopeNote: '用户限定范围与既有核心依据，或完整方案的候选取舍；数量受用户条件约束；所有项目为待选概念',
  items: [{ id: '稳定本地ID，如material-01', name: '物料名称', category: 'product | packaging | communication | merchandise | experience', priority: 'core | recommended | optional',
    role: '使用场景与消费者价值', design: '本件具体产品形态、外观、材质感，或内容结构、界面与服务触点', ipExpression: '哪项合作资产转成什么设计或体验，说明双方贡献，避免泛泛贴标', dependencies: ['依赖的本清单物料ID，无则空数组'], variants: ['款式/角色/配色/尺寸变体，无则空数组'], feasibility: '已有依据、建议新增、待确认条件与用户限制的对应决策' }],
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('物料字段必须为对象');
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 1200): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('物料文本缺失或过长');
  return value.trim();
};
const list = (value: unknown, max = 20): string[] => {
  if (!Array.isArray(value) || value.length > max) throw new Error('物料列表无效');
  return value.map(item => text(item, 500));
};
const key = (value: unknown): string => {
  const id = text(value, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('物料ID无效');
  return id;
};
export function validateMaterialPlan(value: unknown): MaterialPlan {
  const raw = record(value), anchor = record(raw.productAnchor);
  const deliveryScope = raw.deliveryScope;
  if (deliveryScope !== undefined && deliveryScope !== 'full_collaboration' && deliveryScope !== 'focused_deliverables') throw new Error('物料交付范围无效');
  if (anchor.brandId !== 'a' && anchor.brandId !== 'b' && anchor.brandId !== 'both') throw new Error('合作承载方无效');
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_MATERIAL_ITEMS) throw new Error('物料候选数量无效');
  const items: MaterialItem[] = raw.items.map(value => {
    const item = record(value);
    if (typeof item.category !== 'string' || typeof item.priority !== 'string'
      || !Object.hasOwn(MATERIAL_CATEGORIES, item.category) || !Object.hasOwn(MATERIAL_PRIORITIES, item.priority)) throw new Error('物料分类或优先级无效');
    return { id: key(item.id), name: text(item.name, 100), category: item.category as MaterialItem['category'], priority: item.priority as MaterialItem['priority'],
      role: text(item.role), design: text(item.design), ipExpression: text(item.ipExpression), dependencies: list(item.dependencies, MAX_MATERIAL_ITEMS).map(key),
      variants: list(item.variants), feasibility: text(item.feasibility) };
  });
  const byId = new Map(items.map(item => [item.id, item]));
  if (byId.size !== items.length || new Set(items.map(item => item.name.toLocaleLowerCase())).size !== items.length) throw new Error('物料ID或名称重复');
  if (deliveryScope !== 'focused_deliverables'
    && !items.some(item => (item.category === 'product' || item.category === 'experience') && item.priority === 'core')) throw new Error('缺少核心产品或服务体验');
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('物料依赖循环');
    if (visited.has(id)) return;
    const item = byId.get(id);
    if (!item) throw new Error('物料依赖不存在');
    if (new Set(item.dependencies).size !== item.dependencies.length) throw new Error('物料依赖重复');
    visiting.add(id); item.dependencies.forEach(visit); visiting.delete(id); visited.add(id);
  };
  items.forEach(item => visit(item.id));
  return { productAnchor: { brandId: anchor.brandId, category: text(anchor.category, 200), coreProduct: text(anchor.coreProduct, 300),
    rationale: text(anchor.rationale), ipAssets: list(anchor.ipAssets), translation: text(anchor.translation) },
    ...(deliveryScope === undefined ? {} : { deliveryScope }), scopeNote: text(raw.scopeNote, 2000), items };
}

export function validateMaterialVisuals(value: unknown, plan?: MaterialPlan): MaterialVisual[] {
  if (!Array.isArray(value) || value.length > MAX_MATERIAL_ITEMS) throw new Error('单件视觉计划无效');
  const visuals = value.map((value): MaterialVisual => {
    const item = record(value), ratio = item.aspectRatio;
    if (ratio !== undefined && (typeof ratio !== 'string' || !MATERIAL_ASPECT_RATIOS.includes(ratio as MaterialVisual['aspectRatio'] & string))) throw new Error('单件视觉画幅无效');
    return { materialId: key(item.materialId), prompt: text(item.prompt, 3000),
      ...(ratio === undefined ? {} : { aspectRatio: ratio as MaterialVisual['aspectRatio'] }) };
  });
  const ids = new Set(visuals.map(item => item.materialId));
  if (ids.size !== visuals.length || visuals.length !== (plan?.items.length ?? 0) || plan?.items.some(item => !ids.has(item.id))) throw new Error('单件视觉计划与物料清单不一致');
  return visuals;
}
