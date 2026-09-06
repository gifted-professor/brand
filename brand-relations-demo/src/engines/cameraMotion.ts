import type { Viewport } from '../domain/types';

/** Frame-rate independent convergence, with no overshoot or permanent idle loop. */
export function stepCamera(current: Viewport, target: Viewport, elapsedMs: number) {
  const alpha = 1 - Math.exp(-Math.max(0, Math.min(64, elapsedMs)) / 65);
  const next = { x: current.x+(target.x-current.x)*alpha, y: current.y+(target.y-current.y)*alpha, zoom: current.zoom+(target.zoom-current.zoom)*alpha };
  const settled = Math.abs(next.x-target.x)<.15 && Math.abs(next.y-target.y)<.15 && Math.abs(next.zoom-target.zoom)<.0005;
  return { view:settled?target:next, settled };
}
