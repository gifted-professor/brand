import type { ProductionNode } from '../src/production-types.ts';

export type CanvasLayerId = 'orchestrator' | 'research' | 'ideation' | 'design' | 'copy' | 'image' | 'video' | 'review';
export type CanvasPoint = { x: number; y: number };
type LayerNode = Pick<ProductionNode, 'id' | 'kind' | 'lane'>;
type LayoutNode = LayerNode & Pick<ProductionNode, 'displayOrder'>;

export const CANVAS_LAYERS: readonly {
  id: CanvasLayerId; label: string; agent: string; description: string;
}[] = [
  { id: 'orchestrator', label: '主控', agent: '联名总策划', description: '共同简报、任务安排与阶段交接' },
  { id: 'research', label: '研究', agent: '研究 Agent', description: '品牌资料、共同洞察与研究报告' },
  { id: 'ideation', label: '创意', agent: '创作 Agent', description: '联名方向、创意比较与选定命题' },
  { id: 'design', label: '设计', agent: '设计 Agent', description: '产品体验、物料设计与执行规格' },
  { id: 'copy', label: '文案', agent: '文案 Agent', description: '品牌故事、传播文案与脚本' },
  { id: 'image', label: '生图', agent: '生图 Agent', description: '视觉计划、生成任务与图像成果' },
  { id: 'video', label: '视频', agent: '视频 Agent', description: '视频筹备、镜头与音视频素材' },
  { id: 'review', label: '审查', agent: '审查 Agent', description: '审查意见、修改记录与交付文件' },
];

export const CANVAS_CARD_WIDTH = 304;
export const CANVAS_CARD_HEIGHT = 336;
export const CANVAS_COLUMN_GAP = 28;
export const CANVAS_ROW_GAP = 380;
export const CANVAS_LAYER_GAP = 1160;
export const CANVAS_COLUMNS = 3;

/** Layers describe agent work; a design reference image remains design work. */
export function nodeLayer(node: LayerNode): CanvasLayerId {
  if (node.id === 'workflow-brief') return 'orchestrator';
  switch (node.lane) {
    case 'strategy':
      return node.kind === 'concept' || node.id === 'collab-ideation' || /^concept(?:[-_:]|$)/.test(node.id)
        ? 'ideation' : 'research';
    case 'materials': return 'design';
    case 'story': return 'copy';
    case 'media': return node.kind === 'video' || node.kind === 'audio' ? 'video' : 'image';
    case 'video': return 'video';
    case 'review': return 'review';
  }
}

/** Fixed world coordinates, independent of viewport, visibility and other layers. */
export function canvasLayerOrigin(id: CanvasLayerId): CanvasPoint {
  // Reserve a new column to the left; adding the controller must not move any
  // of the seven existing layers or invalidate users' saved node positions.
  return { x: (CANVAS_LAYERS.findIndex(layer => layer.id === id) - 1) * CANVAS_LAYER_GAP, y: 84 };
}

/** Place every artifact on one plane. Apply layer visibility after this layout. */
export function arrangeInfiniteNodes(nodes: readonly LayoutNode[]): Record<string, CanvasPoint> {
  const entries: [string, CanvasPoint][] = [];
  for (const layer of CANVAS_LAYERS) {
    const origin = canvasLayerOrigin(layer.id);
    const ordered = nodes.filter(node => nodeLayer(node) === layer.id).sort((a, b) => {
      const aOrder = Number.isFinite(a.displayOrder) ? a.displayOrder! : Infinity;
      const bOrder = Number.isFinite(b.displayOrder) ? b.displayOrder! : Infinity;
      return aOrder === bOrder ? 0 : aOrder < bOrder ? -1 : 1;
    });
    ordered.forEach((node, index) => entries.push([node.id, {
      x: origin.x + index % CANVAS_COLUMNS * (CANVAS_CARD_WIDTH + CANVAS_COLUMN_GAP),
      y: origin.y + Math.floor(index / CANVAS_COLUMNS) * CANVAS_ROW_GAP,
    }]));
  }
  return Object.fromEntries(entries);
}

/** Keep the user's world positions, including temporarily absent artifacts. */
export function reconcileInfinitePositions(
  existing: Record<string, CanvasPoint>,
  nodes: readonly LayoutNode[],
): Record<string, CanvasPoint> {
  const entries = Object.entries(existing);
  const positions = new Map(entries.filter(([, point]) => point && Number.isFinite(point.x) && Number.isFinite(point.y)));
  const occupied = [...positions.values()];
  let changed = positions.size !== entries.length;
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  // Use the same stable source ordering as a fresh canvas, but never recalculate
  // coordinates for artifacts that have already appeared or have been dragged.
  const ordered = Object.entries(arrangeInfiniteNodes(nodes))
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  for (const [id] of ordered) {
    if (positions.has(id)) continue;
    const origin = canvasLayerOrigin(nodeLayer(nodesById.get(id)!));
    // One card can overlap at most two columns and two rows of this grid.
    // Four occupied cells per card plus one guarantees a free candidate.
    const candidateCount = occupied.length * 4 + 1;
    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = {
        x: origin.x + index % CANVAS_COLUMNS * (CANVAS_CARD_WIDTH + CANVAS_COLUMN_GAP),
        y: origin.y + Math.floor(index / CANVAS_COLUMNS) * CANVAS_ROW_GAP,
      };
      const overlaps = occupied.some(point => candidate.x < point.x + CANVAS_CARD_WIDTH
        && candidate.x + CANVAS_CARD_WIDTH > point.x
        && candidate.y < point.y + CANVAS_CARD_HEIGHT
        && candidate.y + CANVAS_CARD_HEIGHT > point.y);
      if (overlaps) continue;
      positions.set(id, candidate);
      occupied.push(candidate);
      changed = true;
      break;
    }
  }
  return changed ? Object.fromEntries(positions) : existing;
}
