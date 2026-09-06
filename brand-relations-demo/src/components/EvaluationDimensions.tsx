import type { Dimension, RelationResult } from '../domain/types';
import { RELATION_WEIGHTS } from '../config';

const DIMENSIONS: readonly [Dimension, string][] = [
  ['intentFit', '目标契合'],
  ['complementarity', '能力互补'],
  ['audienceExpansion', '受众拓展'],
  ['chemistry', '创意共鸣'],
  ['feasibility', '执行可行'],
];

export function EvaluationDimensions({ relation }: { relation: RelationResult }) {
  return <div className="evaluation-dimensions" aria-label="合作评价维度">
    {DIMENSIONS.map(([key, label]) => <div className="evaluation-dimension" key={key} title={`${label}: ${relation[key]}/100 · ${RELATION_WEIGHTS[key] * 100}% 权重`}>
      <span>{label}</span>
      <meter min={0} max={100} value={relation[key]} aria-label={label} />
      <span>{relation[key]}</span>
    </div>)}
  </div>;
}
