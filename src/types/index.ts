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
  thumbnailUrl?: string;
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
  progressText?: string;
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

export interface ResponseContent {
  parts: Array<{
    text?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  }>;
}

export type WorkerMessage =
  | { type: 'REGISTER'; model?: string }
  | { type: 'RESPONSE'; requestId: string; content: ResponseContent }
  | { type: 'ERROR'; requestId?: string; error: string }
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'GENERATE'; requestId: string; model: string; contents: unknown[]; aspect_ratio: string }
  | { type: 'PROGRESS'; requestId: string; text: string };
