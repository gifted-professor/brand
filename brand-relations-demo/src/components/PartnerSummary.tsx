import type { Brand, RelationResult } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { Icon } from './Icon';
import { EvaluationDimensions } from './EvaluationDimensions';


export function PartnerSummary({ brand, relation, isOwner, onChoose }: { brand: Brand; relation?: RelationResult; isOwner: boolean; onChoose: () => void }) {
  return <aside className="inspector brief-inspector" aria-label="伙伴简评"><div className="inspector-content"><div className="summary-avatar"><BrandCharacter brand={brand} /></div><h1>{brand.name}</h1><p className="summary-description">{brand.summary}</p>{relation ? <><div className="fit-score" data-testid="fit-score"><strong>{relation.collaborationFit}</strong><span>/100</span></div><p className="score-caption">智能评价 · 演示评分</p><EvaluationDimensions relation={relation} /><p className="summary-evaluation">{relation.reason}</p></> : <p className="summary-evaluation">{isOwner ? '从关系场中选一位伙伴。' : '以你的品牌为参照查看合作可能。'}</p>}{!isOwner ? <button className="flow-primary" onClick={onChoose}>选择伙伴<Icon name="arrow" /></button> : null}</div></aside>;
}
