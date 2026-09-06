export const materialPlanFixture = () => ({
  productAnchor: { brandId: 'a', category: '日常织物', coreProduct: '库存织物声音主题布袋', rationale: '用品牌已有的布袋承载自然声音主题。', ipAssets: ['山间音频的自然声音内容'], translation: '通过库存布料纹理和装载场景表达山林声音，不新增印刷。' },
  scopeNote: '受不新增印刷约束，本轮仅列四项候选；不要求凑足默认数量。',
  items: [
    ['material-bag', '声音主题布袋', 'product', 'core', []],
    ['material-wrap', '复用素色包装', 'packaging', 'recommended', ['material-bag']],
    ['material-poster', '数字发布海报', 'communication', 'recommended', ['material-bag']],
    ['material-audio', '线上听音体验', 'experience', 'optional', ['material-bag']],
  ].map(([id, name, category, priority, dependencies]) => ({ id, name, category, priority, dependencies,
    role: `${name}服务于日常听音场景`, design: `${name}使用原色织物与声波的节奏关系，无新增实体印刷`,
    ipExpression: '把自然声音的节奏转成画面疏密及使用场景', variants: id === 'material-poster' ? ['竖版', '方版'] : [], feasibility: '库存资源与声音素材范围待确认，不新增印刷' })),
});
export const materialVisualFixtures = (plan = materialPlanFixture()) => plan.items.map(item => ({ materialId: item.id, prompt: `${item.name}独立概念效果图；${item.design}；自然声音主题。AI CONCEPT · UNOFFICIAL COLLABORATION.` }));
