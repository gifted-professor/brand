import { BrandCharacter } from './BrandCharacter';
import { BrandVisualKey } from './BrandVisualKey';
import { chineseLabel } from '../domain/chinese';
import type { Brand, RelationResult } from '../domain/types';
import { EvaluationDimensions } from './EvaluationDimensions';
import { missingMatchingFields } from '../domain/brandIntake';
import { Icon } from './Icon';
export function RelationInspector({ focus, target, relation, count, onMatch }: {
  focus: Brand; target: Brand; relation?: RelationResult; count: number;
  onMatch?: () => void;
}) {
  const limited = missingMatchingFields(focus).length > 0 || missingMatchingFields(target).length > 0;
  const isCurrent = target.id === focus.id;
  return <aside className="inspector" aria-label="合作关系评价" data-selected-id={target.id}>
    <div className="inspector-content">
      <div className="inspector-identity"><BrandCharacter brand={target} labelled/><div><p className="mono inspector-label">智能评价</p><BrandVisualKey brand={target} compact/></div></div>
      <div className="relation-pair">{!isCurrent ? <><span>{focus.name}</span><Icon name="arrow" /></> : null}<strong>{target.name}</strong></div>
      {relation ? <>
        <div className="fit-score" data-testid="fit-score"><strong>{relation.collaborationFit}</strong><span>/100</span></div>
        <p className="score-caption">{relation.exploratory ? '探索线索 · 尚待验证 · 基线参考' : limited ? '资料待补充 · 基线参考' : '智能合作评价'}</p>
        <p className="relation-type">{relation.exploratory ? '先认识，再判断' : chineseLabel(relation.relationType)}</p>
        <section className="explanation compact-summary"><h2>品牌概括</h2><p>{target.summary}</p></section>
        <section className="explanation compact-summary"><h2>关系判断</h2><p>{relation.reason}</p></section>
        <EvaluationDimensions relation={relation} />
      </> : <section className="explanation"><h2>{onMatch ? '已聚焦这个伙伴' : '当前品牌'}</h2><p>{target.summary}</p></section>}
    </div>
    <div className="inspector-actions">
      {onMatch ? <button className="flow-primary inspector-match" onClick={onMatch}>选择这个伙伴<Icon name="arrow" /></button> : null}
      <p className="world-meta mono">演示品牌库 · {count} 个品牌 · 评分仅供参考</p>
    </div>
  </aside>;
}
