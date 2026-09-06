import { displayBrand } from './domain/chinese';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mockDataSource } from './data/source';
import { calculateGravityPositions } from './engines/gravity';
import { GravityWorld } from './components/GravityWorld';
import { RelationInspector } from './components/RelationInspector';
import { CharacterEntry } from './components/CharacterEntry';
import { BrandProfilePage } from './components/BrandProfilePage';
import CanvasRedirect, { canvasUrl } from './collaboration/CanvasRedirect';
import { createProject } from './collaboration/api';
import { visualForBrand } from './collaboration/fixtures';
import { isCottiNailongPair, PRELOADED_COTTI_NAILONG_PROJECT_ID } from './collaboration/preloadedProject';
import { BrandIntakePage } from './components/BrandIntakePage';
import { DrawPage } from './components/DrawPage';
import { PartnerDetailPage } from './components/PartnerDetailPage';
import { Icon } from './components/Icon';
import { FlowIcon } from './components/FlowIcon';
import { JourneyFooter } from './components/JourneyFooter';
import './components/characters.css';
import './components/matching-flow.css';
import './components/invitation-flow.css';
import { discoverRelations, gravityExplorationRelations } from './domain/discovery';
import { loadCustomBrands, saveCustomBrands } from './engines/characterGenome';
import type { Brand, Viewport, WorldDataSource } from './domain/types';

const BrandAtlas = lazy(()=>import('./components/BrandAtlas'));
const ProjectsPage = lazy(() => import('./collaboration/ProjectsPage'));
type AppPage = 'entry' | 'intake' | 'profile' | 'matching' | 'detail' | 'projects' | 'project';
function readRoute(): { page: AppPage; projectId: string; mode: 'draw' | 'gravity' } {
  const hash = window.location.hash.slice(1) || (new URLSearchParams(window.location.search).get('view') === 'cases' ? 'projects' : '');
  const id = new URLSearchParams(hash).get('project') || '';
  return { page: /^project-[a-f0-9-]{36}$/.test(id) ? 'project' : hash === 'projects' ? 'projects' : hash === 'intake' ? 'intake' : hash === 'profile' ? 'profile' : ['explore', 'draw'].includes(hash) ? 'matching' : 'entry', projectId: id, mode: hash === 'draw' ? 'draw' : 'gravity' };
}

export default function App({ dataSource = mockDataSource, homeBrandId = 'cotti-coffee', initialPage = 'entry', demoBrand, localOnly = false }: { dataSource?: WorldDataSource; homeBrandId?: string; initialPage?: 'entry' | 'intake' | 'profile' | 'matching'; demoBrand?: Brand; localOnly?: boolean }) {
  const originals = useMemo(() => dataSource.loadBrands(1), [dataSource]);
  const [customBrands, setCustomBrands] = useState<Brand[]>(()=>localOnly?[]:loadCustomBrands());
  const [sessionBrands, setSessionBrands] = useState<Brand[]>([]);
  const brands = useMemo(() => [...originals.map(brand=>sessionBrands.find(item=>item.id===brand.id) ?? (localOnly ? customBrands.find(item=>item.id===brand.id) ?? brand : brand)), ...customBrands.filter(brand => !originals.some(original => original.id === brand.id))], [originals, customBrands, sessionBrands, localOnly]);
  const presentationBrands = useMemo(() => brands.map(displayBrand), [brands]);
  const [ownBrandId, setOwnBrandId] = useState(() => demoBrand?.id ?? homeBrandId);
  const home = brands.find(brand => brand.id === ownBrandId) ?? brands[0];
  const [editingBrand, setEditingBrand] = useState(false);
  const [page, setCurrentPage] = useState<AppPage>(() => initialPage !== 'entry' ? initialPage : readRoute().page);
  const [projectId, setProjectId] = useState(() => readRoute().projectId);
  const [mode, setMode] = useState<'gravity' | 'draw'>(() => readRoute().mode);
  const [projectError, setProjectError] = useState('');
  const [openingProject, setOpeningProject] = useState(false);
  const projectOpening = useRef(false);
  const setPage = (next: AppPage) => {
    setCurrentPage(next);
    const hash = next === 'projects' ? 'projects' : next === 'intake' ? 'intake' : next === 'profile' ? 'profile' : ['matching', 'detail'].includes(next) ? 'explore' : '';
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`);
  };
  const openProject = (id: string) => { window.location.assign(canvasUrl(id)); };
  const explore = (next: 'gravity' | 'draw' = 'gravity') => { setMode(next); setCurrentPage('matching'); window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#${next === 'draw' ? 'draw' : 'explore'}`); };
  useEffect(() => { const pop = () => { const route = readRoute(); setCurrentPage(route.page); setProjectId(route.projectId); setMode(route.mode); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page, mode]);
  const [focusId, setFocusId] = useState(home.id);
  const [selectedId, setSelectedId] = useState('nailong');
  const [resetKey, setResetKey] = useState(0);
  const [atlasOpen,setAtlasOpen] = useState(false);
  const [locateRequest,setLocateRequest] = useState<{id:string;revision:number}|null>(null);
  const cameraMemory = useRef<{view:Viewport;resetKey:number}|null>(null);
  const [fieldRevision, setFieldRevision] = useState(0);
  const focus = brands.find(brand => brand.id === focusId) ?? home;
  // Only focus, My Brand reload, or updated snapshots invalidate the relation field.
  const relations = useMemo(() => {
    void fieldRevision;
    return dataSource.getRelations(focus, brands);
  }, [dataSource, focus, brands, fieldRevision]);
  const visibleRelations = useMemo(() => discoverRelations(focus, relations), [focus, relations]);
  const explorationRelations = useMemo(() => gravityExplorationRelations(relations, visibleRelations), [relations, visibleRelations]);
  const positions = useMemo(() => calculateGravityPositions(focus.id, explorationRelations), [focus.id, explorationRelations]);
  const relationMap = useMemo(() => new Map(explorationRelations.map(relation => [relation.targetBrandId, relation])), [explorationRelations]);
  const selected = brands.find(brand => brand.id === selectedId) ?? focus;
  const ownRelations = useMemo(() => dataSource.getRelations(home, brands), [dataSource, home, brands]);
  const ownRelationMap = useMemo(() => new Map(ownRelations.map(relation => [relation.targetBrandId, relation])), [ownRelations]);
  const strongestOwnMatch = useMemo(() => [...ownRelations].sort((a, b) => b.collaborationFit - a.collaborationFit)[0]?.targetBrandId, [ownRelations]);
  const partner = brands.find(brand => brand.id === partnerId);
  const onInspect = useCallback((id: string) => setSelectedId(id), []);
  const onSetFocus = useCallback((id: string) => {
    if (id === focus.id) return;
    setSelectedId(id);
    setFocusId(id);
    setResetKey(key => key + 1);
  }, [focus.id]);
  const goHome = () => {
    if (focus.id !== home.id) { setSelectedId(focus.id); setFocusId(home.id); }
    setFieldRevision(revision => revision + 1);
    setResetKey(key => key + 1);
  };
  const enter = (brand: Brand) => {
    if(localOnly) setCustomBrands(previous=>[...previous.filter(item=>item.id!==brand.id),brand]);
    else if (originals.some(item => item.id === brand.id)) setSessionBrands(previous => [...previous.filter(item => item.id !== brand.id), brand]);
    if (!localOnly && brand.id.startsWith('company-')) {
      const next = [...customBrands.filter(item => item.id !== brand.id), brand];
      if (next.length > 40) return '本地最多保存 40 个品牌角色。';
      try { saveCustomBrands(next); } catch { return '浏览器存储空间不足，请精简上传资料后重试。'; }
      setCustomBrands(next);
    }
    setOwnBrandId(brand.id); setFocusId(brand.id); setSelectedId(discoverRelations(brand, dataSource.getRelations(brand, brands))[0]?.targetBrandId || brand.id); setMode('gravity'); setPage('profile'); setResetKey(key => key + 1);
  };
  const choosePartner = (id: string) => { if (id === home.id) return; setPartnerId(id); setPage('detail'); };
  const startInvitation = async () => {
    if (!partner || projectOpening.current) return;
    projectOpening.current = true; setOpeningProject(true); setProjectError('');
    try {
      if (isCottiNailongPair(home, partner)) { openProject(PRELOADED_COTTI_NAILONG_PROJECT_ID); return; }
      const project = await createProject({ a: { brand: displayBrand(home), visual: visualForBrand(home) }, b: { brand: displayBrand(partner), visual: visualForBrand(partner) } });
      openProject(project.id);
    }
    catch (reason) { setProjectError(reason instanceof Error ? reason.message : '创建项目失败，请重试。'); }
    finally { projectOpening.current = false; setOpeningProject(false); }
  };
  return <div className={`app-shell flow-shell page-${page} mode-${mode}`} data-character-style="facet">
    <header className="flow-header br-header">
      <button className="brand-lockup flow-logo br-lockup" type="button" aria-label="返回第一页" onClick={() => setPage('entry')}><img src="/vi/mark-black.svg" alt="" /></button>
      {!['entry', 'intake'].includes(page) ? <button className="br-profile-shortcut" onClick={() => { setEditingBrand(true); setPage('intake'); }}><Icon name="upload" /><span>编辑品牌画像</span></button> : null}
    </header>
    {projectError ? <p className="br-notice" role="alert">{projectError}</p> : null}
    {openingProject ? <p className="br-loading-line" role="status">正在带入双方资料，打开渠道预演画板…</p> : null}

    {page === 'entry' ? <CharacterEntry brands={brands} example={home} onCreate={() => { setEditingBrand(false); setPage('intake'); }} /> : page === 'intake' ? <BrandIntakePage localOnly={localOnly} initialBrand={editingBrand || localOnly || home.id === 'cotti-coffee' ? home : undefined} onBack={() => setPage(editingBrand ? 'profile' : 'entry')} onEnter={enter} /> : page === 'profile' ? <BrandProfilePage brand={home} onEdit={() => { setEditingBrand(true); setPage('intake'); }} onExplore={() => explore()} /> : page === 'detail' && partner ? <PartnerDetailPage home={displayBrand(home)} partner={displayBrand(partner)} relation={ownRelationMap.get(partner.id)} onClose={() => setPage('matching')} onContact={startInvitation} /> : page === 'projects' ? <Suspense fallback={<p className="br-empty">正在打开项目…</p>}><ProjectsPage brands={brands} onOpen={openProject} onExplore={() => explore()} /></Suspense> : page === 'project' && projectId ? <Suspense fallback={<p className="br-empty">正在打开共创工作台…</p>}><CanvasRedirect id={projectId} /></Suspense> : mode === 'draw' ? <><div className="br-draw-nav"><button className="br-text-button" onClick={() => explore()} aria-label="上一步：引力匹配"><Icon name="back" /><span>上一步</span></button><span className="br-mode-icon" title="抽卡探索"><FlowIcon name="cards" /><span className="sr-only">抽卡探索</span></span></div><DrawPage key={home.id} brands={brands.map(displayBrand)} home={displayBrand(home)} relations={ownRelationMap} preferredId={strongestOwnMatch} onChoose={choosePartner} /><JourneyFooter current="gravity" /></> : <>
    <div className="gravity-toolbar"><div className="gravity-toolbar__start"><button className="gravity-back" type="button" onClick={() => setPage('profile')}><Icon name="back" /><span>返回个人 IP</span></button><div className="br-discovery-modes" role="group" aria-label="伙伴探索方式"><button aria-label="引力匹配" title="引力匹配" aria-pressed={true} onClick={() => explore('gravity')}><FlowIcon name="gravity" /></button><button aria-label="抽卡探索" title="抽卡探索" aria-pressed={false} onClick={() => explore('draw')}><FlowIcon name="cards" /></button></div><span>智能匹配 <strong data-testid="current-focus">{focus.name}</strong></span></div><div><button onClick={()=>setAtlasOpen(true)} aria-label="打开品牌图鉴">品牌图鉴 <span>{brands.length}</span></button><button onClick={goHome}><Icon name="home" /><span>回到我的品牌</span></button><button disabled={selected.id === home.id && focus.id === home.id} onClick={() => selected.id !== focus.id ? onSetFocus(selected.id) : setResetKey(key => key + 1)}><Icon name="reset" /><span>{selected.id === focus.id ? '回到聚焦伙伴' : '聚焦这个伙伴'}</span></button></div></div>
    <main className="workspace">
      <GravityWorld brands={presentationBrands} focus={displayBrand(focus)} positions={positions} relations={relationMap} selectedId={selected.id} resetKey={resetKey} onInspect={onInspect} locateRequest={locateRequest} cameraMemory={cameraMemory}/>
      <RelationInspector focus={displayBrand(focus)} target={displayBrand(selected)} relation={relationMap.get(selected.id)} count={brands.length} onMatch={selected.id !== home.id ? () => choosePartner(selected.id) : undefined} />
    </main>
    <JourneyFooter current="gravity" />
    </>}
    {atlasOpen?<Suspense fallback={null}><BrandAtlas brands={presentationBrands} onClose={()=>setAtlasOpen(false)} onLocate={id=>{setSelectedId(id);setLocateRequest(previous=>({id,revision:(previous?.revision??0)+1}));setAtlasOpen(false);}}/></Suspense>:null}
    <span className="sr-only" role="status" aria-live="polite">当前聚焦：{focus.name}。已选品牌：{selected.name}。</span>
  </div>;
}
