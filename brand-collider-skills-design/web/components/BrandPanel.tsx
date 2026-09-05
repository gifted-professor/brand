import { ArrowLeftRight, FileText, Info, Pencil, Plus } from 'lucide-react';
import type { Brand } from '../../src/collider-types';
import '../panels.css';

export type BrandPanelProps = {
  brands: [Brand, Brand];
  onChange: (brands: [Brand, Brand]) => void;
  goal: string;
  onGoalChange: (value: string) => void;
  constraints: string[];
  onEditBrand: (id: 'a' | 'b') => void;
  disabled: boolean;
};

export function BrandPanel({ brands, goal, onGoalChange, constraints, onEditBrand, disabled }: BrandPanelProps) {
  return (
    <aside className="brand-panel" aria-label="项目上下文">
      <div className="panel-eyebrow">项目上下文 <span>CONTEXT</span></div>
      <h2>参与碰撞的品牌</h2>

      <div className="brand-panel__brands">
        {brands.map((brand, index) => (
          <article className={`brand-panel__card brand-panel__card--${brand.id}`} key={brand.id}>
            <div className="brand-panel__card-top">
              <span className="brand-panel__monogram" aria-hidden="true">{brand.name.trim().charAt(0).toUpperCase() || (index === 0 ? 'A' : 'B')}</span>
              <span className="brand-panel__agent">AGENT {brand.id.toUpperCase()}</span>
              <button
                className="brand-panel__edit"
                type="button"
                title={`编辑${brand.name || `品牌 ${brand.id.toUpperCase()}`}及上传资料`}
                aria-label={`编辑${brand.name || `品牌 ${brand.id.toUpperCase()}`}及上传资料`}
                onClick={() => onEditBrand(brand.id)}
                disabled={disabled}
              ><Pencil size={14} strokeWidth={1.7} /></button>
            </div>
            <h3>{brand.name || `品牌 ${brand.id.toUpperCase()}`}</h3>
            <p className="brand-panel__description">{brand.description || '添加品牌介绍、价值理念与产品信息，让 Agent 更了解自己的品牌。'}</p>
            <button className="brand-panel__source" type="button" disabled={disabled} onClick={() => onEditBrand(brand.id)}>
              {brand.files.length > 0 ? <FileText size={12} /> : <Plus size={12} />}
              {brand.files.length > 0 ? `${brand.files.length} 份品牌资料` : '上传品牌资料'}
            </button>
          </article>
        ))}
        <span className="brand-panel__connector" aria-hidden="true"><ArrowLeftRight size={14} strokeWidth={1.6} /></span>
      </div>

      <div className="brand-panel__brief">
        <label htmlFor="collaboration-goal">这次想做什么<span>PROJECT BRIEF</span></label>
        <textarea
          id="collaboration-goal"
          value={goal}
          onChange={(event) => onGoalChange(event.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="比如：为年轻消费者打造一个有记忆点的夏日联名。"
          maxLength={3000}
        />
      </div>

      <div className="brand-panel__standards">
        <div className="brand-panel__label">合作标准 <span>{constraints.length.toString().padStart(2, '0')}</span></div>
        {constraints.length > 0 ? (
          <div className="brand-panel__chips">
            {constraints.map((constraint, index) => <span key={`${index}-${constraint}`}>{constraint}</span>)}
          </div>
        ) : <p className="brand-panel__no-standards">在对话中补充预算、受众或其他标准。</p>}
      </div>

      <div className="brand-panel__helper">
        <Info size={14} strokeWidth={1.6} />
        <p>两个 Agent 将分别站在各自品牌的立场，调用 Skill、交换观点。你可以随时加入，推动下一轮碰撞。</p>
      </div>
    </aside>
  );
}
