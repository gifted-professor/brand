import type { SkillId } from '../collider-types.ts';
import { MATERIAL_CATEGORIES, MATERIAL_PRIORITIES, MATERIAL_ASPECT_RATIOS } from '../material-plan.ts';
import { MAX_MATERIAL_ITEMS } from './material-planning.ts';
// Keep generation constraints aligned with the runtime's result validators. In
// particular, a progress message with an empty section is not a stage result.
// Free-text regex constraints are interpreted as whole-string matches by some CLI decoders.
// Keep whitespace rejection in the runtime instead of accidentally constraining output to one character.
const text = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
const nullableReason = { type: ['string', 'null'], maxLength: 1500 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const handoffSchema = object({ message: text(2400, 20), task: text(2000, 40), blockedReason: nullableReason });
const strings = (maxItems: number, maxLength: number) => ({ type: 'array', maxItems, items: text(maxLength) });
const materialId = { ...text(80), pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' };
const materialPlan = object({
  productAnchor: object({ brandId: { type: 'string', enum: ['a', 'b', 'both'] }, category: text(200), coreProduct: text(300), rationale: text(1200), ipAssets: strings(20, 500), translation: text(1200) }),
  deliveryScope: { type: 'string', enum: ['full_collaboration', 'focused_deliverables'] },
  scopeNote: text(2000),
  items: { type: 'array', minItems: 1, maxItems: MAX_MATERIAL_ITEMS, items: object({ id: materialId, name: text(100),
    category: { type: 'string', enum: Object.keys(MATERIAL_CATEGORIES) }, priority: { type: 'string', enum: Object.keys(MATERIAL_PRIORITIES) },
    role: text(1200), design: text(1200), ipExpression: text(1200),
    dependencies: { type: 'array', maxItems: MAX_MATERIAL_ITEMS, uniqueItems: true, items: materialId },
    variants: strings(20, 500), feasibility: text(1200) }) },
});
export function stageSchema(skill: SkillId, concepts = false, unifiedDesign = false): Record<string, unknown> {
  const card = object({ skill: { type: 'string', enum: [skill] }, title: text(100), summary: text(500),
    points: { type: 'array', items: object({ label: text(40), content: text(800) }), minItems: 1, maxItems: 6 } });
  return object({ message: text(2400, 20), section: text(18000, 100), pendingConfirmations: strings(40, 2000),
    card: { anyOf: [card, { type: 'null' }] }, blockedReason: nullableReason,
    ...(concepts ? { concepts: { type: 'array', minItems: 3, maxItems: 3,
      items: object({ title: text(100), tagline: text(200), description: text(3500), contributionA: text(2000), contributionB: text(2000), consumerValue: text(2000) }) } } : {}),
    ...(unifiedDesign ? { materialPlan } : {}),
    ...(skill === 'visual-production' ? { imagePrompt: text(11000), materialVisuals: { type: 'array', maxItems: MAX_MATERIAL_ITEMS,
      items: object({ materialId, prompt: text(3000), aspectRatio: { type: 'string', enum: MATERIAL_ASPECT_RATIOS } }, ['materialId', 'prompt']) } } : {}),
    ...(skill === 'quality-review' ? { verdict: { type: 'string', enum: ['pass', 'needs_revision', 'needs_input', 'unverified'] } } : {}),
  });
}
