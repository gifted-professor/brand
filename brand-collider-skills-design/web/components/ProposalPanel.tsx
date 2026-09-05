import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, ImagePlus, LoaderCircle, Sparkles } from 'lucide-react';
import { SKILLS, type Session } from '../../src/collider-types';
import '../panels.css';

export type ProposalPanelProps = {
  session: Session | null;
  onSelect: (id: string) => void;
  onExport: () => void;
  onImage: () => void;
  imageBusy: boolean;
  onViewCanvas: () => void;
};

export function ProposalPanel({ session, onSelect, onExport, onImage, imageBusy, onViewCanvas }: ProposalPanelProps) {
  const proposal = session?.proposal;
  const concepts = session?.concepts ?? [];
  const canSelect = session?.status === 'awaiting_selection' || session?.status === 'completed';
  const canGenerateImage = !!proposal?.imagePrompt && !!session?.selectedConceptId && session.mode === 'live' && session.status === 'completed' && session.completedSkills.includes('design-spec') && session.completedSkills.includes('quality-review') && !imageBusy;
  const live = session?.status === 'running';
  const hasOutput = !!proposal || concepts.length > 0;
  const statusText = live ? '正在生成' : session?.status === 'awaiting_selection' ? '待选方向' : session?.status === 'completed' ? '已完成' : session?.status === 'paused' ? '已暂停' : session?.status === 'error' ? '已中断' : '等待开始';

  return (
    <aside className="proposal-panel" aria-label="联名方案产出画布">
      <div className="proposal-panel__header">
        <div><div className="panel-eyebrow">成果空间 <span>OUTPUT</span></div><h2>产出画布<span className="proposal-panel__asterisk">✳</span></h2></div>
        <span className={`proposal-panel__status${live ? ' is-live' : ''}`}><i />{statusText}</span>
      </div>

      <div className="proposal-panel__scroll">
        <div className="proposal-panel__progress" aria-label="六个 Skill 执行进度">
          <div className="proposal-panel__progress-heading"><span>从理解到落地</span><span>{session?.completedSkills.length ?? 0} / 6</span></div>
          <div className="proposal-panel__steps">
            {SKILLS.map((skill) => {
              const done = session?.completedSkills.includes(skill.id);
              const active = !done && session?.activeSkill === skill.id && live;
              return <div key={skill.id} className={`proposal-panel__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`} title={skill.description} aria-label={`${skill.name}：${done ? '已完成' : active ? '正在进行' : '待开始'}`}>
                <span className="proposal-panel__step-dot">{done && <Check size={9} strokeWidth={2.5} />}</span>{skill.name}
              </div>;
            })}
          </div>
        </div>

        {!hasOutput && <div className="proposal-panel__empty">
          <div className="proposal-panel__paper-stack" aria-hidden="true">
            <div className="proposal-panel__back-paper" />
            <div className="proposal-panel__front-paper"><span className="proposal-panel__paper-spark">✳</span><i /><i /><i /><div><span /><span /></div></div>
            <span className="proposal-panel__paper-dot" />
          </div>
          <h3>好的创意，正在路上</h3>
          <p>品牌的每一次对话，<br />都会让联名方案更近一步。</p>
          <span className="proposal-panel__empty-note">IDEAS TAKE SHAPE HERE</span>
        </div>}

        {concepts.length > 0 && <details className="proposal-panel__directions" open={!proposal}>
          <summary className="proposal-panel__section-heading"><h3>{session?.selectedConceptId ? '创意方向' : '选择一个方向'}</h3><span>{concepts.length} 个提案</span><ChevronDown size={13} /></summary>
          <p className="proposal-panel__section-intro">{canSelect ? '选中最有共鸣的想法，继续把它变成完整方案。' : 'Agent 正在完善合作方向。'}</p>
          {concepts.map((concept, index) => {
            const selected = session?.selectedConceptId === concept.id;
            return <button key={concept.id} type="button" className={`proposal-panel__concept${selected ? ' is-selected' : ''}`} disabled={!canSelect} onClick={() => onSelect(concept.id)} aria-pressed={selected}>
              <span className="proposal-panel__concept-top"><span className="proposal-panel__concept-index">DIRECTION {String(index + 1).padStart(2, '0')}</span><span className="proposal-panel__radio">{selected && <Check size={11} />}</span></span>
              <strong>{concept.title}</strong>
              <span className="proposal-panel__tagline">{concept.tagline}</span>
              <span className="proposal-panel__concept-description">{concept.description}</span>
              <span className="proposal-panel__contribution"><b className="is-a">A</b><span>{concept.contributionA}</span></span>
              <span className="proposal-panel__contribution"><b className="is-b">B</b><span>{concept.contributionB}</span></span>
              {concept.consumerValue && <span className="proposal-panel__value">消费者获得 · {concept.consumerValue}</span>}
            </button>;
          })}
        </details>}

        {proposal && <section className="proposal-panel__result" aria-labelledby="proposal-title">
          <div className="proposal-panel__result-label"><span>COLLABORATION PROPOSAL</span><span>V{session?.revision ?? 1}</span></div>
          <h3 id="proposal-title">{proposal.title}</h3>
          <p className="proposal-panel__summary">{proposal.summary}</p>
          {proposal.reviewStatus && <span className={`proposal-panel__review is-${proposal.reviewStatus}`}><span />{proposal.reviewStatus === 'passed' ? '已完成方案审查' : proposal.reviewStatus === 'needs_revision' ? '文本审查发现待完善内容' : '图像尚待人工检查'}</span>}

          <div className="proposal-panel__sections">
            {proposal.sections.map((section, index) => <details className="proposal-panel__section" key={`${section.skill}-${index}`} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{section.title}</strong><ChevronDown size={14} /></summary>
              <div className="proposal-panel__section-content">{section.content}</div>
            </details>)}
          </div>

          {proposal.pendingConfirmations.length > 0 && <details className="proposal-panel__pending" open>
            <summary>需要进一步确认 <span>{proposal.pendingConfirmations.length}</span><ChevronDown size={13} /></summary>
            <ul>{proposal.pendingConfirmations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </details>}

          <div className="proposal-panel__visual">
            <div className="proposal-panel__section-heading"><h3>视觉概念</h3><span>VISUAL</span></div>
            {proposal.imageUrl ? <img className="proposal-panel__image" src={proposal.imageUrl} alt={`${proposal.title}的联名视觉概念`} /> : <div className="proposal-panel__image-placeholder"><ImagePlus size={24} strokeWidth={1.1} /><span>让联名想法被看见</span><small>根据当前方案生成概念视觉</small></div>}
            {proposal.imagePrompt && <details className="proposal-panel__image-prompt"><summary>查看视觉描述<ChevronDown size={12} /></summary><p>{proposal.imagePrompt}</p></details>}
            {proposal.imageUrl ? <a className="proposal-panel__image-button" href={proposal.imageUrl} target="_blank" rel="noreferrer">打开概念视觉<ArrowUpRight size={14} /></a> : <>
              <button className="proposal-panel__image-button" type="button" onClick={onImage} disabled={!canGenerateImage}>
                {imageBusy ? <LoaderCircle className="proposal-panel__spinner" size={14} /> : <Sparkles size={14} />}{imageBusy ? '正在生成视觉…' : '生成概念视觉'}
              </button>
              {session?.mode === 'demo' && <p className="proposal-panel__image-note">演示模式不调用生图服务</p>}
            </>}
          </div>
        </section>}
      </div>

      <div className="proposal-panel__footer">
        {hasOutput ? <>
          <button className="proposal-panel__export" type="button" onClick={onExport}><ArrowDownToLine size={15} />导出{proposal ? '联名方案' : '创意方向'}</button>
          <button className="proposal-panel__full-view" type="button" onClick={onViewCanvas}>展开完整画布<ArrowUpRight size={13} /></button>
        </> : <p><span />随着对话实时更新</p>}
      </div>
    </aside>
  );
}
