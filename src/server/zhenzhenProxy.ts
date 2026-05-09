import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { getActualSize, validateGptImage2Size } from '../gptImage2Config'
import type { GenerateApiRequest, GenerateApiResponse, ProxyConfigResponse } from '../apiTypes'
import type { ReferenceImagePayload } from '../imagePayload'
import { handleAssetConfigRoute, handleAssetsRoute, saveGeneratedAssets, serveAssetFile } from './assetStore'
import type { EnvValues, ServerRuntime } from './runtimeConfig'
import { createServerRuntime, readRuntimeSettings, writeRuntimeSettings } from './runtimeConfig'

interface ImageEntry {
  url?: string;
  b64_json?: string;
}

interface PollResult {
  images: string[];
  imageUrl: string;
  taskId: string;
  raw: unknown;
  usage?: Record<string, unknown>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const FALLBACK_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

const sendJson = (response: ServerResponse, statusCode: number, payload: GenerateApiResponse | ProxyConfigResponse) => {
  response.writeHead(statusCode, JSON_HEADERS)
  response.end(JSON.stringify(payload))
}

const maskApiKey = (apiKey: string) => {
  if (!apiKey) return ''
  if (apiKey.length <= 6) return '已配置'
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}`
}

const redactSecrets = (value: string) =>
  value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')

const extractErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''

  const record = payload as Record<string, unknown>
  const candidates = [record.message, record.error, record.detail, record.fail_reason, record.data]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    const nested = extractErrorMessage(candidate)
    if (nested) return nested
  }

  return ''
}

const formatApiError = (status: number, body: string) => {
  let message = body.trim()

  try {
    const parsed = JSON.parse(body) as unknown
    message = extractErrorMessage(parsed) || message
  } catch {
    // Non-JSON API errors are displayed as plain text.
  }

  return redactSecrets(`API ${status}: ${message || '请求失败'}`)
}

const getRuntimeConfig = (runtime: ServerRuntime) => {
  const settings = readRuntimeSettings(runtime)
  return {
    apiKey: settings.ZHENZHEN_API_KEY || runtime.env.ZHENZHEN_API_KEY || '',
    apiBase: settings.ZHENZHEN_API_BASE || runtime.env.ZHENZHEN_API_BASE || 'https://ai.t8star.cn',
  }
}

const getProxyConfig = (runtime: ServerRuntime): ProxyConfigResponse => {
  const config = getRuntimeConfig(runtime)
  return {
    ok: true,
    configured: Boolean(config.apiKey),
    apiKeyPreview: maskApiKey(config.apiKey),
    apiBase: config.apiBase,
  }
}

const saveProxyConfig = async (request: IncomingMessage, runtime: ServerRuntime): Promise<ProxyConfigResponse> => {
  const body = await readJsonBody<{ apiKey?: string; apiBase?: string }>(request)
  const nextValues: Record<string, string> = {}
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    nextValues.ZHENZHEN_API_KEY = body.apiKey.trim()
  }
  if (typeof body.apiBase === 'string' && body.apiBase.trim()) {
    nextValues.ZHENZHEN_API_BASE = body.apiBase.trim()
  }

  if (Object.keys(nextValues).length > 0) writeRuntimeSettings(runtime, nextValues)
  return getProxyConfig(runtime)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const dataUrlToBlob = (image: ReferenceImagePayload) => {
  const [meta, rawBase64] = image.dataUrl.split(',')
  if (!rawBase64) throw new Error(`Invalid image payload: ${image.name}`)

  const mimeFromDataUrl = /data:(.*?);base64/.exec(meta)?.[1]
  const mimeType = image.type || mimeFromDataUrl || 'image/png'
  return new Blob([Buffer.from(rawBase64, 'base64')], { type: mimeType })
}

const appendImageFiles = async (form: FormData, images: ReferenceImagePayload[]) => {
  if (images.length === 0) {
    const blank = await fetch(FALLBACK_PNG_DATA_URL).then(response => response.blob())
    form.append('image', blank, 'blank.png')
    return
  }

  for (const [index, image] of images.entries()) {
    const blob = dataUrlToBlob(image)
    form.append('image', blob, image.name || `image_${index}.png`)
  }
}

const extractImages = async (items: ImageEntry[], maxRetries: number, initialTimeout: number) => {
  const images: string[] = []
  let imageUrl = ''

  for (const item of items) {
    if (item.b64_json) {
      const b64 = item.b64_json.startsWith('data:image')
        ? item.b64_json
        : `data:image/png;base64,${item.b64_json}`
      images.push(b64)
      continue
    }

    if (item.url) {
      if (!imageUrl) imageUrl = item.url
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const download = await fetch(item.url, {
            signal: AbortSignal.timeout(Math.min(initialTimeout * 1000 * (1.5 ** (attempt - 1)), 900_000)),
          })
          if (!download.ok) throw new Error(`Image download failed: ${download.status}`)
          const contentType = download.headers.get('content-type') || 'image/png'
          const imageBytes = Buffer.from(await download.arrayBuffer())
          images.push(`data:${contentType};base64,${imageBytes.toString('base64')}`)
          break
        } catch (error) {
          if (attempt === maxRetries) throw error
          await sleep(Math.min(2 ** (attempt - 1), 60) * 1000)
        }
      }
    }
  }

  return { images, imageUrl }
}

const buildInfo = (request: GenerateApiRequest, size: string, mode: string, imageUrl: string, taskId?: string, usage?: Record<string, unknown>) => {
  const lines = [
    `**Comfly gpt-image-2 (official)** ${mode}`,
    `Model: ${request.model}`,
    `Prompt: ${request.prompt}`,
    `Aspect Ratio: ${request.aspectRatio}`,
    `Resolution: ${request.resolution}`,
    `Actual Size: ${size}`,
    `Quality: ${request.quality}`,
    `Input Images: ${request.images.length}`,
    `Output: ${request.outputFormat}`,
  ]

  if (request.background !== 'auto') lines.push(`Background: ${request.background}`)
  if (taskId) lines.push(`Task ID: ${taskId}`)
  if (imageUrl) lines.push(`Image URL: ${imageUrl}`)
  if (usage?.total_tokens) lines.push(`Total Tokens: ${usage.total_tokens}`)

  return `${lines.join('\n')}\n`
}

const getUsage = (raw: unknown): Record<string, unknown> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const root = raw as Record<string, unknown>
  const data = root.data
  if (!data || typeof data !== 'object') return undefined
  const inner = (data as Record<string, unknown>).data
  if (!inner || typeof inner !== 'object') return undefined
  const usage = (inner as Record<string, unknown>).usage
  return usage && typeof usage === 'object' ? usage as Record<string, unknown> : undefined
}

const submitTask = async (apiBase: string, apiKey: string, request: GenerateApiRequest, size: string) => {
  const form = new FormData()
  form.append('prompt', request.prompt)
  form.append('model', request.model)
  form.append('n', String(request.n))
  form.append('quality', request.quality)
  form.append('moderation', request.moderation)
  form.append('size', size)

  if (request.background !== 'auto') form.append('background', request.background)
  if (request.outputCompression !== 100) form.append('output_compression', String(request.outputCompression))
  if (request.outputFormat !== 'png') form.append('output_format', request.outputFormat)
  if (request.responseFormat !== 'url') form.append('response_format', request.responseFormat)

  await appendImageFiles(form, request.images)

  const url = new URL('/v1/images/edits', apiBase)
  if (request.asyncMode) {
    url.searchParams.set('async', 'true')
    if (request.webhook.trim()) url.searchParams.set('webhook', request.webhook.trim())
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(request.initialTimeout * 1000),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(formatApiError(response.status, message))
  }

  return response.json() as Promise<Record<string, unknown>>
}

const pollTask = async (apiBase: string, apiKey: string, request: GenerateApiRequest, taskId: string): Promise<PollResult> => {
  const url = new URL(`/v1/images/tasks/${taskId}`, apiBase)

  for (let attempt = 1; attempt <= request.maxPollAttempts; attempt++) {
    await sleep(request.pollInterval * 1000)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(request.initialTimeout * 1000),
    })
    if (!response.ok) continue

    const statusData = await response.json() as Record<string, unknown>
    const inner = typeof statusData.data === 'object' && statusData.data ? statusData.data as Record<string, unknown> : {}
    const status = String(inner.status || '')

    if (status === 'SUCCESS') {
      const resultData = typeof inner.data === 'object' && inner.data ? inner.data as Record<string, unknown> : {}
      const data = Array.isArray(resultData.data) ? resultData.data as ImageEntry[] : []
      const { images, imageUrl } = await extractImages(data, request.maxRetries, request.initialTimeout)
      if (images.length === 0) throw new Error('Async task SUCCESS but no decodable image in data')
      return { images, imageUrl, taskId, raw: statusData, usage: getUsage(statusData) }
    }

    if (status === 'FAILURE') {
      throw new Error(`Task failed: ${String(inner.fail_reason || 'Unknown error')}`)
    }
  }

  throw new Error(`Failed to get image after ${request.maxPollAttempts} poll attempts`)
}

const generate = async (request: GenerateApiRequest, runtime: ServerRuntime): Promise<GenerateApiResponse> => {
  const { apiKey, apiBase } = getRuntimeConfig(runtime)
  if (!apiKey) return { ok: false, error: '请先在设置里配置 API Key。' }

  const size = getActualSize(request.aspectRatio, request.resolution)
  const sizeError = validateGptImage2Size(size)
  if (sizeError) return { ok: false, error: sizeError }

  try {
    if (request.asyncMode) {
      const submitResult = await submitTask(apiBase, apiKey, request, size)
      const taskId = String(submitResult.task_id || submitResult.data || '')
      if (!taskId) throw new Error(`No task_id in response: ${JSON.stringify(submitResult)}`)

      const result = await pollTask(apiBase, apiKey, request, taskId)
      const savedAssets = saveGeneratedAssets(request, result.images, runtime)
      return {
        ok: true,
        images: savedAssets.images,
        assets: savedAssets.assets,
        imageUrl: result.imageUrl,
        response: buildInfo(request, size, 'async: POST /v1/images/edits?async=true, GET /v1/images/tasks/{task_id}', result.imageUrl, taskId, result.usage),
        taskId,
        usage: result.usage,
      }
    }

    const result = await submitTask(apiBase, apiKey, request, size)
    const data = Array.isArray(result.data) ? result.data as ImageEntry[] : []
    const { images, imageUrl } = await extractImages(data, request.maxRetries, request.initialTimeout)
    if (images.length === 0) throw new Error(`No image data in response: ${JSON.stringify(result)}`)
    const savedAssets = saveGeneratedAssets(request, images, runtime)

    return {
      ok: true,
      images: savedAssets.images,
      assets: savedAssets.assets,
      imageUrl,
      response: buildInfo(request, size, 'sync: /v1/images/edits (multipart)', imageUrl, undefined, result.usage as Record<string, unknown> | undefined),
      usage: result.usage as Record<string, unknown> | undefined,
    }
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : String(error))
    if (request.skipError) {
      return {
        ok: true,
        images: [FALLBACK_PNG_DATA_URL],
        imageUrl: '',
        response: message,
      }
    }
    return { ok: false, error: message }
  }
}

export const createApiHandler = (runtime: ServerRuntime) => async (request: IncomingMessage, response: ServerResponse) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname

  if (pathname === '/api/config') {
    try {
      if (request.method === 'GET') {
        sendJson(response, 200, getProxyConfig(runtime))
        return
      }

      if (request.method === 'POST') {
        sendJson(response, 200, await saveProxyConfig(request, runtime))
        return
      }

      response.writeHead(405, JSON_HEADERS)
      response.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (pathname === '/api/assets/config') {
    await handleAssetConfigRoute(request, response, runtime)
    return
  }

  if (pathname === '/api/assets/file') {
    serveAssetFile(request, response, runtime)
    return
  }

  if (pathname === '/api/assets') {
    handleAssetsRoute(request, response, runtime)
    return
  }

  if (pathname === '/api/generate') {
    if (request.method !== 'POST') {
      response.writeHead(405, JSON_HEADERS)
      response.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
      return
    }

    try {
      const body = await readJsonBody<GenerateApiRequest>(request)
      const payload = await generate(body, runtime)
      sendJson(response, payload.ok ? 200 : 500, payload)
    } catch (error) {
      const requestId = randomUUID()
      console.error(`[${requestId}] /api/generate failed`, error)
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  response.writeHead(404, JSON_HEADERS)
  response.end(JSON.stringify({ ok: false, error: 'API route not found' }))
}

export const createDevRuntime = (env: EnvValues) =>
  createServerRuntime({
    env,
    configFile: join(process.cwd(), '.env.local'),
    defaultOutputDir: join(process.cwd(), 'output'),
  })

export const zhenzhenProxyPlugin = (env: EnvValues): Plugin => ({
  name: 'zhenzhen-gpt-image-2-proxy',
  configureServer(server) {
    const apiHandler = createApiHandler(createDevRuntime(env))
    server.middlewares.use('/api', apiHandler)
  },
})
