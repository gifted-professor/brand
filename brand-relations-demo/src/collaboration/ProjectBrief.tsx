import { useState } from 'react';
import type { Project, Side, VisualIdentity } from './model';
import { Icon } from '../components/Icon';

export function BriefEditor({ project, busy, onSave }: { project: Project; busy: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState(project.invitation.draft);
  const [headlines, setHeadlines] = useState(project.headlines);
  const [channel, setChannel] = useState(project.channel);
  const [visuals, setVisuals] = useState({ a: project.brands.a.visual, b: project.brands.b.visual });
  const [error, setError] = useState('');
  const editable = ['draft', 'accepted'].includes(project.invitation.status);
  const visual = (side: Side, update: Partial<VisualIdentity>) => setVisuals(previous => ({ ...previous, [side]: { ...previous[side], ...update } }));
  const upload = async (side: Side, field: 'photo' | 'logo', file?: File) => {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1000000) { setError('请使用 1 MB 以内的 PNG、JPG 或 WebP 文件。'); return; }
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); }).catch(reason => { setError(reason.message); return ''; });
    if (data) visual(side, { [field]: data, source: 'provided' });
  };
  return <form className="br-brief" onSubmit={e => { e.preventDefault(); onSave({ draft, headlines, channel, visuals }); }}><div className="br-brief-title"><div><h2>合作有交集，品牌有自己。</h2><p>先明确一次具体的相互推荐，再确定各自渠道里的呈现。</p></div><span>简报 V{project.revision}</span></div>
    {!editable ? <div className="br-notice">邀请进行中或已暂停。请在邀请页准备新版本后再编辑。</div> : null}
    {error ? <p role="alert" className="br-notice">{error}</p> : null}
    <fieldset disabled={!editable || busy}>
    <div className="br-brief-columns"><section><label>合作名称<input required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>共同目标与消费者价值<textarea required maxLength={2000} rows={4} value={draft.concept} onChange={e => setDraft({ ...draft, concept: e.target.value })} /></label><label>{project.brands.a.brand.name} 愿意提供<textarea required maxLength={2000} rows={3} value={draft.contribution} onChange={e => setDraft({ ...draft, contribution: e.target.value })} /></label><label>邀请 {project.brands.b.brand.name} 参与<textarea required maxLength={2000} rows={3} value={draft.ask} onChange={e => setDraft({ ...draft, ask: e.target.value })} /></label><label>使用场景<select value={channel} onChange={e => setChannel(e.target.value as Project['channel'])}><option value="social">社交渠道推荐图 · 3:4</option><option value="store">门店推荐海报 · 近 A 系列比例</option></select></label><details><summary>消费者、投入与交付 · 3 个确认项</summary>{['消费者为何需要', '双方收益与投入', '交付与处理责任'].map((label, i) => <label key={label}>{label}<textarea rows={3} maxLength={2000} value={draft.diagnostics[i]} onChange={e => { const diagnostics = [...draft.diagnostics] as typeof draft.diagnostics; diagnostics[i] = e.target.value; setDraft({ ...draft, diagnostics }); }} /></label>)}</details></section>
    <section className="br-visual-editors">{(['a', 'b'] as const).map(side => <div className="br-visual-editor" key={side}><div className="br-visual-title"><i style={{ background: visuals[side].accent }} /><h3>{project.brands[side].brand.name}</h3><span>{visuals[side].source === 'fictional' ? '虚构 VI 档案' : visuals[side].source === 'provided' ? '已提供资料' : '待提供原有 VI'}</span></div><p>{project.brands[side].brand.audience}</p><label>原有文字标识<input required maxLength={40} value={visuals[side].wordmark} onChange={e => visual(side, { wordmark: e.target.value })} /></label><label>本方渠道标题<textarea required maxLength={36} rows={2} value={headlines[side]} onChange={e => setHeadlines({ ...headlines, [side]: e.target.value })} /></label><div className="br-color-fields">{(['background', 'foreground', 'accent'] as const).map((key, i) => <label key={key}>{['背景色', '文字色', '识别色'][i]}<input aria-label={`${project.brands[side].brand.name}${['背景色', '文字色', '识别色'][i]}`} type="color" value={visuals[side][key]} onChange={e => visual(side, { [key]: e.target.value })} /></label>)}</div><div className="br-upload-fields"><label>原有 Logo<small>{visuals[side].logo ? '已读取，保存后应用' : '没有图形 Logo 时保留文字标识'}</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(side, 'logo', e.target.files?.[0])} /></label><label>原有场景图片<small>{visuals[side].photo ? '已有素材，选择文件可替换当前版本' : '可留空，使用排版预演'}</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(side, 'photo', e.target.files?.[0])} /></label></div>{visuals[side].source !== 'fictional' ? <label className="br-checkbox"><input type="checkbox" checked={visuals[side].source === 'provided'} onChange={e => visual(side, { source: e.target.checked ? 'provided' : 'unprovided' })} />已核对以上为该品牌的现有视觉资料</label> : null}</div>)}</section></div>
    <div className="br-form-footer"><p>保存会生成新版本，保留旧图，并重置本版物料确认。</p><button className="br-button primary">保存并更新预演<Icon name="arrow" /></button></div>
    </fieldset></form>;
}
