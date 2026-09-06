/** Public, persisted media progress. Local paths and provider credentials never
 * cross this boundary; URLs address only files registered by the host. */
export type MediaSourceClass = 'official' | 'brand_approved' | 'third_party' | 'reference_only' | 'ai_generated' | 'unknown';
export type MediaAssetType = 'character' | 'logo' | 'product' | 'scene' | 'other';
export type MediaReferenceInspection = {
  status: 'verified' | 'rejected' | 'unverified'; sourceClass: MediaSourceClass;
  sourceRelationship: 'verified' | 'unverified'; identityVerified: boolean;
  subject: string; version: string; evidence: string; limitations: string[];
  imageHash: string; sourcePageHash: string; inspectedAt: string;
  /** Optional only for historical records; new inspections must supply both. */
  targetMatch?: 'matched' | 'mismatched' | 'uncertain'; assetType?: MediaAssetType;
};
export type MediaReference = {
  referenceId: string; brandId: 'a' | 'b'; sourcePageUrl: string; sourcePageFinalUrl: string;
  sourceImageUrl: string; imageFinalUrl: string; sourcePageContentHash: string;
  title: string | null; publisher: string | null; subject: string; version: string | null; purpose: string;
  contentHash: string; width: number; height: number; mimeType: string; retrievedAt: string;
  sourceClass: MediaSourceClass; inspection?: MediaReferenceInspection; imageUrl: string;
};
export type MediaBinding = {
  materialId: string; referenceIds: string[]; referenceTasks: string[];
  identityRequired: boolean; identityReferenceIds: string[];
  identityRequirements: string[]; rationale: string; status: 'ready' | 'blocked'; reason: string;
  identityTargets?: { subject: string; assetType: MediaAssetType; referenceIds: string[] }[];
  mappingHash: string;
};
export type MediaAttachmentEvidence = {
  source: 'file' | 'task'; referenceId?: string; taskId?: string; contentHash: string;
};
export type MediaMaterial = {
  materialId: string; name: string; priority: 'core' | 'recommended' | 'optional';
  status: 'planned' | 'out_of_scope' | 'ready' | 'blocked' | 'running' | 'succeeded' | 'unknown' | 'failed' | 'waiting_review' | 'waiting_capacity' | 'approved' | 'needs_revision';
  reason?: string; binding?: MediaBinding;
  imageUrl?: string; outputHash?: string; requestId?: string; model?: string;
  attachments?: MediaAttachmentEvidence[];
  submittedReferences?: { contentHash: string; mimeType: string; bytes: number }[];
  review?: { status: 'approved' | 'needs_revision'; outputHash: string; evidence: string; reviewedAt: string };
};
export type AutomaticMediaState = {
  version: 1; sessionId: string; revision: number; updatedAt: string;
  phase: 'idle' | 'collecting' | 'binding' | 'prepared' | 'generating' | 'reviewing' | 'completed' | 'partial' | 'paused';
  discovery: { a: 'pending' | 'running' | 'completed' | 'failed'; b: 'pending' | 'running' | 'completed' | 'failed' };
  references: MediaReference[]; materials: MediaMaterial[]; limitations: string[];
  discoveryPages?: { sourcePageUrl: string; sourcePageFinalUrl: string; sourcePageContentHash: string; pageRetrievedAt: string;
    title: string | null; candidateImageUrls: string[] }[];
  concurrency: 4;
};
