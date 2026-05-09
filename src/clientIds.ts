export const createClientId = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  const randomPart = Math.random().toString(36).slice(2)
  return `${prefix}-${Date.now()}-${randomPart}`
}
