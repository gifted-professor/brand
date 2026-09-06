import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { Session } from '../../src/collider-types';
import type { ProductionNode, ProductionProject } from '../../src/production-types';
import { api } from '../api';
import { sessionProduction } from '../session-production';
import { resolveProjectStage, resolveSessionProgressNode, resolveSessionStage } from '../workflow-stage';
import { ProductionCanvas } from './ProductionCanvas';

const EMPTY_PROJECT: ProductionProject = {
  id: 'new-project', title: '新的联名项目', summary: '', brandNames: ['', ''], updatedAt: '', nodeCount: 0, assetCount: 0,
  selectionStatus: 'unselected', nodes: [], edges: [], assets: [], notes: [], lanes: [
    { id: 'strategy', label: '研究与方向', description: '品牌研究、证据与创意方向' },
    { id: 'story', label: '故事文案', description: '主题故事与传播内容' },
    { id: 'materials', label: '产品物料', description: '产品与逐件效果' },
    { id: 'media', label: '视觉创作', description: '图片与传播物料' },
    { id: 'video', label: '视频', description: '分镜与成片' },
    { id: 'review', label: '审查', description: '检查与交付记录' },
  ],
};

type Props = {
  session: Session | null; projectId: string | null;
  onProjectLoaded: (project: ProductionProject | null) => void;
  onDiscuss: (node?: ProductionNode) => void; focusNodeId?: string | null; followRequest?: number;
};
export function ProductionWorkspace({ session, projectId, onProjectLoaded, onDiscuss, focusNodeId, followRequest }: Props) {
  const [project, setProject] = useState<ProductionProject | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const loadNumber = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    const version = epoch.current, load = ++loadNumber.current;
    setRefreshing(true);
    try {
      const next = await api<ProductionProject>(`/production/projects/${encodeURIComponent(projectId)}`, undefined, signal);
      if (version === epoch.current && load === loadNumber.current && !signal?.aborted) { setProject(next); onProjectLoaded(next); setError(''); }
    } catch (err) { if (version === epoch.current && load === loadNumber.current && !signal?.aborted) setError(err instanceof Error ? err.message : '暂时无法读取制作资料。'); }
    finally { if (version === epoch.current && load === loadNumber.current && !signal?.aborted) setRefreshing(false); }
  }, [projectId, onProjectLoaded]);
  useEffect(() => {
    epoch.current += 1; setProject(null); onProjectLoaded(null); setError(''); setRefreshing(false);
    if (!projectId) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(controller.signal); }, 10000);
    return () => { controller.abort(); clearInterval(timer); epoch.current += 1; };
  }, [projectId, refresh, onProjectLoaded]);
  const current = useMemo(() => session ? sessionProduction(session) : null, [session]);
  const source = project?.id === projectId ? project : null;
  const displayed = useMemo(() => {
    if (!source) return current || EMPTY_PROJECT;
    if (!current?.nodes.length) return current?.workflow ? { ...source, workflow: current.workflow } : source;
    const revised = !!session && session.revision > 1;
    const sourceNodes = source.nodes.map(node => revised ? { ...node, status: 'reference' as const, statusLabel: '原项目资料 · 本轮需复核' } : node);
    // Old project files remain accessible; active-session artifacts are distinct,
    // ordered first, and never written back over the source material.
    const nodes = [...current.nodes.map((node, i) => ({ ...node, displayOrder: i - 100 })), ...sourceNodes];
    return { ...source, workflow: current.workflow, updatedAt: current.updatedAt, nodes, assets: [...current.assets, ...source.assets], edges: [...current.edges, ...source.edges], nodeCount: nodes.length, assetCount: current.assets.length + source.assets.length };
  }, [source, current, session?.revision]);
  const activeLane = resolveSessionStage(session) || resolveProjectStage(source);
  const sessionProgressNode = resolveSessionProgressNode(session);
  const progressNodeId = sessionProgressNode && current?.nodes.some(node => node.id === sessionProgressNode) ? sessionProgressNode : null;
  return <div className="u-production-workspace">
    <ProductionCanvas project={displayed} refreshing={refreshing} onRefresh={() => void refresh()} onBack={() => {}} onDiscuss={onDiscuss} embedded activeLane={activeLane} progressNodeId={progressNodeId} focusNodeId={focusNodeId} followRequest={followRequest} />
    {projectId && !source && <div className="u-project-loading" role="status">{refreshing ? <><LoaderCircle className="spin" size={17} />正在读取项目成果…</> : <><span>{error || '项目暂时无法读取。'}</span><button onClick={() => void refresh()}><RefreshCw size={14} />重试</button></>}</div>}
    {source && error && <div className="production-read-error" role="alert">{error}<button onClick={() => void refresh()}>重试</button></div>}
  </div>;
}
