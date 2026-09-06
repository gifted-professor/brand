import type { CharacterRecipe } from './characterRecipe';
import type { BrandProfile } from './brandProfile';
export interface Brand {
  fictional?: boolean;
  profile?: BrandProfile;
  id: string;
  name: string;
  category: string;
  summary: string;
  offers: string;
  needs: string;
  intent: string;
  audience: string;
  identity: string;
  constraints: string;
  characterSeed: number;
  character?: CharacterRecipe;
  avatarDataUrl?: string;
  /** Stable source identity for presentation-only name localization. */
  visualSeed?: string;
  evidence?: string;
  supportingEvidence?: string;
  contact?: {
    label: string;
    email?: string;
    wechat?: string;
    website?: string;
    note: string;
  };
}

export const RELATION_TYPES = [
  'Mutual Complement', 'Capability Complement', 'Audience Bridge',
  'Creative Chemistry', 'Productive Tension', 'Production Partner',
  'Distribution Bridge', 'Cultural Exchange', 'Technology Transfer',
  'Peer / Same Tribe', 'Weak Fit',
] as const;
export type RelationType = typeof RELATION_TYPES[number];
export type Dimension = 'intentFit' | 'complementarity' | 'audienceExpansion' | 'chemistry' | 'feasibility';
export interface RelationResult extends Record<Dimension, number> {
  sourceBrandId: string;
  targetBrandId: string;
  collaborationFit: number;
  relationType: RelationType;
  reason: string;
  possibleOutcome: string;
  caveat?: string;
  exploratory?: boolean;
}
export type LOD = 'full' | 'blurred' | 'simple' | 'portrait' | 'signature' | 'marker' | 'dormant';
export interface SpatialPosition {
  brandId: string;
  x: number;
  y: number;
  radius: number;
}

export interface Viewport { x: number; y: number; zoom: number }
export interface ViewportSize { width: number; height: number; occlusions?: readonly Bounds[] }
export interface Bounds { left: number; right: number; top: number; bottom: number }
export interface SceneNode {
  brand: Brand;
  position: SpatialPosition;
  fit: number;
  isFocus: boolean;
  exploratory?: boolean;
}

/** Implement an adapter here to load snapshots / precomputed batch relations. */
export interface WorldDataSource {
  loadBrands(seed: number): readonly Brand[];
  getRelations(focus: Brand, brands: readonly Brand[]): readonly RelationResult[];
}
