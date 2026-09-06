import { useEffect, useRef, useState } from 'react';
import type { Brand } from '../domain/types';
import type { InvitationDraft } from '../domain/invitation';
import { isQuickProposalResult, proposalRequest } from '../domain/quickProposal';
import type { QuickProposalResult } from '../domain/quickProposal';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';

type SavedProposal = { source: string; result: QuickProposalResult };
export function QuickProposal({ home, partner, draft, onApply, readOnly, configured }: {
  home: Brand; partner: Brand; draft: InvitationDraft; readOnly: boolean; configured: boolean | null;
  onApply: (draft: QuickProposalResult['draft']) => void;
}) {
  const key = `collider-quick:v1:${home.id}:${partner.id}`;
  const input = JSON.stringify(proposalRequest([home, partner], draft));
  const [saved, setSaved] = useState<SavedProposal | null>(() => {
    try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); return typeof value?.source === 'string' && isQuickProposalResult(value.result) ? value : null; }
    catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const remember = (next: SavedProposal) => {
    setSaved(next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* The visible result remains usable when browser storage is full. */ }
  };
  const generate = async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/collider/quick-proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: input, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '生成失败，请重试。');
      if (!isQuickProposalResult(result)) throw new Error('初稿格式不完整，请重试。');
      if (!controller.signal.aborted) remember({ source: input, result });
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '生成失败，请重试。'); }
    finally { if (!controller.signal.aborted) { setBusy(false); request.current = null; } }
  };
  const stale = saved !== null && saved.source !== input;
  return <div className="quick-proposal">
    <p>快速生成一个合作方向，先有初稿，再慢慢调整。</p>
    <button type="button" className="flow-secondary" disabled={readOnly || busy || configured !== true} aria-busy={busy} onClick={() => void generate()}>{busy ? <LoadingIndicator>正在生成简洁初稿…</LoadingIndicator> : <><Icon name="sparkles" />{saved ? '重新生成快速初稿' : '快速生成联名初稿'}</>}</button>
    {busy ? <p className="proposal-note" role="status">正在整理合作点子与双方分工…</p> : null}
    {error ? <p className="flow-error" role="alert">{error}</p> : null}
    {saved ? <div className="ai-suggestion" aria-label="联名快速初稿">
      <strong>{saved.result.draft.title}</strong><p>{saved.result.draft.concept}</p>
      <p><b>我方带来：</b>{saved.result.draft.contribution}</p><p><b>邀请对方：</b>{saved.result.draft.ask}</p>
      {saved.result.notes.length ? <ul>{saved.result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      <p className="proposal-note">AI 初稿 · 待双方确认</p>
      {stale ? <p className="flow-error">资料已修改，请重新生成后再采用。</p> : null}
      <button type="button" className="flow-primary" disabled={readOnly || busy || stale} onClick={() => { onApply(saved.result.draft); remember({ ...saved, source: JSON.stringify(proposalRequest([home, partner], { ...draft, ...saved.result.draft })) }); }}>将初稿填入邀请</button>
    </div> : null}
  </div>;
}
