import type { Dimension } from './domain/types';
export const RELATION_WEIGHTS: Record<Dimension, number> = {
  intentFit: 0.35, complementarity: 0.30, audienceExpansion: 0.15,
  chemistry: 0.15, feasibility: 0.05,
};
export const GRAVITY_BANDS = { near: 72, mid: 50 } as const;
export const GRAVITY_CONFIG = {
  minDistance: 220, maxDistance: 1800, gamma: 1.25,
  radialSpread: 0.6,
  nodeSpacingX: 180, nodeSpacingY: 150,
  angleCandidates: 360, collisionPasses: 12, goldenAngle: Math.PI * (3 - Math.sqrt(5)),
} as const;
export const VIEWPORT_LOD_CONFIG = {
  updateIntervalMs: 50,
  dormantMargin: 220,
  edgeInset: 32,
  detailHalfWidth: 68, detailHalfHeight: 100,
  portraitMinZoom: 0.42,
  fullMinZoom: 0.68,
  distanceScale: 0.65,
} as const;
export const VIEW_CONFIG = {
  initialZoom: 0.8, narrowInitialZoom: 0.62, minZoom: 0.35, maxZoom: 2, zoomStep: 1.2,
  dragThreshold: 6,
  worldWidth: 4200, worldHeight: 3600, panPadding: 180,
} as const;
