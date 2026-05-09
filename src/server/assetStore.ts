import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AssetConfigResponse, AssetDaySummary, AssetItem, AssetListResponse } from '../assetTypes'
import type { GenerateApiRequest } from '../apiTypes'
import type { TaskParams } from '../types'
import type { ReferenceImagePayload } from '../imagePayload'
import type { ServerRuntime } from './runtimeConfig'
import { readRuntimeSettings, writeRuntimeSettings } from './runtimeConfig'

interface AssetIndexRecord {
  id: string;
  day: string;
  filename: string;
  filepath: string;
  thumbPath: string;
  prompt: string;
  createdAt: number;
  width?: number;
  height?: number;
  params: TaskParams;
  referenceImages?: ReferenceImagePayload[];
}

interface SaveAssetResult {
  images: string[];
  assets: AssetItem[];
}

interface NativeImageSize {
  width: number;
  height: number;
}

interface NativeImageInstance {
  isEmpty: () => boolean;
  getSize: () => NativeImageSize;
  resize: (options: { width: number; height: number; quality?: 'good' | 'better' | 'best' }) => NativeImageInstance;
  toJPEG: (quality: number) => Buffer;
}

interface NativeImageModule {
  createFromBuffer: (buffer: Buffer) => NativeImageInstance;
}

interface IndexCacheEntry {
  mtimeMs: number;
  size: number;
  records: AssetIndexRecord[];
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const BINARY_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
const IMAGE_EXTENSIONS = new Set(Object.keys(BINARY_EXTENSIONS))
const ASSET_META_DIR = '.oldx'
const INDEX_FILE = 'assets-index.json'
const REFERENCES_DIR = 'references'
const THUMBS_DIR = 'thumbs'
const THUMB_MAX_EDGE = 480
const THUMB_JPEG_QUALITY = 74

const requireElectron = createRequire(import.meta.url)
const indexCache = new Map<string, IndexCacheEntry>()
let nativeImageCache: NativeImageModule | null | undefined

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

const sendJson = (response: ServerResponse, statusCode: number, payload: AssetConfigResponse | AssetListResponse | { ok: false; error: string }) => {
  response.writeHead(statusCode, JSON_HEADERS)
  response.end(JSON.stringify(payload))
}

const ensureDir = (path: string) => {
  mkdirSync(path, { recursive: true })
}

const getOutputDir = (runtime: ServerRuntime) => {
  const settings = readRuntimeSettings(runtime)
  const configured = settings.OLDX_OUTPUT_DIR || runtime.env.OLDX_OUTPUT_DIR || ''
  return resolve(configured.trim() || runtime.defaultOutputDir)
}

const normalizeIdPath = (value: string) => normalize(value).replace(/\\/g, '/')

const toAssetUrl = (filepath: string, variant: 'image' | 'thumb') =>
  `/api/assets/file?variant=${variant}&id=${encodeURIComponent(normalizeIdPath(filepath))}`

const indexPath = (outputDir: string) => join(outputDir, ASSET_META_DIR, INDEX_FILE)

const metadataPath = (filepath: string) => {
  const extension = extname(filepath)
  return extension ? `${filepath.slice(0, -extension.length)}.json` : `${filepath}.json`
}

const getIndexCacheKey = (outputDir: string) => resolve(indexPath(outputDir)).toLowerCase()

const getIndexFileSignature = (file: string) => {
  if (!existsSync(file)) return null
  const stats = statSync(file)
  return { mtimeMs: stats.mtimeMs, size: stats.size }
}

const getNativeImage = () => {
  if (nativeImageCache !== undefined) return nativeImageCache

  if (typeof process === 'undefined' || !process.versions.electron) {
    nativeImageCache = null
    return nativeImageCache
  }

  try {
    const electron = requireElectron('electron') as { nativeImage?: NativeImageModule }
    nativeImageCache = electron.nativeImage || null
  } catch (error) {
    console.error('[asset-store] Failed to load Electron nativeImage for thumbnails', error)
    nativeImageCache = null
  }

  return nativeImageCache
}

const thumbCacheRoot = (outputDir: string) => join(outputDir, ASSET_META_DIR, THUMBS_DIR)

const thumbnailPathForFile = (outputDir: string, filepath: string) => {
  const hash = createHash('sha1')
    .update(normalizeIdPath(resolve(filepath)).toLowerCase())
    .digest('hex')
  return join(thumbCacheRoot(outputDir), `${hash}.jpg`)
}

const isThumbCachePath = (outputDir: string, filepath: string) => {
  const root = normalize(resolve(thumbCacheRoot(outputDir))).toLowerCase()
  const target = normalize(resolve(filepath)).toLowerCase()
  return target === root || target.startsWith(`${root}\\`) || target.startsWith(`${root}/`)
}

const writeThumbnail = (sourceBytes: Buffer, thumbPath: string) => {
  const nativeImage = getNativeImage()
  if (!nativeImage) return false

  try {
    const image = nativeImage.createFromBuffer(sourceBytes)
    if (image.isEmpty()) return false

    const size = image.getSize()
    if (!size.width || !size.height) return false

    const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(size.width, size.height))
    const resized = scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: 'good',
        })
      : image

    ensureDir(dirname(thumbPath))
    writeFileSync(thumbPath, resized.toJPEG(THUMB_JPEG_QUALITY))
    return true
  } catch (error) {
    console.error('[asset-store] Failed to create thumbnail', error)
    return false
  }
}

const ensureThumbnail = (outputDir: string, filepath: string) => {
  if (isThumbCachePath(outputDir, filepath)) return filepath

  const thumbPath = thumbnailPathForFile(outputDir, filepath)
  if (existsSync(thumbPath)) return thumbPath

  try {
    const sourceBytes = readFileSync(filepath)
    return writeThumbnail(sourceBytes, thumbPath) ? thumbPath : filepath
  } catch (error) {
    console.error('[asset-store] Failed to read source image for thumbnail', error)
    return filepath
  }
}

const readIndex = (outputDir: string): AssetIndexRecord[] => {
  const file = indexPath(outputDir)
  if (!existsSync(file)) return []
  const signature = getIndexFileSignature(file)

  const cacheKey = getIndexCacheKey(outputDir)
  const cached = indexCache.get(cacheKey)
  if (signature && cached && cached.mtimeMs === signature.mtimeMs && cached.size === signature.size) {
    return cached.records
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`[asset-store] Invalid index shape: ${file}`)
      return []
    }
    const records = parsed.filter(item => item && typeof item === 'object') as AssetIndexRecord[]
    if (signature) {
      indexCache.set(cacheKey, {
        ...signature,
        records,
      })
    }
    return records
  } catch (error) {
    console.error(`[asset-store] Failed to read index: ${file}`, error)
    return []
  }
}

const writeIndex = (outputDir: string, records: AssetIndexRecord[]) => {
  const file = indexPath(outputDir)
  ensureDir(dirname(file))
  writeFileSync(file, JSON.stringify(records, null, 2), 'utf8')

  const signature = getIndexFileSignature(file)
  if (signature) {
    indexCache.set(getIndexCacheKey(outputDir), {
      ...signature,
      records,
    })
  }
}

const getDay = (timestamp: number) => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getExtensionFromContentType = (contentType: string) => {
  if (contentType.includes('jpeg')) return '.jpg'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('gif')) return '.gif'
  return '.png'
}

const decodeImage = (image: string, preferredFormat: string) => {
  if (image.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(image)
    if (!match) throw new Error('Invalid image data URL')
    const [, mimeType, base64] = match
    return {
      bytes: Buffer.from(base64, 'base64'),
      extension: getExtensionFromContentType(mimeType),
      mimeType,
    }
  }

  return {
    bytes: Buffer.from(image, 'base64'),
    extension: preferredFormat === 'jpeg' ? '.jpg' : `.${preferredFormat || 'png'}`,
    mimeType: `image/${preferredFormat === 'jpg' ? 'jpeg' : preferredFormat || 'png'}`,
  }
}

const assetReferenceId = (assetId: string, index: number) => `${assetId}-ref-${index + 1}`

const isInlineDataUrl = (image: ReferenceImagePayload) => image.dataUrl.startsWith('data:')

const referenceImagesEqual = (left: ReferenceImagePayload[], right: ReferenceImagePayload[]) =>
  left.length === right.length &&
  left.every((image, index) => {
    const other = right[index]
    return Boolean(other) &&
      image.id === other.id &&
      image.name === other.name &&
      image.type === other.type &&
      image.dataUrl === other.dataUrl &&
      image.thumbUrl === other.thumbUrl
  })

const saveReferenceImages = (dayDir: string, assetId: string, images: ReferenceImagePayload[]) => {
  if (images.length === 0) return []

  const referenceDir = join(dayDir, REFERENCES_DIR, assetId)
  return images.map((image, index) => {
    if (!isInlineDataUrl(image)) return image

    ensureDir(referenceDir)
    const decoded = decodeImage(image.dataUrl, 'png')
    const extension = decoded.extension || '.png'
    const filename = `ref-${String(index + 1).padStart(2, '0')}${extension}`
    const filepath = join(referenceDir, filename)

    writeFileSync(filepath, decoded.bytes)

    return {
      id: assetReferenceId(assetId, index),
      name: image.name || `图${index + 1}`,
      type: image.type || decoded.mimeType,
      dataUrl: toAssetUrl(filepath, 'image'),
      thumbUrl: toAssetUrl(filepath, 'thumb'),
    }
  })
}

const sanitizeAssetRecord = (record: AssetIndexRecord) => {
  const paramsImages = record.params.images || []
  const existingReferences = record.referenceImages || []
  const sourceReferences = existingReferences.length > 0 ? existingReferences : paramsImages
  const hasInlineReferences = sourceReferences.some(isInlineDataUrl)
  const references = hasInlineReferences
    ? saveReferenceImages(dirname(record.filepath), record.id, sourceReferences)
    : sourceReferences
  const paramsHadInlineImages = paramsImages.some(isInlineDataUrl)
  const shouldAttachReferences = existingReferences.length === 0 && references.length > 0
  const shouldReplaceParamsImages = paramsHadInlineImages ||
    (references.length > 0 && !referenceImagesEqual(paramsImages, references))

  if (!hasInlineReferences && !shouldAttachReferences && !shouldReplaceParamsImages) {
    return { record, changed: false }
  }

  return {
    changed: true,
    record: {
      ...record,
      referenceImages: references,
      params: {
        ...record.params,
        images: references,
      },
    },
  }
}

const sanitizeIndexRecords = (outputDir: string, records: AssetIndexRecord[]) => {
  let changed = false
  const nextRecords = records.map(record => {
    const result = sanitizeAssetRecord(record)
    if (!result.changed) return record

    changed = true
    try {
      writeFileSync(metadataPath(result.record.filepath), JSON.stringify(result.record, null, 2), 'utf8')
    } catch (error) {
      console.error(`[asset-store] Failed to update asset metadata for ${result.record.filepath}`, error)
    }
    return result.record
  })

  if (changed) writeIndex(outputDir, nextRecords)
  return nextRecords
}

const toTaskParams = (request: GenerateApiRequest): TaskParams => ({
  prompt: request.prompt,
  aspectRatio: request.aspectRatio,
  resolution: request.resolution,
  n: request.n,
  quality: request.quality,
  background: request.background,
  outputFormat: request.outputFormat,
  outputCompression: request.outputCompression,
  moderation: request.moderation,
  responseFormat: request.responseFormat,
  asyncMode: request.asyncMode,
  webhook: request.webhook,
  maxPollAttempts: request.maxPollAttempts,
  pollInterval: request.pollInterval,
  maxRetries: request.maxRetries,
  initialTimeout: request.initialTimeout,
  skipError: request.skipError,
  model: request.model,
  images: request.images,
})

const toAssetItem = (record: AssetIndexRecord): AssetItem => ({
  ...record,
  hasReferenceImages: (record.referenceImages?.length || record.params.images.length) > 0,
  params: {
    ...record.params,
    images: record.referenceImages || [],
  },
  referenceImages: record.referenceImages || [],
  imageUrl: toAssetUrl(record.filepath, 'image'),
  thumbUrl: toAssetUrl(record.filepath, 'thumb'),
})

const mergeIndexRecords = (current: AssetIndexRecord[], nextRecords: AssetIndexRecord[]) => {
  const merged = new Map<string, AssetIndexRecord>()
  for (const record of current) merged.set(record.id, record)
  for (const record of nextRecords) merged.set(record.id, record)
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt)
}

const scanOutputDir = (outputDir: string): AssetIndexRecord[] => {
  if (!existsSync(outputDir)) return []
  const records: AssetIndexRecord[] = []
  const days = readdirSync(outputDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map(entry => entry.name)

  for (const day of days) {
    const dayDir = join(outputDir, day)
    const files = readdirSync(dayDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map(entry => join(dayDir, entry.name))

    for (const filepath of files) {
      const metaPath = metadataPath(filepath)
      let metadata: Partial<AssetIndexRecord> = {}
      if (existsSync(metaPath)) {
        try {
          metadata = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<AssetIndexRecord>
        } catch {
          metadata = {}
        }
      }

      const fileStat = statSync(filepath)
      const id = metadata.id || `${day}-${basename(filepath, extname(filepath))}`
      const thumbPath = metadata.thumbPath || filepath
      const params = metadata.params || ({
        prompt: metadata.prompt || '',
        aspectRatio: 'auto',
        resolution: '1k',
        n: 1,
        quality: 'auto',
        background: 'auto',
        outputFormat: 'png',
        outputCompression: 100,
        moderation: 'auto',
        responseFormat: 'url',
        asyncMode: true,
        webhook: '',
        maxPollAttempts: 300,
        pollInterval: 5,
        maxRetries: 5,
        initialTimeout: 900,
        skipError: false,
        model: 'gpt-image-2',
        images: [],
      } satisfies TaskParams)

      records.push({
        id,
        day,
        filename: basename(filepath),
        filepath,
        thumbPath,
        prompt: metadata.prompt || params.prompt || '',
        createdAt: metadata.createdAt || fileStat.mtimeMs,
        width: metadata.width,
        height: metadata.height,
        params,
        referenceImages: metadata.referenceImages,
      })
    }
  }

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

const refreshIndex = (outputDir: string) => {
  ensureDir(outputDir)
  const current = readIndex(outputDir)
  const scanned = scanOutputDir(outputDir)
  const currentByPath = new Map(current.map(record => [normalizeIdPath(record.filepath), record]))
  const merged = scanned.map(record => currentByPath.get(normalizeIdPath(record.filepath)) || record)
  writeIndex(outputDir, merged)
  return merged
}

const getIndexedAssets = (outputDir: string) => {
  ensureDir(outputDir)
  const current = readIndex(outputDir)
  return sanitizeIndexRecords(outputDir, current.length > 0 ? current : refreshIndex(outputDir))
}

export const saveGeneratedAssets = (request: GenerateApiRequest, images: string[], runtime: ServerRuntime): SaveAssetResult => {
  const outputDir = getOutputDir(runtime)
  const createdAt = Date.now()
  const day = getDay(createdAt)
  const dayDir = join(outputDir, day)
  ensureDir(dayDir)

  const records: AssetIndexRecord[] = []
  const savedImages: string[] = []
  const baseParams = toTaskParams(request)

  images.forEach((image, index) => {
    const decoded = decodeImage(image, request.outputFormat)
    const id = `${day}-${String(createdAt).slice(-8)}-${index + 1}-${randomUUID().slice(0, 8)}`
    const filename = `${id}${decoded.extension}`
    const filepath = join(dayDir, filename)
    const thumbCandidate = thumbnailPathForFile(outputDir, filepath)
    const thumbPath = writeThumbnail(decoded.bytes, thumbCandidate) ? thumbCandidate : filepath
    const metaPath = metadataPath(filepath)
    const referenceImages = saveReferenceImages(dayDir, id, request.images)
    const params = {
      ...baseParams,
      images: referenceImages,
    }
    const record: AssetIndexRecord = {
      id,
      day,
      filename,
      filepath,
      thumbPath,
      prompt: request.prompt,
      createdAt,
      params,
      referenceImages,
    }

    writeFileSync(filepath, decoded.bytes)
    writeFileSync(metaPath, JSON.stringify(record, null, 2), 'utf8')
    records.push(record)
    savedImages.push(toAssetUrl(filepath, 'image'))
  })

  writeIndex(outputDir, mergeIndexRecords(readIndex(outputDir), records))
  return { images: savedImages, assets: records.map(toAssetItem) }
}

export const getAssetConfig = (runtime: ServerRuntime): AssetConfigResponse => ({
  ok: true,
  outputDir: getOutputDir(runtime),
  defaultOutputDir: runtime.defaultOutputDir,
})

export const saveAssetConfig = async (request: IncomingMessage, runtime: ServerRuntime): Promise<AssetConfigResponse> => {
  const body = await readJsonBody<{ outputDir?: string }>(request)
  const outputDir = body.outputDir?.trim()
  if (!outputDir) return getAssetConfig(runtime)

  const resolved = resolve(outputDir)
  ensureDir(resolved)
  writeRuntimeSettings(runtime, { OLDX_OUTPUT_DIR: resolved })
  refreshIndex(resolved)
  return {
    ok: true,
    outputDir: resolved,
    defaultOutputDir: runtime.defaultOutputDir,
  }
}

export const listAssets = (request: IncomingMessage, runtime: ServerRuntime): AssetListResponse => {
  const outputDir = getOutputDir(runtime)
  const url = new URL(request.url || '/api/assets', 'http://localhost')
  const dayParam = url.searchParams.get('day') || ''
  const cursor = Math.max(0, Number(url.searchParams.get('cursor') || 0))
  const pageSize = Math.min(80, Math.max(12, Number(url.searchParams.get('pageSize') || 40)))
  const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase()
  const tokens = keyword.split(/\s+/).filter(Boolean)
  const index = getIndexedAssets(outputDir)
  const daysMap = new Map<string, number>()

  for (const record of index) {
    daysMap.set(record.day, (daysMap.get(record.day) || 0) + 1)
  }

  const days: AssetDaySummary[] = Array.from(daysMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.day.localeCompare(a.day))

  const firstDay = dayParam || days[0]?.day || getDay(Date.now())
  const filtered = index
    .filter(record => record.day === firstDay)
    .filter(record => tokens.length === 0 || tokens.every(token => record.prompt.toLowerCase().includes(token)))
    .sort((a, b) => b.createdAt - a.createdAt)

  const page = filtered.slice(cursor, cursor + pageSize)
  const nextCursor = cursor + page.length < filtered.length ? cursor + page.length : null

  return {
    ok: true,
    outputDir,
    days,
    items: page.map(toAssetItem),
    nextCursor,
    hasMore: nextCursor !== null,
    total: filtered.length,
  }
}

export const serveAssetFile = (request: IncomingMessage, response: ServerResponse, runtime: ServerRuntime) => {
  const outputDir = getOutputDir(runtime)
  const url = new URL(request.url || '/api/assets/file', 'http://localhost')
  const id = url.searchParams.get('id') || ''
  const variant = url.searchParams.get('variant') || 'image'
  const resolved = resolve(id)
  const relative = normalize(resolved).toLowerCase()
  const allowedRoot = normalize(resolve(outputDir)).toLowerCase()

  if (!relative.startsWith(allowedRoot) || !existsSync(resolved)) {
    response.writeHead(404, JSON_HEADERS)
    response.end(JSON.stringify({ ok: false, error: 'Asset not found' }))
    return
  }

  const fileToServe = variant === 'thumb' ? ensureThumbnail(outputDir, resolved) : resolved
  const extension = extname(fileToServe).toLowerCase()
  response.writeHead(200, {
    'Content-Type': BINARY_EXTENSIONS[extension] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
  createReadStream(fileToServe)
    .on('error', error => {
      if (!response.headersSent) {
        response.writeHead(500, JSON_HEADERS)
      }
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    })
    .pipe(response)
}

export const handleAssetConfigRoute = async (request: IncomingMessage, response: ServerResponse, runtime: ServerRuntime) => {
  try {
    if (request.method === 'GET') {
      sendJson(response, 200, getAssetConfig(runtime))
      return
    }

    if (request.method === 'POST') {
      sendJson(response, 200, await saveAssetConfig(request, runtime))
      return
    }

    sendJson(response, 405, { ok: false, error: 'Method not allowed' })
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

export const handleAssetsRoute = (request: IncomingMessage, response: ServerResponse, runtime: ServerRuntime) => {
  try {
    if (request.method !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'Method not allowed' })
      return
    }

    sendJson(response, 200, listAssets(request, runtime))
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
