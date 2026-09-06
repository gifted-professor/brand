import { memo, useEffect, useMemo, useRef } from 'react';
import type { Brand, LOD, RelationResult, SceneNode, SpatialPosition } from '../domain/types';
import { VIEW_CONFIG } from '../config';
import { gravityPresentationScale } from '../engines/gravityPresentation';
import { resolveLODByDistance, updateVisibleNodes } from '../engines/viewport';
import { useViewport } from '../hooks/useViewport';
import type { CameraMemory } from '../hooks/useViewport';
import { BrandNode } from './BrandNode';
import { Icon } from './Icon';

interface Props {
  brands: readonly Brand[];
  focus: Brand;
  positions: readonly SpatialPosition[];
  relations: ReadonlyMap<string, RelationResult>;
  selectedId: string;
  resetKey: number;
  onInspect: (id: string) => void;
  locateRequest?: {id:string;revision:number}|null;
  cameraMemory?: CameraMemory;
}
const DETAIL_LEVELS: LOD[] = ['full', 'portrait', 'marker'];

export const GravityWorld = memo(function GravityWorld({ brands, focus, positions, relations, selectedId, resetKey, onInspect, locateRequest, cameraMemory }: Props) {
  const { canvasRef, worldRef, view, size, dragging, zoom, flyTo, handlers } = useViewport(resetKey, onInspect, cameraMemory);
  const presentationScale = gravityPresentationScale(positions, size);
  const displayPositions = useMemo(() => positions.map(position => ({ ...position, x: position.x * presentationScale, y: position.y * presentationScale, radius: position.radius * presentationScale })), [positions, presentationScale]);
  const handledLocate=useRef<number|undefined>(locateRequest?.revision);
  useEffect(()=>{
    if(!locateRequest||handledLocate.current===locateRequest.revision)return;
    const position=displayPositions.find(item=>item.brandId===locateRequest.id);
    flyTo(position?.x??0,position?.y??0);handledLocate.current=locateRequest.revision;
  },[locateRequest,displayPositions,flyTo]);
  const nodes = useMemo<SceneNode[]>(() => {
    const positionMap = new Map(displayPositions.map(position => [position.brandId, position]));
    return brands.map(brand => ({
      brand,
      position: positionMap.get(brand.id) ?? { brandId: brand.id, x: 0, y: 0, radius: 0 },
      fit: relations.get(brand.id)?.collaborationFit ?? 100,
      isFocus: brand.id === focus.id,
      exploratory: relations.get(brand.id)?.exploratory,
    }));
  }, [brands, focus.id, displayPositions, relations]);
  const nodeLOD = useMemo(() => resolveLODByDistance(nodes, updateVisibleNodes(nodes, view, size), view, size), [nodes, view, size]);
  const counts: Record<LOD, number> = { full: 0, blurred: 0, simple: 0, portrait: 0, signature: 0, marker: 0, dormant: 0 };
  for (const lod of nodeLOD.values()) counts[lod]++;
  const selectedPosition = displayPositions.find(position => position.brandId === selectedId);
  const showConnection = selectedId !== focus.id && nodeLOD.get(selectedId) !== 'dormant' && selectedPosition;

  return <section className={`canvas-shell ${size.width <= 640 ? 'narrow-world' : ''} ${brands.length <= 7 ? 'sparse-world' : ''} ${dragging ? 'is-dragging' : ''}`} aria-label="品牌引力空间" data-infinite-canvas="true">
    <div className="canvas-intro"><h1>选择一个伙伴。</h1><p>评分越高，距离越近 · 拖动探索，缩放查看细节。</p></div>
    <div ref={canvasRef} className="canvas" data-testid="canvas" tabIndex={0} aria-label="引力画布，方向键移动，加减号缩放，Home 回到中心" {...handlers}>
      <div ref={worldRef} className="world" data-testid="world">
        {showConnection ? <svg className={`gravity-connection ${relations.get(selectedId)?.exploratory ? 'is-exploratory' : ''}`} width={VIEW_CONFIG.worldWidth} height={VIEW_CONFIG.worldHeight} viewBox={`${-VIEW_CONFIG.worldWidth / 2} ${-VIEW_CONFIG.worldHeight / 2} ${VIEW_CONFIG.worldWidth} ${VIEW_CONFIG.worldHeight}`} style={{ left: -VIEW_CONFIG.worldWidth / 2, top: -VIEW_CONFIG.worldHeight / 2 }} aria-hidden="true">
          <path key={`${focus.id}-${selectedId}`} d={`M0 0 Q${selectedPosition.x * .5 - selectedPosition.y * .12} ${selectedPosition.y * .5 + selectedPosition.x * .12} ${selectedPosition.x} ${selectedPosition.y}`} pathLength="1" />
        </svg> : null}
        {nodes.map(node => <BrandNode key={node.brand.id} node={node} lod={nodeLOD.get(node.brand.id)!} selected={selectedId === node.brand.id} onSelect={onInspect} />)}
      </div>
    </div>
    <div className="canvas-bottom">
      <div className="field-key" aria-label="视口细节层级">
        {DETAIL_LEVELS.map(lod => <div key={lod}><i className={`key-dot ${lod}`} /><strong>{{full:'完整角色',blurred:'虚化角色',portrait:'头像',marker:'点',dormant:'视口之外',simple:'简化角色',signature:'品牌缩写'}[lod]}</strong><span data-testid={`count-${lod}`}>{counts[lod]}</span></div>)}
        <p>拖动探索 · 滚动缩放<br />点击品牌查看</p>
      </div>
      <div className="zoom-controls" data-no-pan><button aria-label="缩小" disabled={view.zoom <= VIEW_CONFIG.minZoom} onClick={() => zoom(1 / VIEW_CONFIG.zoomStep)}><Icon name="minus" /></button><output aria-label="缩放比例">{Math.round(view.zoom * 100)}%</output><button aria-label="放大" disabled={view.zoom >= VIEW_CONFIG.maxZoom} onClick={() => zoom(VIEW_CONFIG.zoomStep)}><Icon name="plus" /></button></div>
      <span className="canvas-note">{brands.length} 个品牌 · 拖动探索更多伙伴</span>
    </div>
  </section>;
});
