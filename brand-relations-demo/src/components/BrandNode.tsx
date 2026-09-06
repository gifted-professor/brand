import { drawWearable } from '../domain/drawWardrobe';
import { chineseLabel } from '../domain/chinese';
import { memo } from 'react';
import type { LOD, SceneNode } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { describeBrandCharacter } from '../engines/character';

/** Rendering boundary. Dormant means an empty position container, not hidden SVG. */
export function renderNodeLOD(node: SceneNode, lod: LOD) {
  if (lod === 'dormant') return null;
  const detailed = lod === 'full' || lod === 'simple';
  const named = lod !== 'marker';
  const primary = detailed ? describeBrandCharacter(node.brand).primary : undefined;
  return <>
    {node.isFocus && detailed ? <span className="focus-halo" aria-hidden="true" /> : null}
    <span className="node-art"><BrandCharacter brand={node.brand} lod={lod} look={drawWearable(node.brand)} /></span>
    {named ? <span className="brand-name">{node.brand.name}</span> : null}
    {detailed ? <span className="node-capability">{chineseLabel(primary?.label ?? '能力待补充')}</span> : null}
    {node.isFocus && detailed ? <span className="brand-meta focus-label">当前聚焦</span> : lod === 'full' ? <span className="brand-meta">{node.exploratory ? '待探索' : <><strong>{node.fit}</strong><span> /100</span></>}</span> : null}
  </>;
}

export const BrandNode = memo(function BrandNode({ node, lod, selected, onSelect }: {
  node: SceneNode; lod: LOD; selected: boolean; onSelect: (id: string) => void;
}) {
  const { brand, position, isFocus } = node;
  const primary = chineseLabel(describeBrandCharacter(brand).primary?.label ?? '能力待补充');
  return <div className="brand-position" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    data-node-id={brand.id} data-x={position.x} data-y={position.y} data-lod={lod} data-fit={node.fit} data-exploratory={node.exploratory || undefined} data-focus={isFocus}>
    {lod === 'dormant' ? null : <button className={`brand-node lod-${lod} ${isFocus ? 'is-focus' : ''} ${selected ? 'is-selected' : ''}`}
      data-brand-id={brand.id} title={brand.name}
      aria-label={isFocus ? `${brand.name}, ${primary}, 当前聚焦，查看品牌` : `${brand.name}, ${primary}, ${node.exploratory ? '待探索' : `${node.fit} 合作评分`}，查看品牌`}
      aria-pressed={selected}
      onClick={event => { if (event.detail === 0) onSelect(brand.id); }}>
      {renderNodeLOD(node, lod)}
    </button>}
  </div>;
});
