import { BrandVisualKey } from './BrandVisualKey';
import { useEffect, useRef, useState } from 'react';
import type { Brand } from '../domain/types';
import { INTAKE_FIELDS, emptyIntake, intakeFromBrand } from '../domain/brandIntake';
import { brandFromProfile, localProfile, validateDocuments } from '../domain/brandProfile';
import type { BrandDocument, ProfileAnalysis } from '../domain/brandProfile';
import { BrandCharacter } from './BrandCharacter';
import { PrototypeCharacter } from './PrototypeCharacter';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';
import { JourneyFooter } from './JourneyFooter';

export const materialFingerprint = (docs: readonly BrandDocument[]) => JSON.stringify(docs.map(doc=>[doc.id,doc.name,doc.text,doc.visualRef]));
const fileBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(file); });
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/collider/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '资料暂时无法处理。'); return value;
}
export function BrandIntakePage({ onBack, onEnter, initialBrand, localOnly = false }: { initialBrand?: Brand; localOnly?: boolean; onBack: () => void; onEnter: (brand: Brand) => string | undefined }) {
  const [documents, setDocuments] = useState<BrandDocument[]>(initialBrand?.profile?.documents ?? []);
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(() => initialBrand?.profile ? { fields: intakeFromBrand(initialBrand), profile: initialBrand.profile } : null);
  const [generatedFiles, setGeneratedFiles] = useState(() => initialBrand?.profile ? materialFingerprint(initialBrand.profile.documents) : '');
  const filesChanged = documents.length > 0 && materialFingerprint(documents) !== generatedFiles;
  const [busy, setBusy] = useState<'reading' | 'analyzing' | 'dressing' | null>(null);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState('');
  const connection = useRef<{configured:boolean;imageConfigured:boolean} | null>(null);
  const [dragging, setDragging] = useState(false);
  const request = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; const abort = new AbortController(); void fetch(localOnly ? '/api/collider/lab/status' : '/api/collider/status', { signal: abort.signal }).then(res => res.json()).then(result => {connection.current=result;setConfigured(result.configured);setProviderName(result.model || '智能理解');}).catch(() => { if (!abort.signal.aborted) setConfigured(false); }); return () => { alive.current = false; abort.abort(); request.current?.abort(); }; }, [localOnly]);
  const upload = async (files: FileList | File[]) => {
    if (busy) return;
    const batch = Array.from(files);
    if (documents.filter(doc=>doc.visualRef).length + batch.filter(file=>/\.(png|jpe?g|webp)$/i.test(file.name)).length > 3) { setErrors(['一次最多保留 3 张产品参考图，其余资料可以继续上传文字文件。']); return; }
    if (documents.length + batch.length > 10) { setErrors(['每次最多保留 10 份资料，请先移除本次不需要的文件。']); return; }
    setBusy('reading'); setErrors([]);
    const controller = new AbortController(); request.current = controller;
    const next = [...documents]; const failures: string[] = [];
    for (const file of batch) {
      if (controller.signal.aborted) break;
      setStatus(`正在读取 ${file.name}`);
      try {
        if (!/\.(pdf|docx|txt|md|json|png|jpe?g|webp)$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('支持 PDF / Word / TXT / MD / JSON / PNG / JPG / WebP，文字文件 8 MB、图片 6 MB 以内。');
        const doc = localOnly ? await readLocalDemoDocument(file) : await post<BrandDocument>('uploads', { name: file.name, data: await fileBase64(file) }, controller.signal);
        if (next.some(item => item.name === doc.name && item.text === doc.text && item.visualRef === doc.visualRef)) continue;
        validateDocuments([...next, doc]); next.push(doc);
        if (alive.current) setDocuments([...next]);
      } catch (error) { if (!controller.signal.aborted) failures.push(`${file.name}：${(error as Error).message}`); }
    }
    if (alive.current && !controller.signal.aborted) { if(next.length && !generatedFiles && !analysis) await analyze(next,controller,failures); else {setBusy(null);setErrors(failures);setStatus(materialFingerprint(next) !== generatedFiles ? '资料已变更，可以重新生成角色。' : '文件未变化，无需重新生成。');} }
  };
  const analyze = async (inputDocuments = documents, controller = new AbortController(), failures: string[] = []) => {
    if (!inputDocuments.length || materialFingerprint(inputDocuments) === generatedFiles) return;
    setBusy('analyzing'); setErrors(failures); setStatus('正在理解资料，生成品牌角色…');
    request.current = controller;
    try {
      const available = connection.current ?? await fetch(localOnly ? '/api/collider/lab/status' : '/api/collider/status',{signal:controller.signal}).then(res=>res.json());
      connection.current=available; setConfigured(available.configured);
      const result: ProfileAnalysis = available.configured === false ? localProfile(inputDocuments) : await post<ProfileAnalysis>(localOnly ? 'lab/analyze-brand' : 'analyze-brand', { documents:inputDocuments }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setAnalysis(result); setGeneratedFiles(materialFingerprint(inputDocuments));
      if(!localOnly && available.imageConfigured && result.fields.name && result.fields.offers) {
        setBusy('dressing'); setStatus('正在生成角色发型与品牌穿搭…');
        try {
          const wearable = await post<NonNullable<ProfileAnalysis['profile']['wearable']>>('wearable',result,controller.signal);
          if(alive.current && !controller.signal.aborted) {setAnalysis({...result,profile:{...result.profile,wearable}});setStatus('品牌角色 已生成，可以查看完整形象。');}
        } catch { if(alive.current && !controller.signal.aborted) {setStatus('品牌理解已保留，专属穿搭暂未生成。');setErrors(current=>[...current,'穿搭生成未完成，可先进入探索，更新资料后再生成。']);} }
      } else setStatus(result.profile.source === 'ai' ? '品牌理解已完成，角色配饰已根据资料更新。' : '已完成基础识别，角色配饰为品牌自述的视觉示意。');
    } catch (error) { if (!controller.signal.aborted && alive.current) { setErrors([...failures,(error as Error).message]); setStatus('解析未完成，已上传文件仍保留。'); } }
    finally { if (alive.current) setBusy(null); }
  };
  const preview = analysis ? brandFromProfile({ ...analysis, fields: { ...analysis.fields, name: analysis.fields.name || '你的品牌' } }, initialBrand) : null;

  const gaps = analysis?.profile.gaps ?? [{ field: 'offers', material: '品牌介绍、产品目录或近期案例', reason: '识别品牌名称、已有产品和核心能力。' }, {field:'identity',material:'产品实物图、材质与视觉规范',reason:'还原产品颜色、质感和穿着方式；图片可与文字说明一起导入。'}, {field:'audience',material:'用户场景、合作案例与本期目标',reason:'帮助判断和什么伙伴合作，以及产品为谁解决问题。'}];
  const update = (key: keyof typeof emptyIntake, value: string) => setAnalysis(current => current ? { ...current, fields: { ...current.fields, [key]: value }, profile: { ...current.profile, evidence: current.profile.evidence.filter(ref => ref.field !== key), accessoryEvidence: undefined, accessoryReview: undefined, wearable: undefined } } : current);
  const enter = () => { if (!analysis) return; try { const value = onEnter(brandFromProfile(analysis, initialBrand)); if (value) setErrors([value]); } catch (error) { setErrors([(error as Error).message]); } };
  const busyLabel = busy === 'reading' ? '正在读取资料…' : busy === 'dressing' ? '正在生成角色…' : '正在理解品牌…';
  const ready = Boolean(analysis?.fields.name.trim()) && !busy && materialFingerprint(documents) === generatedFiles;
  const demoReady = ready && documents.some(doc => doc.id.startsWith('demo-'));
  return <main className="intake-page upload-first-page compact-intake">
    <button className="page-close" onClick={onBack} aria-label="返回"><Icon name="back" /></button>
    <div className="intake-layout"><section className="upload-workspace" aria-label="品牌材料上传">
      <div className={`material-dropzone ${dragging ? 'is-dragging-over' : ''}`} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);void upload(Array.from(event.dataTransfer.files));}}>
        <Icon name="upload"/><h1>{demoReady ? '演示品牌资料已就绪' : '把品牌资料放在这里'}</h1><p>{demoReady ? `${analysis?.fields.name} · 已导入 ${documents.length} 份资料` : '多文件一起导入'}</p>
        <small>最多 10 份 · 文字每份 8 MB · 最多 3 张产品图，每张 6 MB</small>
        <small>{localOnly ? '实验支持 TXT / MD / JSON · 由本机服务交给 Codex 理解，不存入品牌库。' : 'PDF / Word / TXT / MD / JSON / PNG / JPG / WebP'}</small>
        <button className="flow-primary" aria-busy={Boolean(busy)} disabled={Boolean(busy)} onClick={()=>demoReady ? enter() : inputRef.current?.click()}>{busy ? <LoadingIndicator>{busyLabel}</LoadingIndicator> : demoReady ? <>下一步：查看品牌角色<Icon name="arrow" /></> : documents.length ? '补充品牌资料' : '导入品牌资料'}</button>
        {demoReady ? <button className="entry-text-button" type="button" onClick={()=>inputRef.current?.click()}>补充品牌资料<Icon name="upload" /></button> : null}
        <small className="upload-caption">{demoReady ? '演示资料已整理，可直接点击下一步。' : '导入资料，生成你的品牌角色。'}</small>
        <input ref={inputRef} type="file" multiple accept={localOnly ? '.txt,.md,.json' : '.pdf,.docx,.txt,.md,.json,.png,.jpg,.jpeg,.webp'} aria-label="上传多个品牌文件" className="sr-only" disabled={Boolean(busy)} onChange={event=>{if(event.target.files)void upload(event.target.files);event.target.value='';}}/>
      </div>
      {documents.length ? <details className="material-file-menu"><summary>已导入 {documents.length} 份文件 <span>查看 / 管理</span></summary><ul className="material-list">{documents.map(doc=><li key={doc.id}><Icon name="document"/><div><strong>{doc.name}</strong><small>{doc.visualRef ? '产品参考图' : `${doc.text.length.toLocaleString()} 字`}</small></div><button disabled={Boolean(busy)} aria-label={`移除 ${doc.name}`} onClick={()=>{setDocuments(current=>current.filter(item=>item.id!==doc.id));setStatus('资料已变更，请重新生成角色。');}}><Icon name="close"/></button></li>)}</ul></details> : null}
      {status ? <p className="material-status" role="status">{status}</p> : null}
      {errors.map(error=><p key={error} role="alert" className="flow-error">{error}</p>)}
      {generatedFiles ? <div className="material-actions"><button className="flow-secondary" aria-busy={Boolean(busy)} disabled={!filesChanged || Boolean(busy)} onClick={()=>void analyze()}>{busy ? <LoadingIndicator>{busyLabel}</LoadingIndicator> : <>重新生成角色<Icon name="regenerate"/></>}</button><small>{filesChanged ? '使用更新后的文件生成' : '更改文件后可重新生成'}</small></div> : null}
      {configured===true ? <small className="intake-connection">{providerName}已连接 · 资料理解</small> : null}
      {configured===false ? <small className="intake-connection">AI 尚未连接 · 当前为基础识别与穿搭示意</small> : null}
      {analysis ? <details className="material-understanding compact-understanding"><summary>材料中识别到的内容 <span>{INTAKE_FIELDS.filter(field=>analysis.fields[field.key]).length} 个栏目 · 点击核对</span></summary>
        <div className="editable-material-fields">{INTAKE_FIELDS.map(field=><details key={field.key}><summary>{field.label}<span>{analysis.fields[field.key] ? '已识别 · 编辑' : '待补充'}</span></summary><label>{field.label}<textarea disabled={Boolean(busy)} rows={field.key==='name'?1:3} maxLength={field.max} value={analysis.fields[field.key]} placeholder={field.placeholder} onChange={event=>update(field.key,event.target.value)}/></label></details>)}</div>
      </details> : null}
      {!demoReady ? <div className="page-flow-action"><button className="flow-primary" onClick={enter} disabled={!ready}>下一步：查看品牌角色<Icon name="arrow" /></button>{!analysis ? <small>资料可以慢慢补充，先从一次相遇开始。</small> : !analysis.fields.name.trim() ? <small>展开识别内容，补充品牌名称即可继续。</small> : null}</div> : null}
    </section><aside className="material-portrait" aria-busy={Boolean(busy)}><div className="profile-avatar">{preview?.avatarDataUrl ? <img className="character uploaded-character" src={preview.avatarDataUrl} alt={`${preview.name}的品牌角色`} /> : preview ? <BrandCharacter brand={preview} labelled/> : <PrototypeCharacter labelled/>}</div>{busy ? <p className="portrait-loading" role="status"><LoadingIndicator>{busyLabel}</LoadingIndicator></p> : null}<h2>{preview?.name || '一个角色，穿上你的品牌。'}</h2>
      {preview ? <BrandVisualKey brand={preview}/> : null}
      <section className="next-material"><h3>{gaps.length ? '补充这些，让角色与连接更具体' : '品牌资料已就绪'}</h3>{!gaps.length ? <p>定位、产品、受众与视觉资料已准备好。下一步查看品牌角色，再进入引力匹配寻找合作伙伴。</p> : null}{gaps.map((gap,index)=><div key={`${gap.field}-${index}`}><Icon name="document"/><div><strong>{gap.material}</strong><p>{gap.reason}</p></div></div>)}</section>
    </aside></div>
    <JourneyFooter current="upload" />
  </main>;
}
async function readLocalDemoDocument(file: File): Promise<BrandDocument> {
  if(!/\.(txt|md|json)$/i.test(file.name)) throw new Error('本地实验仅读取 TXT / MD / JSON，不上传文件。');
  return {id:crypto.randomUUID(),name:file.name,text:await file.text()};
}
