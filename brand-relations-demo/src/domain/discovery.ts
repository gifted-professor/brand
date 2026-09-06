import type { Brand, RelationResult } from './types';
import { missingMatchingFields } from './brandIntake';

/** Discovery confidence gates connection clues, without changing the baseline score or weights. */
export function discoverRelations(focus: Brand, relations: readonly RelationResult[]) {
  const missing = missingMatchingFields(focus).length;
  const supported = relations.filter(relation => relation.collaborationFit >= 50 || relation.complementarity > 15)
    .sort((a, b) => b.collaborationFit - a.collaborationFit || a.targetBrandId.localeCompare(b.targetBrandId));
  const visible = missing ? supported.slice(0, Math.max(2, (6 - missing) * 2)) : supported;
  if (visible.length >= 2) return visible;
  const extra = relations.filter(item => !visible.some(found => found.targetBrandId === item.targetBrandId))
    .sort((a, b) => b.collaborationFit - a.collaborationFit || a.targetBrandId.localeCompare(b.targetBrandId))
    .slice(0, 2 - visible.length)
    .map(item => ({ ...item, exploratory: true, reason: '资料尚不足以确认合作方向。这是一条待验证的探索线索，可以先聚焦这个品牌，了解它与其他伙伴的关系。' }));
  return [...visible, ...extra];
}

/** Keep the brand library explorable without treating every candidate as a supported connection. */
export function gravityExplorationRelations(relations: readonly RelationResult[], clues: readonly RelationResult[]): RelationResult[] {
  const known = new Map(clues.map(relation => [relation.targetBrandId, relation]));
  return relations.map(relation => known.get(relation.targetBrandId) ?? {
    ...relation,
    exploratory: true,
    reason: '这个品牌尚未进入当前连接线索。可以先了解它，或聚焦查看它的伙伴；当前分数仅作基线参考。',
  });
}
