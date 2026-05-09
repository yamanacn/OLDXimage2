import type { AspectRatio, Resolution } from './types'

export const ASPECT_RATIOS: AspectRatio[] = [
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]

export const RESOLUTIONS: Resolution[] = ['1k', '2k', '4k']

export const SIZE_MAP: Partial<Record<AspectRatio, Record<Resolution, string>>> = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '2880x2880' },
  '16:9': { '1k': '1280x720', '2k': '2560x1440', '4k': '3840x2160' },
  '9:16': { '1k': '720x1280', '2k': '1440x2560', '4k': '2160x3840' },
  '4:3': { '1k': '1152x864', '2k': '2304x1728', '4k': '3264x2448' },
  '3:4': { '1k': '864x1152', '2k': '1728x2304', '4k': '2448x3264' },
  '3:2': { '1k': '1248x832', '2k': '2496x1664', '4k': '3504x2336' },
  '2:3': { '1k': '832x1248', '2k': '1664x2496', '4k': '2336x3504' },
  '5:4': { '1k': '1120x896', '2k': '2240x1792', '4k': '3200x2560' },
  '4:5': { '1k': '896x1120', '2k': '1792x2240', '4k': '2560x3200' },
  '21:9': { '1k': '1456x624', '2k': '3024x1296', '4k': '3696x1584' },
  '9:21': { '1k': '624x1456', '2k': '1296x3024', '4k': '1584x3696' },
  '2:1': { '1k': '2048x1024', '2k': '2688x1344', '4k': '3840x1920' },
  '1:2': { '1k': '1024x2048', '2k': '1344x2688', '4k': '1920x3840' },
}

export const getActualSize = (aspectRatio: AspectRatio, resolution: Resolution) => {
  if (aspectRatio === 'auto') return 'auto'
  return SIZE_MAP[aspectRatio]?.[resolution] ?? 'auto'
}

export const validateGptImage2Size = (size: string) => {
  if (size === 'auto') return null

  const match = /^(\d+)x(\d+)$/.exec(size.trim())
  if (!match) return 'size 格式须为 宽x高，例如 1024x1024'

  const width = Number(match[1])
  const height = Number(match[2])
  if (Math.max(width, height) > 3840) return '长边须 <= 3840px'

  const shortEdge = Math.min(width, height)
  const longEdge = Math.max(width, height)
  if (longEdge / shortEdge > 3.0) return '长边:短边 不得超过 3:1'

  const pixels = width * height
  if (pixels < 655_360 || pixels > 8_294_400) return '总像素须在 655,360～8,294,400 之间'

  return null
}
