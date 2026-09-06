import { useRef, useState } from 'react';
import type { Brand } from '../domain/types';
import { candidateBrand, createLocalCandidates, validateBrief } from '../engines/characterGenome';
import { BrandCharacter } from './BrandCharacter';
import { FlowIcon } from './FlowIcon';
import { Icon } from './Icon';

const EMPTY = { name: '', category: '', offers: '', needs: '', intent: '', audience: '', identity: '', constraints: '', evidence: '' };
const EXAMPLE = { name: '苔屿 Moss Isle', category: '可持续材料与生活用品品牌', offers: '提供产品设计、材料研发、原型制作和小批量制造。', needs: '寻找零售空间、渠道分销和社群运营伙伴。', intent: '试做一组可持续材料的限量生活用品。', audience: '关注设计与环保的城市年轻人。', identity: '自然、好奇、温暖，喜欢苔绿与陶土色。', constraints: '先做小批量试验；预算与许可需要共同确认。', evidence: '虚构示例，暂无真实项目证据。' };
const FIELDS: { key: keyof typeof EMPTY; label: string; placeholder: string; required?: boolean }[] = [
  { key: 'name', label: '品牌名称', placeholder: '你的品牌叫什么？', required: true },
  { key: 'category', label: '一句话介绍', placeholder: '你们是谁，主要做什么？', required: true },
  { key: 'offers', label: '产品、能力与资源', placeholder: '实际能提供什么？写明产品、渠道、内容、技术或交付能力。', required: true },
  { key: 'needs', label: '想找的伙伴', placeholder: '希望对方补足什么？', required: true },
  { key: 'intent', label: '联名目标', placeholder: '想一起做什么，达到什么目标？', required: true },
  { key: 'audience', label: '目标消费者', placeholder: '服务谁？他们在什么场景需要你？', required: true },
  { key: 'identity', label: '品牌个性', placeholder: '价值观、气质、喜欢与避免的表达。' },
  { key: 'constraints', label: '预算、时间与边界', placeholder: '预算范围、交付时间、产能、授权与不能做的事；未知可写待确认。' },
  { key: 'evidence', label: '已有案例与依据', placeholder: '可公开的案例、官网链接、消费者反馈；没有证据可以留空。' },
];

export function BrandIntake({ onBack, onEnter }: { onBack: () => void; onEnter: (brand: Brand) => string | undefined }) {
  const [values, setValues] = useState(EMPTY);
  const [sourceText, setSourceText] = useState('');
  const [result, setResult] = useState<Brand | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const importVersion = useRef(0);
  const update = (key: keyof typeof EMPTY, value: string) => { setValues(previous => ({ ...previous, [key]: value })); setResult(null); setError(''); };
  const importFile = async (file?: File) => {
    if (!file) return;
    const version = ++importVersion.current;
    setError(''); setLoading(false);
    if (!/\.(txt|md|json)$/i.test(file.name) || file.size > 102400) { setError('请上传 100 KB 内的 TXT、Markdown 或 JSON 品牌资料。'); return; }
    setLoading(true);
    try {
      const text = await file.text();
      if (version !== importVersion.current) return;
      if (/\.json$/i.test(file.name)) {
        const data: unknown = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON 应为品牌字段对象。');
        const next = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) {
          const value = (data as Record<string, unknown>)[key];
          if (value !== undefined && (typeof value !== 'string' || value.length > (key === 'name' ? 80 : 3000))) throw new Error(`字段 ${key} 格式不正确或过长。`);
          next[key] = typeof value === 'string' ? value : '';
        }
        setValues(next);
      } else { setSourceText(text.slice(0, 12000)); }
      setResult(null);
    } catch (cause) { if (version === importVersion.current) setError(cause instanceof Error ? cause.message : '资料读取失败。'); }
    finally { if (version === importVersion.current) setLoading(false); }
  };
  const generate = () => {
    try {
      const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as typeof EMPTY;
      if (FIELDS.some(field => field.required && !trimmed[field.key])) throw new Error('请补全必填品牌资料。');
      const brief = validateBrief(trimmed);
      const brand = { ...candidateBrand(brief, createLocalCandidates(brief)[1], `company-${crypto.randomUUID()}`), intent: trimmed.intent, audience: trimmed.audience, constraints: trimmed.constraints, evidence: trimmed.evidence };
      setValues(trimmed); setResult(brand); setError('');
    } catch (cause) { setError((cause as Error).message); }
  };
  return <main className="intake-page"><button className="flow-close" onClick={onBack} aria-label="关闭品牌资料页"><FlowIcon name="close" /></button><div className="intake-heading"><h1>关于你的品牌。</h1><p>先了解你，再让角色出现。</p></div>
    <div className="intake-layout"><form onSubmit={event => { event.preventDefault(); generate(); }}><div className="intake-tools"><label className="intake-upload"><FlowIcon name="upload" /><span>导入品牌资料</span><input type="file" aria-label="导入品牌资料" accept=".txt,.md,.json" disabled={loading} onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label><button className="entry-text-button" type="button" onClick={() => { ++importVersion.current; setLoading(false); setValues(EXAMPLE); setResult(null); setError(''); }}>填入示例</button></div><p className="intake-hint">TXT / MD 可供对照填写；JSON 自动填入对应字段。≤ 100 KB</p>
      {sourceText ? <details className="imported-notes" open><summary>已导入资料 · 请核对并填写下方字段</summary><pre>{sourceText}</pre></details> : null}
      <div className="intake-fields">{FIELDS.map(field => <label key={field.key}>{field.label}<small>{field.required ? '必填' : '选填'}</small>{field.key === 'name' || field.key === 'category' ? <input required={field.required} maxLength={field.key === 'name' ? 80 : 3000} value={values[field.key]} onChange={e => update(field.key, e.target.value)} placeholder={field.placeholder} /> : <textarea rows={2} required={field.required} minLength={field.key === 'offers' ? 8 : undefined} maxLength={3000} value={values[field.key]} onChange={e => update(field.key, e.target.value)} placeholder={field.placeholder} />}</label>)}</div>
      <button className="flow-primary" disabled={loading}>{result ? '重新生成角色' : '生成专属角色'}<Icon name="arrow" /></button>{error ? <p className="flow-error" role="alert">{error}</p> : null}
    </form><aside className={`intake-preview ${result ? 'has-result' : ''}`}><div className="intake-preview-art">{result ? <BrandCharacter brand={result} labelled /> : <span className="intake-question" aria-hidden="true">?</span>}</div><h2>{result ? result.name : '你的角色，等待登场。'}</h2><p>{result ? '已按品牌资料自动生成 · 本地规则' : '填写左侧资料，生成后即可进入 Gravity。'}</p>{result ? <button className="flow-primary" onClick={() => setError(onEnter(result) || '')}>进入 Gravity<Icon name="arrow" /></button> : null}<small>资料仅保存在当前浏览器。</small></aside></div>
  </main>;
}
