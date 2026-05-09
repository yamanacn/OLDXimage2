import type { TaskParams } from './types'
import type { ReferenceImagePayload } from './imagePayload'

export interface AssetItem {
  id: string;
  day: string;
  filename: string;
  filepath: string;
  thumbPath: string;
  imageUrl: string;
  thumbUrl: string;
  prompt: string;
  createdAt: number;
  width?: number;
  height?: number;
  params: TaskParams;
  hasReferenceImages?: boolean;
  referenceImages?: ReferenceImagePayload[];
}

export interface AssetDaySummary {
  day: string;
  count: number;
}

export interface AssetConfigSuccess {
  ok: true;
  outputDir: string;
  defaultOutputDir: string;
}

export interface AssetConfigFailure {
  ok: false;
  error: string;
}

export type AssetConfigResponse = AssetConfigSuccess | AssetConfigFailure

export interface AssetListSuccess {
  ok: true;
  outputDir: string;
  days: AssetDaySummary[];
  items: AssetItem[];
  nextCursor: number | null;
  hasMore: boolean;
  total: number;
}

export interface AssetListFailure {
  ok: false;
  error: string;
}

export type AssetListResponse = AssetListSuccess | AssetListFailure
