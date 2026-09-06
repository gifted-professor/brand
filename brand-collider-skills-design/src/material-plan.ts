export const MATERIAL_CATEGORIES = {
  product: '主营产品', packaging: '包装与随附', communication: '传播物料', merchandise: '延伸周边', experience: '场景与体验',
} as const;
export const MATERIAL_PRIORITIES = { core: '核心项', recommended: '推荐项', optional: '可选项' } as const;
export const MATERIAL_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '4:5', '3:2', '2:3', '16:9', '9:16'] as const;

export type MaterialItem = {
  id: string; name: string; category: keyof typeof MATERIAL_CATEGORIES; priority: keyof typeof MATERIAL_PRIORITIES;
  // Legacy field name: covers all collaboration assets, including non-IP contributions.
  role: string; design: string; ipExpression: string; dependencies: string[]; variants: string[]; feasibility: string;
};
export type MaterialPlan = {
  // Keep ipAssets for saved-session compatibility; assets may come from either or both partners.
  productAnchor: { brandId: 'a' | 'b' | 'both'; category: string; coreProduct: string; rationale: string; ipAssets: string[]; translation: string };
  // Historical plans omit this field and retain full-collaboration validation.
  deliveryScope?: 'full_collaboration' | 'focused_deliverables';
  scopeNote: string; items: MaterialItem[];
};
export type MaterialVisual = { materialId: string; prompt: string; aspectRatio?: typeof MATERIAL_ASPECT_RATIOS[number] };

export function materialItemMarkdown(item: MaterialItem, visual?: MaterialVisual): string {
  return [`### ${item.name}`, `${MATERIAL_CATEGORIES[item.category]} · ${MATERIAL_PRIORITIES[item.priority]} · 候选方案`,
    `物料编号：${item.id}`, `**用途与消费者价值**\n${item.role}`, `**产品与体验设计**\n${item.design}`,
    `**合作资产与设计转译**\n${item.ipExpression}`, `**执行条件**\n${item.feasibility}`,
    ...(item.variants.length ? [`**款式 / 配色 / 尺寸变体**\n${item.variants.join('；')}`] : []),
    ...(item.dependencies.length ? [`**依赖物料**\n${item.dependencies.join('、')}`] : []),
    ...(visual ? [`**单件效果图提示词 · 待生成**\n${visual.prompt}`] : []),
  ].join('\n\n');
}

export function materialPlanMarkdown(plan: MaterialPlan, visuals: MaterialVisual[] = [], brandNames?: { a: string; b: string }): string {
  const anchor = plan.productAnchor;
  const names = brandNames ?? { a: '品牌 A', b: '品牌 B' };
  const anchorName = anchor.brandId === 'both' ? `${names.a} × ${names.b}` : names[anchor.brandId];
  return [...(plan.deliveryScope === 'focused_deliverables' ? ['**限定范围交付，核心为既有设计依据**'] : []),
    `**核心产品与体验**\n${anchor.coreProduct}（${anchorName} · ${anchor.category}）`,
    anchor.rationale, `**合作资产与设计转译**\n${anchor.ipAssets.join('、')}\n${anchor.translation}`, plan.scopeNote,
    `共 ${plan.items.length} 项物料候选；款式、配色与尺寸变体单列。优先级是制作建议，尚未表示选定、已生成或可交付。`,
    ...plan.items.map(item => materialItemMarkdown(item, visuals.find(visual => visual.materialId === item.id))),
  ].join('\n\n');
}
