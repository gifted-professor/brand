import type { SkillId } from './collider-types.ts';

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
export type ProductionWorkflowStep = {
  id: string; label: string; agentName: string; skill: SkillId; standpoint: 'a' | 'b';
  status: 'pending' | 'running' | 'paused' | 'failed' | 'completed';
  // Only present after this step has an actual artifact or dispatch on the canvas.
  nodeId?: string;
};
export type ProductionWorkflow = {
  revision: number;
  status: 'running' | 'paused' | 'failed' | 'awaiting_selection' | 'completed';
  phase: 'orchestrator' | 'specialist' | 'selection' | 'finished';
  currentStepId?: string; currentNodeId?: string; currentAction: string;
  completedSteps: number; totalSteps: number; steps: ProductionWorkflowStep[];
};
export type ProductionProject = ProductionProjectSummary & {
  sourceThreadId?: string; selectionStatus: 'sample' | 'unselected' | 'selected';
  lanes: { id: ProductionLaneId; label: string; description: string }[];
  nodes: ProductionNode[]; edges: ProductionEdge[]; assets: ProductionAsset[]; notes: string[];
  workflow?: ProductionWorkflow;
};
