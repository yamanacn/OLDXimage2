type ApiFailure = {
  ok: false
  error?: string
}

type ApiSuccess<T> = T extends { ok: true } ? T : never

const extractResponseMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  const error = record.error
  const message = record.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (typeof message === 'string' && message.trim()) return message.trim()
  return ''
}

export const readJsonResponse = async <T extends { ok: boolean }>(
  response: Response,
  fallbackMessage: string
): Promise<ApiSuccess<T>> => {
  const text = await response.text()
  let payload: unknown = null

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      if (!response.ok) {
        throw new Error(`${fallbackMessage}（HTTP ${response.status}）`)
      }
      throw new Error(`${fallbackMessage}：响应格式异常`)
    }
  }

  if (!response.ok) {
    const message = extractResponseMessage(payload)
    throw new Error(message || `${fallbackMessage}（HTTP ${response.status}）`)
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(`${fallbackMessage}：响应为空`)
  }

  const typedPayload = payload as T | ApiFailure
  if (!typedPayload.ok) {
    throw new Error(('error' in typedPayload && typedPayload.error) || fallbackMessage)
  }

  return typedPayload as ApiSuccess<T>
}
