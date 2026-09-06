import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaterialPlan, validateMaterialVisuals } from '../src/server/material-planning.ts';
import { stageSchema } from '../src/server/cli-schema.ts';
import { materialPlanMarkdown } from '../src/material-plan.ts';
import { materialPlanFixture, materialVisualFixtures } from './material-fixture.mjs';

function corePlan({ brandId = 'a', category, coreProduct, itemCategory = 'product', assets, design }) {
  return {
    productAnchor: { brandId, category, coreProduct, rationale: '以双方贡献共同形成用户需要的核心产物。', ipAssets: assets, translation: design },
    scopeNote: '先评估一项核心设计，配套物料在需要时展开，不强加实体周边。',
    items: [{ id: 'material-core', name: coreProduct, category: itemCategory, priority: 'core',
      role: '为目标用户提供具体的使用价值。', design, ipExpression: design, dependencies: [], variants: [], feasibility: '概念设计，具体材质或实施资源待确认。' }],
  };
}

function focusedPosterPlan() {
  const plan = materialPlanFixture();
  plan.deliveryScope = 'focused_deliverables';
  plan.scopeNote = '用户仅要求两张用途不同的数字海报；已确定的声音主题布袋作为设计依据，本轮不重做产品、不新增包装或周边。';
  plan.items = [
    { id: 'poster-launch', name: '产品发布海报', role: '介绍已确定的联名产品及合作主题',
      design: '展示现有布袋外观与声音主题，以发布标题呈现双方贡献。' },
    { id: 'poster-guide', name: '听音使用指引海报', role: '指导已购买用户进入配套听音内容',
      design: '使用已有布袋图形语言组织听音步骤与操作示意。' },
  ].map(item => ({ ...item, category: 'communication', priority: 'core',
    ipExpression: '沿用已确定的织物与自然声音设计主题，不改变现有产品。', dependencies: [], variants: [], feasibility: '只使用既有产品设计及现有听音服务信息。' }));
  return plan;
}

test('a constrained kit may be small; the product brand may be B and variants stay within their family', () => {
  const plan = materialPlanFixture(); plan.productAnchor.brandId = 'b';
  const result = validateMaterialPlan(plan);
  assert.equal(result.items.length, 4);
  assert.equal(result.productAnchor.brandId, 'b');
  assert.deepEqual(result.items[2].variants, ['竖版', '方版']);
});

test('jewelry and unlisted product categories remain free text with a real product at the core', () => {
  const plan = corePlan({ category: '首饰 / 可转换吊坠', coreProduct: '折纸纹理吊坠',
    assets: ['首饰品牌的几何设计语言', '合作设计师的折纸形态'], design: '把折纸折线转成吊坠的立体切面与纹理，保留首饰的佩戴比例。' });
  const result = validateMaterialPlan(plan);
  assert.equal(result.productAnchor.category, '首饰 / 可转换吊坠');
  assert.equal(result.items[0].name, '折纸纹理吊坠');
  assert.equal(result.items[0].category, 'product');
  assert.equal(result.items[0].priority, 'core');
  assert.deepEqual(result.productAnchor.ipAssets, plan.productAnchor.ipAssets);
  assert.equal(stageSchema('design-spec', false, true).properties.materialPlan.properties.productAnchor.properties.category.enum, undefined);
});

test('two physical brands may jointly anchor a product through materials and craft without a fictional IP', () => {
  const plan = corePlan({ brandId: 'both', category: '家居 / 陶瓷灯具', coreProduct: '织纹陶瓷桌灯',
    assets: ['陶艺品牌的釉面与陶瓷造型', '织物品牌的编织纹样'], design: '把织纹的疏密转成陶瓷灯罩的表面节奏，结合双方的形态与材质表达。' });
  const result = validateMaterialPlan(plan);
  assert.equal(result.productAnchor.brandId, 'both');
  assert.deepEqual(result.productAnchor.ipAssets, plan.productAnchor.ipAssets);
  assert.match(materialPlanMarkdown(result), /品牌 A × 品牌 B/);
  assert.match(materialPlanMarkdown(result), /合作资产与设计转译/);
  assert.doesNotMatch(materialPlanMarkdown(result), /品牌 BOTH|IP 特征转译|IP 资产与转译/);
});

test('core services and digital content do not require physical products, packaging or merchandise', () => {
  for (const [itemCategory, category, coreProduct] of [
    ['experience', '文化导览服务', '联合声音导览'],
    ['product', '数字内容 / 音频课程', '城市声音课程'],
  ]) {
    const plan = corePlan({ brandId: 'both', itemCategory, category, coreProduct,
      assets: ['文化机构的讲解内容', '音频平台的听音服务'], design: '将馆藏主题编排成分段声音内容，通过听音界面串联使用路径。' });
    const result = validateMaterialPlan(plan);
    assert.deepEqual(result.items.map(item => item.category), [itemCategory]);
    assert.equal(result.items[0].priority, 'core');
    assert.equal(validateMaterialVisuals(materialVisualFixtures(plan), result).length, 1);
  }
});

test('legacy single-brand anchors and IP field names round-trip without data migration', () => {
  const plan = materialPlanFixture();
  assert.deepEqual(validateMaterialPlan(plan), plan);
  const result = validateMaterialPlan(plan);
  assert.ok(Object.hasOwn(result.productAnchor, 'ipAssets'));
  assert.ok(Object.hasOwn(result.items[0], 'ipExpression'));
  assert.equal(Object.hasOwn(result, 'deliveryScope'), false);
  assert.doesNotMatch(materialPlanMarkdown(result), /限定范围交付/);
});

test('focused delivery accepts two distinct posters without adding the existing product to the deliverables', () => {
  const plan = focusedPosterPlan();
  const result = validateMaterialPlan(plan);
  assert.deepEqual(result, plan);
  assert.deepEqual(result.items.map(item => item.id), ['poster-launch', 'poster-guide']);
  assert.deepEqual(result.items.map(item => item.category), ['communication', 'communication']);
  assert.notEqual(result.items[0].role, result.items[1].role);
  assert.equal(validateMaterialVisuals(materialVisualFixtures(result), result).length, 2);
  const markdown = materialPlanMarkdown(result);
  assert.match(markdown, /限定范围交付，核心为既有设计依据/);
  assert.match(markdown, /共 2 项物料候选/);
  assert.match(markdown, /本轮不重做产品/);
});

test('focused packaging or merchandise work may also use an existing core as design context', () => {
  for (const [category, name, role] of [
    ['packaging', '既有布袋的礼品封套', '组合呈现已有产品'],
    ['merchandise', '布袋随附书签', '延伸已确定的阅读听音场景'],
  ]) {
    const plan = focusedPosterPlan();
    plan.scopeNote = `用户本轮仅要求${name}，已有声音主题布袋只作设计依据。`;
    plan.items = [{ ...plan.items[0], id: 'focused-item', name, role, category, design: `${name}沿用已有产品的纹理与图形语言。` }];
    const result = validateMaterialPlan(plan);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].category, category);
  }
});

test('full collaboration and legacy omitted scope still reject a communication-only plan', () => {
  const plan = focusedPosterPlan();
  plan.deliveryScope = 'full_collaboration';
  assert.throws(() => validateMaterialPlan(plan), /缺少核心产品或服务体验/);
  delete plan.deliveryScope;
  assert.throws(() => validateMaterialPlan(plan), /缺少核心产品或服务体验/);
  const complete = materialPlanFixture();
  complete.deliveryScope = 'full_collaboration';
  assert.deepEqual(validateMaterialPlan(complete), complete);
});

test('delivery scope rejects invalid values and focused plans retain required design context', () => {
  for (const deliveryScope of ['focused', '', null, true, 1, ['focused_deliverables'], {}]) {
    const plan = focusedPosterPlan();
    plan.deliveryScope = deliveryScope;
    assert.throws(() => validateMaterialPlan(plan), /物料交付范围无效/);
  }
  const plan = focusedPosterPlan();
  plan.scopeNote = '';
  assert.throws(() => validateMaterialPlan(plan));
  plan.scopeNote = '用户仅要求两张海报，核心为已有产品。';
  plan.productAnchor.coreProduct = '';
  assert.throws(() => validateMaterialPlan(plan));
});

test('a broad material plan does not truncate at the old five-card presentation limit', () => {
  const plan = materialPlanFixture();
  for (let i = 0; i < 26; i++) plan.items.push({ ...plan.items[2], id: `material-extra-${i}`, name: `独立候选 ${i}` });
  assert.equal(validateMaterialPlan(plan).items.length, 30);
  assert.equal(validateMaterialVisuals(materialVisualFixtures(plan), plan).length, 30);
});

test('plans reject generic-merchandise-only kits, missing design decisions and broken dependency graphs', () => {
  for (const change of [
    ...['packaging', 'communication', 'merchandise'].map(category => p => { p.items[0].category = category; }),
    p => { p.productAnchor.brandId = 'all'; },
    p => { p.items[0].priority = 'optional'; },
    p => { p.items[0].ipExpression = ''; },
    p => { p.items[0].design = ''; },
    p => { p.items[0].category = 'toString'; },
    p => { p.items[1].category = ['packaging']; },
    p => { p.items[1].priority = ['optional']; },
    p => { p.items[0].priority = '__proto__'; },
    p => { p.items[1].id = p.items[0].id; },
    p => { p.items[1].name = p.items[0].name; },
    p => { p.items[0].dependencies = ['material-missing']; },
    p => { p.items[0].dependencies = [p.items[0].id]; },
    p => { p.items[0].dependencies = [p.items[1].id]; },
    p => { p.items[1].dependencies = [p.items[0].id, p.items[0].id]; },
  ]) {
    const plan = materialPlanFixture(); change(plan);
    assert.throws(() => validateMaterialPlan(plan));
  }
});

test('each visual maps to exactly one current material and legacy sessions accept only an empty list', () => {
  const plan = materialPlanFixture(), visuals = materialVisualFixtures(plan);
  assert.deepEqual(validateMaterialVisuals(visuals, plan), visuals);
  assert.throws(() => validateMaterialVisuals(visuals.slice(1), plan));
  assert.throws(() => validateMaterialVisuals([...visuals, visuals[0]], plan));
  assert.throws(() => validateMaterialVisuals([{ ...visuals[0], materialId: 'unknown' }, ...visuals.slice(1)], plan));
  assert.throws(() => validateMaterialVisuals(visuals));
  assert.deepEqual(validateMaterialVisuals([]), []);
});

test('explicit per-material aspect ratios survive validation while absent ratios preserve legacy visuals', () => {
  const plan = materialPlanFixture(), visuals = materialVisualFixtures(plan);
  assert.deepEqual(validateMaterialVisuals(visuals, plan), visuals, 'missing ratios remain absent for the runner 4:3 default');
  for (const aspectRatio of ['1:1', '4:3', '3:4', '4:5', '3:2', '2:3', '16:9', '9:16']) {
    const input = visuals.map((visual, index) => index === 0 ? { ...visual, aspectRatio } : visual);
    assert.deepEqual(validateMaterialVisuals(input, plan), input);
  }
  for (const aspectRatio of ['vertical', '3/4', '5:7', '', ' 3:4', null, 1, ['3:4'], {}]) {
    assert.throws(() => validateMaterialVisuals([{ ...visuals[0], aspectRatio }, ...visuals.slice(1)], plan), /画幅/);
  }
});

test('CLI schemas require the unified design plan and the individual visual list in their actual stages', () => {
  assert.ok(stageSchema('design-spec', false, true).required.includes('materialPlan'));
  const materialPlanSchema = stageSchema('design-spec', false, true).properties.materialPlan;
  assert.deepEqual(materialPlanSchema.properties.productAnchor.properties.brandId.enum, ['a', 'b', 'both']);
  assert.deepEqual(materialPlanSchema.properties.deliveryScope.enum, ['full_collaboration', 'focused_deliverables']);
  assert.ok(materialPlanSchema.required.includes('deliveryScope'));
  assert.ok(!stageSchema('design-spec').required.includes('materialPlan'));
  assert.ok(stageSchema('visual-production').required.includes('materialVisuals'));
});
