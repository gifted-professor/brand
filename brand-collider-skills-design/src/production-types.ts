export type ProductionLaneId = 'strategy' | 'story' | 'materials' | 'media' | 'video' | 'review';
export type ProductionNodeKind = 'brief' | 'concept' | 'story' | 'material' | 'image' | 'video' | 'audio' | 'review' | 'document';
export type ProductionStatus = 'available' | 'planned' | 'running' | 'needs_revision' | 'unverified' | 'reference' | 'failed';
export type ProductionAsset = {
  id: string; name: string; kind: 'image' | 'video' | 'audio' | 'document' | 'archive';
  url: string; downloadUrl: string; mimeType: string; size: number;
  width?: number; height?: number; sha256?: string;
};
export type ProductionSource = { label: string; path?: string; assetId?: string; sha256?: string };
export type ProductionNode = {
  id: string; kind: ProductionNodeKind; lane: ProductionLaneId; title: string; summary: string;
  status: ProductionStatus; statusLabel?: string; conceptId?: string;
  content?: string; assetIds: string[]; sources: ProductionSource[]; tags?: string[];
  primaryAssetId?: string; displayOrder?: number;
};
export type ProductionEdge = { id: string; source: string; target: string; label?: string };
export type ProductionProjectSummary = { id: string; title: string; summary: string; brandNames: [string, string]; updatedAt: string; nodeCount: number; assetCount: number };
export type ProductionProject = ProductionProjectSummary & {
  sourceThreadId?: string; selectionStatus: 'sample' | 'unselected' | 'selected';
  lanes: { id: ProductionLaneId; label: string; description: string }[];
  nodes: ProductionNode[]; edges: ProductionEdge[]; assets: ProductionAsset[]; notes: string[];
};
