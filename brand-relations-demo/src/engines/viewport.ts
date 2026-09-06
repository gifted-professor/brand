import { VIEW_CONFIG, VIEWPORT_LOD_CONFIG as LOD_CONFIG } from '../config';
import type { Bounds, LOD, SceneNode, Viewport, ViewportSize } from '../domain/types';

/** World-space bounds for the current camera, with optional screen-pixel overscan. */
export function getViewportBounds(view: Viewport, size: ViewportSize, margin = 0): Bounds {
  return {
    left: (-size.width / 2 - view.x - margin) / view.zoom,
    right: (size.width / 2 - view.x + margin) / view.zoom,
    top: (-size.height / 2 - view.y - margin) / view.zoom,
    bottom: (size.height / 2 - view.y + margin) / view.zoom,
  };
}

export function getNodeScreenPosition(position: { x: number; y: number }, view: Viewport, size: ViewportSize) {
  return { x: size.width / 2 + view.x + position.x * view.zoom, y: size.height / 2 + view.y + position.y * view.zoom };
}

/** Visual priority is independent of placement. Even weak-fit nodes can wake up. */
export function calculateViewportLOD(screen: { x: number; y: number }, _fit: number, view: Viewport, size: ViewportSize, _isFocus?: boolean): LOD {
  // Retain the caller contract; identity and relation fit never gate visual access.
  void _fit; void _isFocus;
  const dx = Math.max(0, -screen.x, screen.x - size.width);
  const dy = Math.max(0, -screen.y, screen.y - size.height);
  if (Math.hypot(dx, dy) > LOD_CONFIG.dormantMargin) return 'dormant';
  // Let the canvas clip artwork at its edges. Edge padding must not change a
  // visible node's stage, otherwise equal-radius peers disagree by direction.
  if (dx > 0 || dy > 0) return 'marker';

  // Euclidean camera distance in world units: equal-distance nodes get equal detail,
  // regardless of angle, identity or selection. Panning can bring any score into focus.
  const distanceFromCenter = Math.hypot(screen.x - size.width / 2, screen.y - size.height / 2) / view.zoom;
  const detailRadius = Math.min(size.width, size.height) * LOD_CONFIG.distanceScale;
  const effectiveZoom = view.zoom / (1 + (distanceFromCenter / detailRadius) ** 2);
  if (effectiveZoom >= LOD_CONFIG.fullMinZoom) return 'full';
  if (effectiveZoom >= LOD_CONFIG.portraitMinZoom) return 'portrait';
  return 'marker';
}

export function updateVisibleNodes(nodes: readonly SceneNode[], view: Viewport, size: ViewportSize): ReadonlyMap<string, LOD> {
  const bounds = getViewportBounds(view, size, LOD_CONFIG.dormantMargin);
  return new Map(nodes.map(node => {
    const { x, y } = node.position;
    const outside = x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
    return [node.brand.id, outside ? 'dormant' : calculateViewportLOD(getNodeScreenPosition(node.position, view, size), node.fit, view, size, node.isFocus)];
  }));
}

export function zoomAt(view: Viewport, factor: number, anchorX = 0, anchorY = 0): Viewport {
  const zoom = Math.min(VIEW_CONFIG.maxZoom, Math.max(VIEW_CONFIG.minZoom, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return { x: anchorX - (anchorX - view.x) * ratio, y: anchorY - (anchorY - view.y) * ratio, zoom };
}

/** The canvas is unbounded; zoom is bounded separately by zoomAt. */
export function constrainViewport(view: Viewport, _size: ViewportSize): Viewport {
  void _size;
  return { ...view };
}

/** Crowding may shrink a whole radial detail band, never pick winners by node ID.
 * Every visible peer at the same camera distance keeps the same presentation.
 */
export function resolveLODByDistance(nodes: readonly SceneNode[], levels: ReadonlyMap<string, LOD>, view: Viewport, size: ViewportSize): ReadonlyMap<string, LOD> {
  const candidates = nodes.map(node => {
    const screen = getNodeScreenPosition(node.position, view, size);
    return { id: node.brand.id, screen, distance: Math.hypot(screen.x - size.width / 2, screen.y - size.height / 2) };
  });
  const result = new Map(levels);
  // Each pass lowers at least one node; there are only two detail transitions.
  for (let pass = 0; pass < nodes.length * 2; pass++) {
    const visible = candidates.filter(node => ['full', 'portrait'].includes(result.get(node.id)!));
    let boundary: { lod: LOD; distance: number } | undefined;
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const aFull = result.get(a.id) === 'full', bFull = result.get(b.id) === 'full';
      // Different bands have different silhouettes; their label boxes must not
      // collapse the entire head band around a single detailed character.
      if (aFull !== bFull) continue;
      const width = (aFull ? 68 : 50) + (bFull ? 68 : 50) + 6;
      const height = (aFull ? 100 : 43) + (bFull ? 100 : 43) + 6;
      if (Math.abs(a.screen.x - b.screen.x) >= width || Math.abs(a.screen.y - b.screen.y) >= height) continue;
      const farther = a.distance > b.distance ? a : b;
      if (!boundary || farther.distance < boundary.distance) boundary = { lod: result.get(farther.id)!, distance: farther.distance };
    }
    if (!boundary) break;
    for (const node of candidates) {
      const lod = result.get(node.id);
      if (node.distance < boundary.distance - .1) continue;
      if (boundary.lod === 'full' && lod === 'full') result.set(node.id, 'portrait');
      else if (boundary.lod === 'portrait' && (lod === 'full' || lod === 'portrait')) result.set(node.id, 'marker');
    }
  }
  return result;
}
