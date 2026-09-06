import { useEffect, useState } from 'react';
import type { Brand } from '../domain/types';
import type { Invitation, InvitationAction, InvitationPerspective } from '../domain/invitation';
import { canSendInvitation } from '../domain/invitation';
import { BrandCharacter } from './BrandCharacter';
import { ProposalField, ColliderProposal } from './ProposalAi';
import { Icon } from './Icon';

const STATUS = { draft: '准备预演', pending: '等待对方回应', revision: '对方希望调整', declined: '对方暂不参与', accepted: '双方同意建联', withdrawn: '邀请已撤回' };
const QUESTIONS = ['消费者为什么需要这个具体产物？', '双方各自得到什么、承担什么？', '谁负责交付与处理问题？'];

export function CollaborationInvitation({ home, partner, invitation, dispatch, onBack, localOnly = false }: { localOnly?: boolean; home: Brand; partner: Brand; invitation: Invitation; dispatch: (action: InvitationAction) => void; onBack: () => void }) {
  const [perspective, setPerspective] = useState<InvitationPerspective>('sender');
  const [feedback, setFeedback] = useState('');
  const [handoff, setHandoff] = useState(false);
  const recipient = perspective === 'recipient';
  const editing = invitation.status === 'draft' && !recipient;
  const draft = editing ? invitation.draft : invitation.sentDraft ?? invitation.draft;
  const accepted = invitation.status === 'accepted';
  useEffect(() => { setFeedback(''); }, [invitation.version]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [perspective, invitation.status, handoff]);
  const respond = (response: 'accepted' | 'revision' | 'declined') => dispatch({ type: 'respond', actor: perspective, response, feedback });
  return <main className="invitation-page"><div className="invitation-top"><button className="flow-close" aria-label="返回伙伴详情" onClick={onBack}><Icon name="back" /></button><span className="invitation-version">提案 V{invitation.version}</span><span className="invitation-state" role="status">{STATUS[invitation.status]}</span></div>
    <div className="invitation-heading"><h1>{handoff ? '从这里，开始共创。' : recipient ? `${home.name} 想和你一起做点什么。` : '先让合作，看得见。'}</h1><p>{handoff ? '双方已同意继续沟通。共创界面留待下一阶段。' : recipient ? '先看看这份联名预演，再决定是否继续。' : `${home.name} × ${partner.name}`}</p></div>
    {invitation.status !== 'draft' && !handoff ? <div className="perspective-switch" role="group" aria-label="本地演示视角"><span>本地演示</span><button aria-pressed={!recipient} onClick={() => setPerspective('sender')}>发起方视角</button><button aria-pressed={recipient} onClick={() => setPerspective('recipient')}>接收方视角</button></div> : null}
    <div className="invitation-layout"><section className="proposal-visual" aria-label="带水印的联名预演占位"><span className="preview-not-generated">预演占位 · 暂未生成预演</span><div className="proposal-avatars"><BrandCharacter brand={home} /><span>×</span><BrandCharacter brand={partner} /></div><h2>{draft.title || '你们的联名，会是什么样？'}</h2><p>{draft.concept || '这里将呈现联名产物或体验的预演。'}</p><div className="proposal-watermark" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i}>{accepted ? '概念提案 · 未获商用授权' : '合作提案 · 未经双方确认'}<small>{home.name} → {partner.name} · V{invitation.version}</small></span>)}</div><span className="proposal-visual-footer">{accepted ? '已同意沟通 · 商业及授权待确认' : '仅供受邀方评估 · 不代表已联名'}</span></section>
    <section className="proposal-content">
        <ColliderProposalBoundary localOnly={localOnly} readOnly={!editing} home={home} partner={partner} draft={draft} onApply={next => { for (const field of ['title', 'concept', 'contribution', 'ask'] as const) dispatch({ type: 'edit', field, value: next[field] }); }} />
      {editing ? <form onSubmit={e => { e.preventDefault(); dispatch({ type: 'send', actor: perspective }); }}>
        {invitation.feedback ? <div className="recipient-feedback"><strong>上一版反馈</strong><p>{invitation.feedback}</p></div> : null}
        <ProposalField localOnly={localOnly} label="联名提案名称" field="title" home={home} partner={partner} draft={draft} onApply={value => dispatch({ type: 'edit', field: 'title', value })}><input required maxLength={100} value={draft.title} onChange={e => dispatch({ type: 'edit', field: 'title', value: e.target.value })} placeholder="给这次合作起一个名字" /></ProposalField>
        <ProposalField localOnly={localOnly} label="消费者会得到什么？" field="concept" home={home} partner={partner} draft={draft} onApply={value => dispatch({ type: 'edit', field: 'concept', value })}><textarea required rows={3} maxLength={2000} value={draft.concept} onChange={e => dispatch({ type: 'edit', field: 'concept', value: e.target.value })} placeholder="一个具体产品、体验或内容，会解决什么问题？" /></ProposalField>
        <ProposalField localOnly={localOnly} label="我们愿意带来什么？" field="contribution" home={home} partner={partner} draft={draft} onApply={value => dispatch({ type: 'edit', field: 'contribution', value })}><textarea required rows={2} maxLength={2000} value={draft.contribution} onChange={e => dispatch({ type: 'edit', field: 'contribution', value: e.target.value })} placeholder="我方的创意、资源与投入" /></ProposalField>
        <ProposalField localOnly={localOnly} label="希望邀请对方做什么？" field="ask" home={home} partner={partner} draft={draft} onApply={value => dispatch({ type: 'edit', field: 'ask', value })}><textarea required rows={2} maxLength={2000} value={draft.ask} onChange={e => dispatch({ type: 'edit', field: 'ask', value: e.target.value })} placeholder="提出邀请，不替对方承诺资源" /></ProposalField>
        <details className="proposal-diagnostics"><summary>合作诊断 · 3 个待确认问题</summary>{QUESTIONS.map((q, i) => <ProposalField localOnly={localOnly} key={q} label={q} field={`diagnostic${i}`} home={home} partner={partner} draft={draft} onApply={value => dispatch({ type: 'diagnostic', index: i as 0 | 1 | 2, value })}><textarea rows={2} maxLength={2000} value={draft.diagnostics[i]} onChange={e => dispatch({ type: 'diagnostic', index: i as 0 | 1 | 2, value: e.target.value })} placeholder="写下依据和未知项" /></ProposalField>)}</details>
        <button className="flow-primary" disabled={!canSendInvitation(draft)}>发送预演邀请（演示）<Icon name="arrow" /></button><p className="proposal-note">仅模拟提交邀请，不会实际发送。AI 按钮生成建议，采用后仍可手动修改。</p>
      </form> : <>
        <dl className="proposal-summary"><div><dt>一起做什么</dt><dd>{draft.concept}</dd></div><div><dt>{home.name} 愿意带来</dt><dd>{draft.contribution}</dd></div><div><dt>希望 {partner.name} 参与</dt><dd>{draft.ask}</dd></div></dl>
        <details className="proposal-diagnostics"><summary>查看合作诊断</summary>{QUESTIONS.map((question, i) => <div key={question}><strong>{question}</strong><p>{draft.diagnostics[i] || '待双方共同确认'}</p></div>)}</details>
        {invitation.feedback ? <div className="recipient-feedback"><strong>对方反馈</strong><p>{invitation.feedback}</p></div> : null}
        {invitation.status === 'pending' ? recipient ? <div className="recipient-actions"><label>你的想法<textarea value={feedback} maxLength={2000} rows={3} onChange={e => setFeedback(e.target.value)} placeholder="可以提出修改建议，或说明暂不参与的原因。" /></label><button className="flow-primary" onClick={() => respond('accepted')}>同意建联，进入共创<Icon name="arrow" /></button><div><button className="flow-secondary" disabled={!feedback.trim()} onClick={() => respond('revision')}>希望调整</button><button className="flow-secondary" onClick={() => respond('declined')}>暂不参与</button></div><p className="proposal-note">同意继续沟通，不代表签约或授予品牌商用许可。</p></div> : <div className="invitation-wait"><h2>邀请已提交（演示）</h2><p>等待 {partner.name} 的独立回应。</p><button className="flow-secondary" onClick={() => setPerspective('recipient')}>预演接收方如何查看</button><button className="entry-text-button" onClick={() => dispatch({ type: 'withdraw', actor: perspective })}>撤回这次邀请</button></div> : null}
        {accepted ? <div className="invitation-accepted"><h2>双方愿意，合作才开始。</h2><p>已确认继续沟通意向。具体预算、交付与授权仍待确认。</p>{handoff ? <div className="co-creation-boundary" role="status">共创入口已解锁 · 界面暂不展开</div> : <button className="flow-primary" onClick={() => setHandoff(true)}>进入共创<Icon name="arrow" /></button>}</div> : null}
        {['revision', 'declined', 'withdrawn'].includes(invitation.status) ? <div className="invitation-wait"><p>{invitation.status === 'declined' ? '本次邀请结束，预演继续保留未确认标记。' : invitation.status === 'withdrawn' ? '本次邀请已失效，对方无法接受。' : '当前提案还未达成一致，可修改后重新邀请。'}</p>{!recipient ? <button className="flow-secondary" onClick={() => dispatch({ type: 'revise', actor: perspective })}>准备新版本</button> : null}</div> : null}
        <p className="proposal-note">本地交互演示 · 未向任何品牌发送内容</p>
      </>}
    </section></div></main>;
}

function ColliderProposalBoundary(props: React.ComponentProps<typeof ColliderProposal> & { localOnly: boolean }) {
  const { localOnly, ...proposalProps } = props;
  return localOnly ? <p className="proposal-note">本地实验：可用智能建议编辑邀请，内容仅保留在本次页面内。</p> : <ColliderProposal {...proposalProps} />;
}
