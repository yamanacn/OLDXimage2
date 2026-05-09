import type { GenerationRequest } from './types'
import type { AssetItem } from './assetTypes'

export type GenerateApiRequest = GenerationRequest

export interface GenerateApiSuccess {
  ok: true;
  images: string[];
  assets?: AssetItem[];
  imageUrl: string;
  response: string;
  taskId?: string;
  usage?: Record<string, unknown>;
}

export interface GenerateApiFailure {
  ok: false;
  error: string;
  response?: string;
}

export type GenerateApiResponse = GenerateApiSuccess | GenerateApiFailure

export interface ProxyConfigSuccess {
  ok: true;
  configured: boolean;
  apiKeyPreview: string;
  apiBase: string;
}

export interface ProxyConfigFailure {
  ok: false;
  error: string;
}

export type ProxyConfigResponse = ProxyConfigSuccess | ProxyConfigFailure
