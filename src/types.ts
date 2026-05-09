import type { ReferenceImagePayload } from './imagePayload'

export type AspectRatio =
  | 'auto'
  | '1:1'
  | '3:2'
  | '2:3'
  | '4:3'
  | '3:4'
  | '5:4'
  | '4:5'
  | '16:9'
  | '9:16'
  | '2:1'
  | '1:2'
  | '21:9'
  | '9:21';

export type Resolution = '1k' | '2k' | '4k';
export type ImageModel = 'gpt-image-2' | 'gpt-image-2-all';
export type ImageQuality = 'auto' | 'high' | 'medium' | 'low';
export type ImageBackground = 'auto' | 'opaque';
export type OutputFormat = 'png' | 'jpeg' | 'webp';
export type ModerationLevel = 'auto' | 'low';
export type ResponseFormat = 'url' | 'b64_json';
export type TaskStage =
  | 'preparing'
  | 'submitting'
  | 'generating'
  | 'fetching'
  | 'completed'
  | 'failed';

export interface GenerationSettings {
  model: ImageModel;
  n: number;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  outputCompression: number;
  responseFormat: ResponseFormat;
  skipError: boolean;
}

export interface GenerationRequest {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  n: number;
  quality: ImageQuality;
  background: ImageBackground;
  outputFormat: OutputFormat;
  outputCompression: number;
  moderation: ModerationLevel;
  responseFormat: ResponseFormat;
  asyncMode: boolean;
  webhook: string;
  maxPollAttempts: number;
  pollInterval: number;
  maxRetries: number;
  initialTimeout: number;
  skipError: boolean;
  model: ImageModel;
  images: ReferenceImagePayload[];
}

export interface GenerateOptions {
  timestamp?: number;
  batchId?: string;
  batchIndex?: number;
  batchSize?: number;
}

export interface GenerationEditDraft {
  id: string;
  request: GenerationRequest;
  batchSize?: number;
}

export type TaskParams = GenerationRequest

export interface Task {
  id: string;
  status: 'loading' | 'success' | 'error' | 'interrupted';
  timestamp: number;
  batchId?: string;
  batchIndex?: number;
  batchSize?: number;
  params: TaskParams;
  progress: number;
  stage: TaskStage;
  startedAt: number;
  endedAt?: number;
  resultImages?: string[];
  errorMsg?: string;
  referencesOmitted?: boolean;
}
