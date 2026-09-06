import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Brand } from '../domain/types';
import type { InvitationDraft } from '../domain/invitation';
import type { Session } from '../../../brand-collider-skills-design/src/collider-types';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';
import { QuickProposal } from './QuickProposal';
import { proposalRequest } from '../domain/quickProposal';

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/collider/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '生成失败，请重试。');
  return data;
}
export function ProposalField({ label, field, home, partner, draft, onApply, children, localOnly = false }: { localOnly?: boolean; label: string; field: string; home: Brand; partner: Brand; draft: InvitationDraft; onApply: (value: string) => void; children: ReactNode }) {
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setSuggestion('');
    try { const result = await api<{ value: string }>(localOnly ? 'lab/field' : 'field', { field, ...proposalRequest([home, partner], draft) }, request.signal); if (!request.signal.aborted) setSuggestion(result.value); }
    catch (reason) { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : '生成失败，请重试。'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  return <div className="proposal-field"><div className="proposal-field-heading"><span>{label}</span><button type="button" className="ai-field-button" title="智能生成建议" aria-label={`AI 生成：${label}`} aria-busy={busy} disabled={busy} onClick={() => void generate()}>{busy ? <LoadingIndicator>生成中…</LoadingIndicator> : <Icon name="sparkles" />}</button></div><label><span className="sr-only">{label}</span>{children}</label>{busy ? <p className="ai-loading-note" role="status">正在生成建议，请稍候…</p> : null}{error ? <p className="flow-error" role="alert">{error}</p> : null}{suggestion ? <div className="ai-suggestion"><strong>AI 建议 · 请核对</strong><p>{suggestion}</p><div><button type="button" onClick={() => { onApply(suggestion); setSuggestion(''); }}>采用建议</button><button type="button" onClick={() => setSuggestion('')}>保留我的内容</button></div></div> : null}</div>;
}
const asColliderBrand = (brand: Brand) => ({ name: brand.name, description: `品牌定位：${brand.category}\n已有能力：${brand.offers}\n需求：${brand.needs || '待补充'}\n目标：${brand.intent || '待补充'}\n受众：${brand.audience || '待补充'}\n气质：${brand.identity || '待补充'}\n边界：${brand.constraints || '待确认'}`, files: brand.supportingEvidence ? [{ name: '品牌提供的案例与依据.txt', text: brand.supportingEvidence }] : [] });
export function ColliderProposal({ home, partner, draft, onApply, readOnly = false }: { home: Brand; partner: Brand; draft: InvitationDraft; readOnly?: boolean; onApply: (draft: Pick<InvitationDraft, 'title' | 'concept' | 'contribution' | 'ask'>) => void }) {
  const storageKey = `collider-progress:${home.id}:${partner.id}`;
  const [saved] = useState<{ id: string; source: string } | null>(() => { try { const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return typeof value?.id === 'string' && /^session-[a-f0-9-]+$/.test(value.id) && typeof value.source === 'string' ? value : null; } catch { return null; } });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState(saved?.source || '');
  const alive = useRef(true);
  const input = JSON.stringify({ brands: [home, partner], draft });
  useEffect(() => { alive.current = true; const abort = new AbortController(); void api<{ configured: boolean }>('status', undefined, abort.signal).then(result => setConfigured(result.configured)).catch(() => { if (!abort.signal.aborted) setConfigured(false); }); return () => { alive.current = false; abort.abort(); }; }, []);
  useEffect(() => {
    if (!saved) return;
    const abort = new AbortController();
    void api<Session>(`sessions/${saved.id}`, undefined, abort.signal).then(result => { if (!abort.signal.aborted) setSession(result); }).catch(() => { if (!abort.signal.aborted) setError('上次生成记录暂时无法读取。'); });
    return () => abort.abort();
  }, [saved]);
  useEffect(() => { if (session && source && !busy) { try { sessionStorage.setItem(storageKey, JSON.stringify({ id: session.id, source })); } catch { /* The server still retains the source session. */ } } }, [session, source, storageKey, busy]);
  const sessionId = session?.id;
  const sessionStatus = session?.status;
  useEffect(() => {
    if (!sessionId || sessionStatus !== 'running') return;
    const abort = new AbortController(); let timer: number;
    const poll = async () => {
      try { const result = await api<Session>(`sessions/${sessionId}`, undefined, abort.signal); if (!abort.signal.aborted) { setSession(result); if (result.status === 'running') timer = window.setTimeout(poll, 1800); } }
      catch { if (!abort.signal.aborted) setError('进度读取失败，已提交任务仍保留；可点击刷新进度。'); }
    };
    timer = window.setTimeout(poll, 1200); return () => { abort.abort(); window.clearTimeout(timer); };
  }, [sessionId, sessionStatus]);
  const run = async (operation: () => Promise<Session>) => { setBusy(true); setError(''); try { const value = await operation(); if (alive.current) setSession(value); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '生成失败。'); } finally { if (alive.current) setBusy(false); } };
  const start = () => { setSession(null); setSource(input); void run(async () => { const created = await api<Session>('sessions', { brands: [asColliderBrand(home), asColliderBrand(partner)], goal: draft.concept || home.intent || `探索 ${home.name} 与 ${partner.name} 的具体联名产物及消费者价值`, constraints: [home.constraints, partner.constraints, draft.contribution && `我方拟投入：${draft.contribution}`, draft.ask && `对对方的邀请：${draft.ask}`, ...draft.diagnostics].filter(Boolean) }); if (alive.current) setSession(created); return api<Session>(`sessions/${created.id}/run`, {}); }); };
  const stale = Boolean(session && source !== input);
  const generating = busy || session?.status === 'running';
  const selected = session?.concepts.find(concept => concept.id === session.selectedConceptId);
  return <section className="collider-proposal"><div className="collider-heading"><strong>联名提案</strong><span>快速初稿</span></div>
    {configured === false ? <p className="proposal-note">AI 尚未连接，可先手动填写。模型连接后即可生成完整提案。</p> : null}
    <QuickProposal key={`${home.id}:${partner.id}`} home={home} partner={partner} draft={draft} onApply={onApply} readOnly={readOnly || generating} configured={configured} />
    <details className="proposal-diagnostics"><summary>多轮深化提案（耗时较长）</summary><p>研究双方 → 选择方向 → 设计、文案与审查</p>
    <button type="button" className="flow-secondary" aria-busy={generating} disabled={readOnly || busy || session?.status === 'running' || configured !== true} onClick={start}>{generating ? <LoadingIndicator>正在生成提案…</LoadingIndicator> : <><Icon name="sparkles" />{session ? '按当前资料重新生成' : '生成联名提案'}</>}</button>
    {error ? <p className="flow-error" role="alert">{error}</p> : null}
    {session ? <div className="collider-results"><p role="status">{session.status === 'running' ? `正在推进：${session.activeSkill || '品牌研究'}…` : session.status === 'awaiting_selection' ? '选择一个方向继续深化' : session.status === 'completed' ? '提案已生成，请核对后使用' : session.error || '任务已保留，可继续'} · {session.completedSkills.length}/6</p>
      {stale ? <p className="flow-error">品牌或草稿已修改，以下为上一份简报的结果。请按当前资料重新生成。</p> : null}
      {session.status === 'running' && !readOnly ? <button type="button" onClick={() => void run(() => api<Session>(`sessions/${session.id}/pause`, {}))}>暂停生成</button> : null}
      <button type="button" disabled={busy} onClick={() => void run(() => api<Session>(`sessions/${session.id}`))}>刷新进度</button>
      {['error', 'paused', 'idle'].includes(session.status) ? <button type="button" disabled={readOnly || busy || stale} onClick={() => void run(() => api<Session>(`sessions/${session.id}/run`, {}))}>继续生成</button> : null}
      {session.status === 'awaiting_selection' ? <div className="collider-concepts">{session.concepts.map(concept => <article key={concept.id}><h3>{concept.title}</h3><p>{concept.description}</p><p>消费者价值：{concept.consumerValue}</p><button type="button" disabled={readOnly || busy || stale} onClick={() => void run(() => api<Session>(`sessions/${session.id}/select`, { conceptId: concept.id }))}>选择方向并深化<Icon name="arrow" /></button></article>)}</div> : null}
      {session.proposal ? <>{session.proposal.sections.map(section => <details key={section.skill}><summary>{section.title}</summary><p className="collider-section-text">{section.content}</p></details>)}{session.proposal.pendingConfirmations.length ? <details><summary>待确认事项</summary><ul>{session.proposal.pendingConfirmations.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}{selected && session.status === 'completed' ? <button type="button" className="flow-primary" disabled={readOnly || stale} onClick={() => { const next = { title: selected.title, concept: `${selected.description}\n消费者价值：${selected.consumerValue}`.slice(0, 2000), contribution: selected.contributionA, ask: `邀请对方参与（待确认）：${selected.contributionB}`.slice(0, 2000) }; onApply(next); setSource(JSON.stringify({ brands: [home, partner], draft: { ...draft, ...next } })); }}>将所选方向填入邀请</button> : null}</> : null}
    </div> : null}</details>
  </section>;
}
