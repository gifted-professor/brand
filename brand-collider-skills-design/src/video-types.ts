export type VideoPendingAction = {
  action_id: string; resume_message_id?: string; type?: string; blocking: boolean; message?: string;
  action_url?: string; payload?: unknown; options?: { id: string; label?: string; effect: string }[];
};
/** Flova remains the source of truth; this stores only integration handles and delivery evidence. */
export type SessionVideo = {
  revision: number; model: 'Seedance 2.5'; resolution: '480p'; aspectRatio: '16:9'; duration: 30;
  status: 'preparing' | 'running' | 'awaiting_input' | 'ready' | 'exporting' | 'completed' | 'recoverable' | 'failed';
  request: string; brief: string; projectId?: string; projectUrl?: string; streamChatId?: string; exportTaskId?: string;
  productionRounds?: number; assemblyRequested?: boolean; missingRunResubmitted?: boolean;
  operation?: 'create' | 'upload' | 'run' | 'export'; runSubmitted?: boolean; exportSubmitted?: boolean;
  summary: string; pendingActions: VideoPendingAction[];
  sources: { id: string; name: string; hash: string; kind: 'material' | 'identity' }[];
  assets: { id: string; name: string; kind: 'image' | 'video'; url: string; size: number; mimeType: string; hash: string; final?: boolean }[];
};
