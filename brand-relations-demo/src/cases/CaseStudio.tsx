import { useId, useState } from 'react';
import { BrandCharacter } from '../components/BrandCharacter';
import { allBrands, byId, drawExampleDeck, memory, partners, referenceCases } from './caseData';
import type { ExampleBrand, Opportunity } from './caseData';
import '../components/characters.css';
import './cases.css';

function Portrait({ brand, name = true }: { brand: ExampleBrand; name?: boolean }) {
  return <div className="cs-person"><BrandCharacter brand={brand} labelled={name} />{name ? <><strong>{brand.name}</strong><small>{brand.shortRole}</small></> : null}</div>;
}

function BrandSheet({ brand }: { brand: ExampleBrand }) {
  const fields = [['品牌身份', brand.identity], ['受众', brand.audience], ['已有能力', brand.offers], ['正在寻找', brand.intent], ['执行条件', brand.execution], ['限制', brand.constraints]];
  return <div className="cs-profile"><Portrait brand={brand} /><div><p>{brand.summary}</p><p className="cs-caption">{brand.avatarNote}</p><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '尚未提供'}</dd></div>)}</dl></div></div>;
}

function OpportunityDetail({ item }: { item: Opportunity }) {
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState(`你好，我是 Memory Block。想邀请你们一起聊聊「${item.title}」。我们可以先确认各方贡献与最关键的未知，再决定是否继续。`);
  const headingId = useId();
  const members = [memory, ...item.partnerIds.map(id => byId.get(id)!)];
  return <section className="cs-detail" aria-labelledby={headingId}>
    <div className="cs-detail-top"><span className="cs-eyebrow">{members.length} 个品牌 / 一个合作假设</span><span className={`cs-verdict ${item.partnerIds.includes('heavy-form') ? 'is-caution' : ''}`}>{item.verdict}</span></div>
    <div className="cs-opportunity">
      <div className="cs-stage"><div className="cs-stage-orbit" /><div className={`cs-team size-${members.length}`}>{members.map(brand => <Portrait key={brand.id} brand={brand} />)}</div><p>Memory Block + {item.partnerIds.length} 位伙伴</p></div>
      <div className="cs-story"><p className="cs-eyebrow">合作可能</p><h2 id={headingId}>{item.title}</h2><p className="cs-subtitle">{item.subtitle}</p><p className="cs-why">{item.why}</p><ul>{item.roles.map(role => <li key={role}>{role}</li>)}</ul></div>
    </div>
    <div className="cs-diagnostics">{['消费者为什么需要？', '各方得到与承担什么？', '谁交付，谁处理问题？'].map((title, index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{item.diagnostics[index]}</p></article>)}</div>
    <div className="cs-next"><div><span className="cs-eyebrow">下一步小规模验证</span><p>{item.next}</p></div><div className="cs-actions"><button onClick={() => setSaved(!saved)} aria-pressed={saved}>{saved ? '已收藏 · 本次会话' : '收藏这个方向'}</button><button className="cs-primary" onClick={() => setPreview(!preview)} aria-expanded={preview}>{preview ? '收起邀请草稿' : '预览合作邀请 ↗'}</button></div></div>
    {preview ? <div className="cs-invite"><h3>合作邀请草稿</h3><p>收件品牌：{members.slice(1).map(b => b.name).join('、')}。这只是本地预览，没有发送消息。</p><label htmlFor={`${headingId}-draft`}>你想先聊什么？</label><textarea id={`${headingId}-draft`} value={draft} onChange={event => setDraft(event.target.value)} rows={4} /><div className="cs-response-preview">{members.map((b, i) => <span key={b.id}>{b.name} · {i === 0 ? '你的草稿' : '尚未收到邀请'}</span>)}</div><p>真实流程中，各品牌分别确认愿意交流后，才进入共同合作空间。</p></div> : null}
    <details className="cs-members"><summary>查看成员六因子与 角色 依据</summary>{members.map(b => <BrandSheet key={b.id} brand={b} />)}</details>
    <p className="cs-disclaimer">虚构合作场景 · 方向与条件用于产品演示，成员意向均未确认。没有为这些案例生成成功率或实证适配分。</p>
  </section>;
}

export default function CaseStudio() {
  const [tab, setTab] = useState<'cases' | 'draw' | 'brands'>('cases');
  const [caseIndex, setCaseIndex] = useState(1);
  const [count, setCount] = useState(2);
  const [deck, setDeck] = useState<Opportunity[]>(() => drawExampleDeck(2));
  const [revealed, setRevealed] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  function newDeck(next = count) { setCount(next); setDeck(drawExampleDeck(next)); setRevealed(null); setRound(r => r + 1); }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ fictional: true, note: 'Memory Block 沿用原始示例，伙伴与合作条件均为虚构。角色 使用现有能力映射规则。', mainBrand: memory, partners, referenceCases }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'memory-block-reference-cases.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="cs-shell">
    <header className="cs-header"><a href="/" className="cs-logo"><span>✳</span> 品牌联名</a><span className="cs-edition">Memory Block / 合作案例集</span><div><button onClick={exportData}>下载案例数据 ↓</button><a href="/">打开引力匹配 ↗</a></div></header>
    <section className="cs-hero"><div><p className="cs-eyebrow">虚构品牌，具体的合作可能</p><h1>从你的品牌出发，<br /><em>看看可以一起做什么。</em></h1><p>6 位虚构伙伴，4 个合作样例。先看形象，再看彼此的贡献。</p></div><aside className="cs-you"><Portrait brand={memory} name={false} /><div><span className="cs-eyebrow">你的品牌</span><h2>Memory Block</h2><p>概念设计 · 产品设计 · 原型探索</p><small>正在寻找：材料、小批量制造与渠道</small></div></aside></section>
    <nav className="cs-tabs" aria-label="案例展示模式">{([['cases', '合作参考'], ['draw', '随机抽卡'], ['brands', '伙伴图鉴']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}>{label}<span>{id === 'cases' ? '04' : id === 'brands' ? '06' : '↗'}</span></button>)}<p>本地样例 · 新伙伴全部虚构</p></nav>
    {tab === 'cases' ? <><div className="cs-case-picker" aria-label="合作参考案例">{referenceCases.map((item, index) => <button key={item.id} onClick={() => setCaseIndex(index)} aria-pressed={caseIndex === index}><span>0{index + 1} / {item.partnerIds.length + 1} 方</span><strong>{item.title}</strong></button>)}</div><OpportunityDetail key={referenceCases[caseIndex].id} item={referenceCases[caseIndex]} /></> : null}
    {tab === 'draw' ? <section className="cs-draw"><div className="cs-draw-heading"><div><p className="cs-eyebrow">随机相遇 / 轮次 {String(round).padStart(2, '0')}</p><h2>先选形象，再揭晓伙伴。</h2><p>你始终是 Memory Block。一个伙伴组合包包含另外两个或三个品牌。</p></div><div className="cs-draw-controls"><label>合作总人数<select value={count} onChange={event => newDeck(Number(event.target.value))}><option value={1}>双品牌 · 另 1 位伙伴</option><option value={2}>三方组合 · 另 2 位伙伴</option><option value={3}>四方组合 · 另 3 位伙伴</option></select></label><button onClick={() => newDeck()}>换一批 ↻</button></div></div><div className="cs-deck">{deck.map((item, index) => <button className={`cs-card-back ${revealed === index ? 'is-picked' : ''}`} key={`${round}-${index}`} onClick={() => setRevealed(index)} disabled={revealed !== null} aria-label={`翻开候选 ${index + 1}，含你共 ${count + 1} 方`}><span className="cs-card-corner">MB / 0{index + 1}</span><div className="cs-back-team">{item.partnerIds.map(id => <Portrait key={id} brand={byId.get(id)!} name={false} />)}</div><span className="cs-back-caption">{revealed === index ? '已揭晓 ↓' : `另外 ${count} 位伙伴 · 含你共 ${count + 1} 方`}</span><span className="cs-card-seal">{revealed === null ? '点击揭晓' : revealed === index ? '查看下面的合作假设' : '本轮未选择'}</span></button>)}</div><p className="cs-caption">按品牌随机抽样，本批成员不重复；不按适配分挑选。形象已可见，名称与完整资料在揭晓后显示。</p>{revealed !== null ? <div className="cs-reveal" aria-live="polite"><OpportunityDetail key={`${round}-${revealed}`} item={deck[revealed]} /></div> : null}</section> : null}
    {tab === 'brands' ? <section className="cs-brand-gallery"><div className="cs-section-heading"><h2>每种能力，都有自己的形状。</h2><p>沿用 avatar making 的六部件规则；有原文依据的能力才影响部件。展开查看完整虚构设定。</p></div><div className="cs-brand-grid">{partners.map(brand => <article key={brand.id}><div className="cs-brand-art"><Portrait brand={brand} /></div><p>{brand.summary}</p><span className="cs-caption">{brand.avatarNote}</span><details><summary>六因子资料 ↗</summary><BrandSheet brand={brand} /></details></article>)}</div></section> : null}
    <footer className="cs-footer"><span>头像来自当前项目的参数化角色系统 · 资料与方向均可下载</span><span>{allBrands.length} BRANDS / 4 CASES / NO REAL INVITATIONS</span></footer>
  </main>;
}
