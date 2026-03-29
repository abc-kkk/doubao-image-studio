export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type ModelId = 'doubao';

export type GenerationStatus = 'idle' | 'pending' | 'generating' | 'success' | 'error';

export interface Model {
  id: ModelId;
  name: string;
  description: string;
  requiresWorker: boolean;
}

export interface GeneratedImage {
  id: string;
  batchId?: string;
  url: string;
  localPath?: string;
  prompt: string;
  model: ModelId;
  aspectRatio: AspectRatio;
  createdAt: number;
  width?: number;
  height?: number;
  referenceImages?: string[];
}

export interface GenerationJob {
  id: string;
  prompt: string;
  model: ModelId;
  aspectRatio: AspectRatio;
  status: GenerationStatus;
  error?: string;
  result?: GeneratedImage;
  referenceImages?: string[];
  startedAt: number;
}

export interface AppSettings {
  websocketUrl: string;
  saveDir: string;
  historyDir: string;
  defaultModel: ModelId;
  defaultAspectRatio: AspectRatio;
}

export interface WorkerMessage {
  type: 'REGISTER' | 'RESPONSE' | 'ERROR' | 'PING' | 'PONG' | 'GENERATE';
  requestId?: string;
  model?: string;
  data?: unknown;
  error?: string;
}
