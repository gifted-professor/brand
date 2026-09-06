import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffSchema, stageSchema } from '../src/server/cli-schema.ts';
import { MAX_MATERIAL_ITEMS, validateMaterialPlan, validateMaterialVisuals } from '../src/server/material-planning.ts';
import { materialPlanFixture } from './material-fixture.mjs';
import { RATIOS } from '../src/providers/openai-image-provider.ts';

function boundedText(schema, limit, minimum = 1) {
  assert.equal(schema.type, 'string');
  assert.equal(schema.minLength, minimum);
  assert.equal(schema.maxLength, limit);
  assert.equal(schema.pattern, undefined, 'free text must not be constrained by a regex decoder that treats the pattern as a full match');
}

test('free-text generation has no single-character regex while material IDs keep anchored validation', () => {
  const schemas = [handoffSchema, stageSchema('brand-profile'), stageSchema('collab-ideation', true),
    stageSchema('design-spec', false, true), stageSchema('visual-production'), stageSchema('quality-review')];
  const patternedPaths = [];
  function visit(value, path) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'pattern')) {
      assert.match(path, /(?:\.properties\.(?:id|materialId)|\.properties\.dependencies\.items)$/);
      assert.equal(value.pattern, '^[a-zA-Z0-9][a-zA-Z0-9_-]*$');
      patternedPaths.push(path);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
  schemas.forEach((schema, index) => visit(schema, `schema-${index}`));
  assert.equal(patternedPaths.length, 3, 'item ID, dependency ID and material visual ID retain their format checks');
});

test('a progress-only response cannot satisfy the stage section contract', () => {
  // Regression: Grok returned this placeholder as its final structured output.
  const placeholder = { message: "I'll read the full offloaded brief first so the B-side profile stays inside the given contract.", section: '', pendingConfirmations: [] };
  const schema = stageSchema('brand-profile');
  assert.ok(schema.required.includes('section'));
  assert.ok(placeholder.section.length < schema.properties.section.minLength);
  boundedText(schema.properties.message, 2400, 20);
  boundedText(schema.properties.section, 18000, 100);
  assert.equal(schema.properties.pendingConfirmations.maxItems, 40);
  boundedText(schema.properties.pendingConfirmations.items, 2000);
});

test('handoff and optional presentation card limits agree with runtime acceptance', () => {
  boundedText(handoffSchema.properties.message, 2400, 20);
  boundedText(handoffSchema.properties.task, 2000, 40);
  assert.deepEqual(handoffSchema.properties.blockedReason.type, ['string', 'null']);
  assert.equal(handoffSchema.properties.blockedReason.maxLength, 1500);
  const schema = stageSchema('brand-profile');
  const card = schema.properties.card.anyOf.find(value => value.type === 'object').properties;
  assert.ok(schema.properties.card.anyOf.some(value => value.type === 'null'));
  boundedText(card.title, 100);
  boundedText(card.summary, 500);
  assert.equal(card.points.minItems, 1);
  assert.equal(card.points.maxItems, 6);
  boundedText(card.points.items.properties.label, 40);
  boundedText(card.points.items.properties.content, 800);
});

test('final ideation requires exactly three fully bounded concepts', () => {
  const concepts = stageSchema('collab-ideation', true).properties.concepts;
  assert.equal(concepts.minItems, 3);
  assert.equal(concepts.maxItems, 3);
  for (const [field, limit] of Object.entries({ title: 100, tagline: 200, description: 3500, contributionA: 2000, contributionB: 2000, consumerValue: 2000 })) {
    boundedText(concepts.items.properties[field], limit);
  }
  assert.equal(stageSchema('collab-ideation').properties.concepts, undefined);
});

test('material generation text boundaries are accepted by the production validator', () => {
  const schema = stageSchema('design-spec', false, true).properties.materialPlan.properties;
  const plan = materialPlanFixture();
  plan.deliveryScope = 'full_collaboration';
  plan.items = [plan.items[0]];
  const fields = [
    [schema.productAnchor.properties, plan.productAnchor, { category: 200, coreProduct: 300, rationale: 1200, translation: 1200 }],
    [schema, plan, { scopeNote: 2000 }],
    [schema.items.items.properties, plan.items[0], { name: 100, role: 1200, design: 1200, ipExpression: 1200, feasibility: 1200 }],
  ];
  for (const [properties, record, limits] of fields) {
    for (const [field, limit] of Object.entries(limits)) {
      boundedText(properties[field], limit);
      record[field] = '字'.repeat(limit);
      assert.doesNotThrow(() => validateMaterialPlan(plan));
      record[field] += '字';
      assert.throws(() => validateMaterialPlan(plan));
      record[field] = record[field].slice(0, limit);
    }
  }
  for (const [listSchema, record, name] of [
    [schema.productAnchor.properties.ipAssets, plan.productAnchor, 'ipAssets'],
    [schema.items.items.properties.variants, plan.items[0], 'variants'],
  ]) {
    assert.equal(listSchema.maxItems, 20);
    boundedText(listSchema.items, 500);
    record[name] = Array.from({ length: 20 }, () => '字'.repeat(500));
    assert.doesNotThrow(() => validateMaterialPlan(plan));
    record[name].push('额外项目');
    assert.throws(() => validateMaterialPlan(plan));
    record[name].pop();
  }
});

test('material IDs, dependency size, and visual prompt bounds match the validators', () => {
  const planSchema = stageSchema('design-spec', false, true).properties.materialPlan.properties;
  const item = planSchema.items.items.properties;
  assert.equal(planSchema.items.minItems, 1);
  assert.equal(planSchema.items.maxItems, MAX_MATERIAL_ITEMS);
  assert.equal(item.id.maxLength, 80);
  const idPattern = new RegExp(item.id.pattern);
  assert.equal(idPattern.test('material-01_variant'), true);
  for (const id of ['../file', '-material', '含中文ID', 'material 1']) assert.equal(idPattern.test(id), false);
  assert.equal(item.dependencies.maxItems, MAX_MATERIAL_ITEMS);
  assert.equal(item.dependencies.uniqueItems, true);
  assert.deepEqual(item.dependencies.items, item.id);

  const visual = stageSchema('visual-production').properties;
  boundedText(visual.imagePrompt, 11000);
  assert.equal(visual.materialVisuals.maxItems, MAX_MATERIAL_ITEMS);
  assert.deepEqual(visual.materialVisuals.items.properties.materialId, item.id);
  boundedText(visual.materialVisuals.items.properties.prompt, 3000);
  assert.deepEqual(visual.materialVisuals.items.properties.aspectRatio, { type: 'string', enum: RATIOS });
  assert.deepEqual(visual.materialVisuals.items.required, ['materialId', 'prompt'], 'explicit ratio is optional for legacy visual plans');
  const plan = materialPlanFixture();
  const visuals = plan.items.map(item => ({ materialId: item.id, prompt: '字'.repeat(3000) }));
  assert.doesNotThrow(() => validateMaterialVisuals(visuals, plan));
  visuals[0].prompt += '字';
  assert.throws(() => validateMaterialVisuals(visuals, plan));
});
