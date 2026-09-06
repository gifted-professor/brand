import { useState } from 'react';
import type { Brand, RelationResult } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { Icon } from './Icon';

const QUESTIONS = [
  { title: '消费者为什么需要这个具体产物？', hint: '记录需求证据，以及消费者可能拒绝的原因。' },
  { title: '双方各自得到什么、承担什么？', hint: '明确收益、投入，以及是否接受试验或传播预算。' },
  { title: '谁负责交付与处理问题？', hint: '确认许可、审批、峰值、赠品、退出和维护责任。' },
];
export function MatchNextStep({ home, partner, relation, onBack }: { home: Brand; partner: Brand; relation?: RelationResult; onBack: () => void }) {
  const [answers, setAnswers] = useState(['', '', '']);
  const [confirmed, setConfirmed] = useState(false);
  const [peerConfirmed, setPeerConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  return <main className="match-page">
    <button className="entry-text-button match-back" onClick={onBack}>返回匹配</button>
    <div className="match-intro"><div><h1>{working ? <>一起，把想法<br />变成作品。</> : <>从相遇，<br />到一起创造。</>}</h1><p>{working ? '合作工作区 · 本地演示' : '先确认合作意向，再开启共同创作。'}</p></div><div className="match-pair">{[home, partner].map((brand, index) => <div className="match-person" key={brand.id}>{index ? <span className="match-times" aria-hidden="true">×</span> : null}<BrandCharacter brand={brand} labelled /><strong>{brand.name}</strong><span>{index ? '潜在合作伙伴' : '你的品牌角色'}</span></div>)}</div></div>
    {working ? <section className="local-workspace"><h2>合作方案跟进</h2><p>意向与诊断已带入当前工作区。此处内容仅在本次浏览会话内保留。</p><div className="work-brief">{QUESTIONS.map((q, i) => <div key={q.title}><strong>{q.title}</strong><p>{answers[i].trim() || '待双方共同补充'}</p></div>)}</div><div className="local-messages" role="log" aria-label="方案讨论">{messages.length ? messages.map((text, i) => <p key={i}><strong>{home.name}</strong><span>{text}</span></p>) : <p>记录第一个创意，开始推进方案。</p>}</div><form onSubmit={e => { e.preventDefault(); if (message.trim()) { setMessages(items => [...items, message.trim()]); setMessage(''); } }}><label className="sr-only" htmlFor="discussion-message">记录创意</label><textarea id="discussion-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={3000} placeholder="写下创意、待办或需要共同确认的问题…" required /><button className="flow-primary" disabled={!message.trim()}>记录创意<Icon name="arrow" /></button></form></section> : <>
      <p className="match-opportunity">{relation?.possibleOutcome || partner.summary}</p>
      <div className="match-questions">{QUESTIONS.map((question, index) => <details key={question.title}><summary><span>0{index + 1}</span>{question.title}<Icon name="arrow" /></summary><label>{question.hint}<textarea aria-label={question.title} rows={3} maxLength={3000} value={answers[index]} onChange={e => setAnswers(items => items.map((answer, i) => i === index ? e.target.value : answer))} placeholder="可以先记录已知信息，未知部分留待双方确认。" /></label><p>{answers[index].trim() ? '已记录 · 待共同核实' : '待补充 · 不影响探索'}</p></details>)}</div>
      <div className="match-actions">{!confirmed ? <button className="flow-primary" onClick={() => setConfirmed(true)}>确认我的合作意向<Icon name="arrow" /></button> : <div className="intent-status" role="status"><strong>{peerConfirmed ? '双方意向已确认（演示）' : '你已确认意向，等待对方。'}</strong><p>此演示没有发送邀请；对方状态仅可通过下方按钮模拟。</p>{peerConfirmed ? <button className="flow-primary" onClick={() => setWorking(true)}>进入合作页面<Icon name="arrow" /></button> : <button className="flow-secondary" onClick={() => setPeerConfirmed(true)}>模拟对方确认（演示）</button>}</div>}<p className="draw-note">演示数据 · 尚未发送邀请 · 未连接实时群聊</p></div>
    </>}
  </main>;
}
