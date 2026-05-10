import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppLayout from './components/AppLayout'
import ControlPanel from './components/ControlPanel'
import BilibiliIcon from './components/BilibiliIcon'
import Feed from './components/Feed'
import LibraryView from './components/LibraryView'
import PromptReferenceView from './components/PromptReferenceView'
import SettingsView from './components/SettingsView'
import Sidebar, { type WorkspaceView } from './components/Sidebar'
import TasksView from './components/TasksView'
import type { GenerateApiResponse, ProxyConfigResponse } from './apiTypes'
import type { ReferenceImagePayload } from './imagePayload'
import type { AssetItem, AssetListResponse } from './assetTypes'
import type { GenerateOptions, GenerationEditDraft, GenerationRequest, GenerationSettings, Task } from './types'
import { readJsonResponse } from './apiClient'
import { createClientId } from './clientIds'
import { motion, AnimatePresence } from 'framer-motion'
import { Coffee } from 'lucide-react'

const DEFAULT_PANEL_WIDTH = 420
const MIN_PANEL_WIDTH = 340
const MAX_PANEL_WIDTH = 720
const MIN_FEED_WIDTH = 360
const SESSION_TASKS_KEY = 'image2-session-tasks'
const MAX_SESSION_TASKS = 30
const RECENT_ASSET_TASK_LIMIT = 10
const SESSION_PERSIST_DELAY = 900
const BILIBILI_HOME_URL = 'https://space.bilibili.com/5758057'
const API_KEY_REGISTER_URL = 'https://ai.t8star.org/register?aff=9263aa44936'

function WechatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M767.818667 409.173333C867.338667 444.266667 938.666667 539.136 938.666667 650.666667c0 42.709333-10.496 83.978667-30.261334 120.842666-1.792 3.338667-4.992 8.928-9.696 16.96l14.613334 53.557334c6.506667 23.893333-15.402667 45.813333-39.296 39.296l-53.642667-14.634667-6.229333 3.669333A254.933333 254.933333 0 0 1 682.666667 906.666667c-77.994667 0-147.84-34.88-194.805334-89.888a352.608 352.608 0 0 1-56.64 4.554666c-63.338667 0-124.266667-16.853333-177.472-48.298666-1.834667-1.088-6.410667-3.733333-13.632-7.893334l-80.544 21.653334c-23.914667 6.432-45.76-15.573333-39.146666-39.434667l21.792-78.752a961.205333 961.205333 0 0 1-15.904-27.317333A336.384 336.384 0 0 1 85.333333 480c0-188.618667 154.965333-341.333333 345.888-341.333333 159.914667 0 297.984 108.010667 335.818667 259.296 0.949333 3.765333 1.173333 7.552 0.778667 11.2z m-68.106667-13.952C662.88 282.037333 555.178667 202.666667 431.221333 202.666667 275.434667 202.666667 149.333333 326.933333 149.333333 480c0 46.272 11.498667 90.837333 33.194667 130.698667 2.88 5.290667 10.176 17.706667 21.621333 36.746666a32 32 0 0 1 3.413334 25.013334l-10.517334 37.994666 39.232-10.549333a32 32 0 0 1 24.234667 3.146667c14.272 8.192 22.773333 13.098667 25.802667 14.890666A283.882667 283.882667 0 0 0 431.221333 757.333333c6.154667 0 12.288-0.192 18.389334-0.576A255.061333 255.061333 0 0 1 426.666667 650.666667c0-141.386667 114.613333-256 256-256 5.728 0 11.413333 0.192 17.045333 0.554666z m133.706667 397.056a32 32 0 0 1 3.338666-24.725333 996.672 996.672 0 0 0 15.242667-26.293333A190.997333 190.997333 0 0 0 874.666667 650.666667c0-106.037333-85.962667-192-192-192s-192 85.962667-192 192 85.962667 192 192 192a190.933333 190.933333 0 0 0 98.570666-27.2c2.208-1.322667 8.288-4.874667 18.517334-10.837334a32 32 0 0 1 24.522666-3.210666l12.565334 3.424-3.424-12.565334zM330.666667 426.666667a42.666667 42.666667 0 1 1 0-85.333334 42.666667 42.666667 0 0 1 0 85.333334z m192 0a42.666667 42.666667 0 1 1 0-85.333334 42.666667 42.666667 0 0 1 0 85.333334z m85.333333 202.666666a32 32 0 1 1 0-64 32 32 0 0 1 0 64z m149.333333 0a32 32 0 1 1 0-64 32 32 0 0 1 0 64z"
        fill="currentColor"
      />
    </svg>
  )
}

const clampPanelWidth = (width: number) => {
  const viewportWidth = window.innerWidth
  const maxByViewport = Math.max(MIN_PANEL_WIDTH, viewportWidth - MIN_FEED_WIDTH)
  return Math.min(Math.min(MAX_PANEL_WIDTH, maxByViewport), Math.max(MIN_PANEL_WIDTH, width))
}

const stripTaskImages = (task: Task): Task => ({
  ...task,
  params: {
    ...task.params,
    images: task.params.images.map(image => ({
      ...image,
      dataUrl: image.dataUrl.startsWith('data:') ? '' : image.dataUrl,
    })),
  },
  referencesOmitted: task.params.images.length > 0 || task.referencesOmitted,
})

const stripHeavyResultImages = (task: Task): Task => ({
  ...task,
  resultImages: task.resultImages?.filter(image => !image.startsWith('data:')),
})

const restoreSessionTasks = (): Task[] => {
  try {
    const raw = window.sessionStorage.getItem(SESSION_TASKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Task[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(task => task && typeof task === 'object' && typeof task.id === 'string')
      .slice(0, MAX_SESSION_TASKS)
      .map(task => {
        const sanitized = stripTaskImages(task)
        if (sanitized.status !== 'loading') return sanitized

        return {
          ...sanitized,
          status: 'interrupted',
          stage: 'failed',
          progress: 100,
          errorMsg: '页面刷新后，当前浏览器已停止追踪这个生成任务。结果如果已完成，会保存在资产库中。',
          endedAt: sanitized.endedAt ?? Date.now(),
        }
      })
  } catch {
    return []
  }
}

const persistSessionTasks = (tasks: Task[]) => {
  try {
    const serializableTasks = tasks
      .slice(0, MAX_SESSION_TASKS)
      .map(stripTaskImages)
      .map(stripHeavyResultImages)
    window.sessionStorage.setItem(SESSION_TASKS_KEY, JSON.stringify(serializableTasks))
  } catch {
    // Session persistence is best-effort only.
  }
}

const fetchBlobAsDataUrl = async (url: string, errorMessage: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${errorMessage}（HTTP ${response.status}）`)

  const blob = await response.blob()
  return {
    blob,
    dataUrl: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = event => {
        const value = event.target?.result
        if (typeof value === 'string') resolve(value)
        else reject(new Error(errorMessage))
      }
      reader.onerror = () => reject(new Error(errorMessage))
      reader.readAsDataURL(blob)
    }),
  }
}

const taskFromAsset = (asset: AssetItem): Task => ({
  id: `asset-${asset.id}`,
  status: 'success',
  timestamp: asset.createdAt,
  params: {
    ...asset.params,
    images: asset.referenceImages || asset.params.images || [],
  },
  progress: 100,
  stage: 'completed',
  startedAt: asset.createdAt,
  endedAt: asset.createdAt,
  resultImages: [asset.imageUrl],
  referencesOmitted: asset.hasReferenceImages,
})

const mergeTasks = (current: Task[], next: Task[]) => {
  const merged = new Map<string, Task>()
  for (const task of current) merged.set(task.id, task)

  const mergeReferenceImages = (existing: Task, candidate: Task) => {
    const existingReferenceCount = existing.params.images.filter(image => image.dataUrl).length
    const candidateReferences = candidate.params.images.filter(image => image.dataUrl)
    if (candidateReferences.length <= existingReferenceCount) return

    merged.set(existing.id, {
      ...existing,
      params: {
        ...existing.params,
        images: candidateReferences,
      },
      referencesOmitted: candidate.referencesOmitted ?? existing.referencesOmitted,
    })
  }

  const findSameResult = (candidate: Task) => {
    const candidateImages = new Set(candidate.resultImages || [])
    if (candidateImages.size === 0) return undefined

    return Array.from(merged.values()).find(task =>
      (task.resultImages || []).some(imageUrl => candidateImages.has(imageUrl))
    )
  }

  for (const task of next) {
    const existingById = merged.get(task.id)
    if (existingById) {
      mergeReferenceImages(existingById, task)
      continue
    }

    const existingByResult = findSameResult(task)
    if (existingByResult) {
      mergeReferenceImages(existingByResult, task)
      continue
    }

    merged.set(task.id, task)
  }
  return Array.from(merged.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SESSION_TASKS)
}

const imageUrlToReferencePayload = async (image: ReferenceImagePayload, index: number): Promise<ReferenceImagePayload> => {
  if (image.dataUrl.startsWith('data:')) return image
  if (!image.dataUrl) throw new Error('参考图未保存到会话中')

  const response = await fetch(image.dataUrl)
  if (!response.ok) throw new Error('无法读取参考图')
  const blob = await response.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => {
      const value = event.target?.result
      if (typeof value === 'string') resolve(value)
      else reject(new Error('无法读取参考图'))
    }
    reader.onerror = () => reject(new Error('无法读取参考图'))
    reader.readAsDataURL(blob)
  })

  return {
    ...image,
    id: image.id || `restored-reference-${Date.now()}-${index}`,
    name: image.name || `图${index + 1}`,
    type: image.type || blob.type || 'image/png',
    dataUrl,
  }
}

const normalizeReferenceImages = async (images: ReferenceImagePayload[] = []) => {
  const normalized = await Promise.all(
    images
      .filter(image => image.dataUrl)
      .map(async (image, index) => {
        try {
          return await imageUrlToReferencePayload(image, index)
        } catch {
          return image.dataUrl.startsWith('data:') ? image : null
        }
      })
  )

  return normalized.filter((image): image is ReferenceImagePayload => Boolean(image))
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => restoreSessionTasks())
  const [activeView, setActiveView] = useState<WorkspaceView>('create')
  const [apiConfig, setApiConfig] = useState({
    configured: false,
    apiKeyPreview: '',
    apiBase: 'https://ai.t8star.cn',
  })
  const [settingsNotice, setSettingsNotice] = useState('')
  const [assetCount, setAssetCount] = useState(0)
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const [referenceImages, setReferenceImages] = useState<ReferenceImagePayload[]>([])
  const [editDraft, setEditDraft] = useState<GenerationEditDraft | null>(null)
  const [operationNotice, setOperationNotice] = useState('')
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    model: 'gpt-image-2',
    n: 1,
    quality: 'auto',
    outputFormat: 'png',
    outputCompression: 100,
    responseFormat: 'url',
    skipError: false,
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem('image2-sidebar-collapsed') === 'true'
  })
  const [panelWidth, setPanelWidth] = useState(() => {
    const savedWidth = Number(window.localStorage.getItem('image2-panel-width'))
    return Number.isFinite(savedWidth) && savedWidth > 0 ? clampPanelWidth(savedWidth) : DEFAULT_PANEL_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const [showWechatTip, setShowWechatTip] = useState(false)
  const [showSponsorTip, setShowSponsorTip] = useState(false)
  const [highlightApiKeyInput, setHighlightApiKeyInput] = useState(false)
  const progressTimersRef = useRef(new Set<number>())
  const isPromptReferenceView = activeView === 'promptReference'

  const trackProgressTimer = useCallback((timerId: number) => {
    progressTimersRef.current.add(timerId)
  }, [])

  const clearProgressTimer = useCallback((timerId: number) => {
    window.clearInterval(timerId)
    progressTimersRef.current.delete(timerId)
  }, [])

  useEffect(() => {
    const handleWindowResize = () => {
      setPanelWidth(currentWidth => clampPanelWidth(currentWidth))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('image2-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const persistTimer = window.setTimeout(() => persistSessionTasks(tasks), SESSION_PERSIST_DELAY)
    return () => window.clearTimeout(persistTimer)
  }, [tasks])

  useEffect(() => {
    const progressTimers = progressTimersRef.current
    return () => {
      progressTimers.forEach(timerId => window.clearInterval(timerId))
      progressTimers.clear()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    fetch('/api/config')
      .then(response => readJsonResponse<ProxyConfigResponse>(response, '无法读取接口配置'))
      .then(payload => {
        if (!isMounted) return
        setApiConfig({
          configured: payload.configured,
          apiKeyPreview: payload.apiKeyPreview,
          apiBase: payload.apiBase,
        })
      })
      .catch(() => {
        if (!isMounted) return
        setSettingsNotice('无法读取接口配置')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const restoreRecentAssets = async () => {
      try {
        const firstResponse = await fetch('/api/assets?pageSize=12')
        const firstPayload = await readJsonResponse<AssetListResponse>(firstResponse, '无法恢复最近资产')
        if (!isMounted) return
        setAssetCount(firstPayload.days.reduce((sum, day) => sum + day.count, 0))

        const restoreItems = [...firstPayload.items]
        const nextDay = firstPayload.days[1]?.day

        if (nextDay) {
          const secondResponse = await fetch(`/api/assets?pageSize=12&day=${encodeURIComponent(nextDay)}`)
          const secondPayload = await readJsonResponse<AssetListResponse>(secondResponse, '无法恢复最近资产')
          if (isMounted) restoreItems.push(...secondPayload.items)
        }

        const restoredTasks = restoreItems
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, RECENT_ASSET_TASK_LIMIT)
          .map(taskFromAsset)

        if (restoredTasks.length > 0) {
          setTasks(current => mergeTasks(current, restoredTasks))
        }
      } catch {
        if (isMounted) setAssetCount(0)
        // Asset restore is a convenience layer; the asset library remains the source of truth.
      }
    }

    void restoreRecentAssets()

    return () => {
      isMounted = false
    }
  }, [libraryRefreshKey])

  const handleGenerate = useCallback(async (partialRequest: Partial<GenerationRequest>, options?: GenerateOptions) => {
    setActiveView('create')
    const request: GenerationRequest = {
      prompt: '',
      aspectRatio: '16:9',
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
      ...partialRequest
    };
    request.images = await normalizeReferenceImages(request.images)
    // 创建一个新任务（初始为加载/骨架屏态）
    const now = Date.now()
    const newTask: Task = {
      id: createClientId('task'),
      status: 'loading',
      timestamp: options?.timestamp ?? now,
      batchId: options?.batchId,
      batchIndex: options?.batchIndex,
      batchSize: options?.batchSize,
      params: request,
      progress: 0,
      stage: 'preparing',
      startedAt: now,
    }
    setTasks(prev => [newTask, ...prev])

    const progressTimer = window.setInterval(() => {
      setTasks(prev => prev.map(task =>
        task.id === newTask.id
          ? {
              ...task,
              progress: Math.min(task.progress + 3, 92),
              stage: task.progress < 12 ? 'submitting' : task.progress < 82 ? 'generating' : 'fetching',
            }
          : task
      ))
    }, 1200)
    trackProgressTimer(progressTimer)

    try {
      setTasks(prev => prev.map(task =>
        task.id === newTask.id ? { ...task, stage: 'submitting', progress: 8 } : task
      ))
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await readJsonResponse<GenerateApiResponse>(response, '生成请求失败')

      const resultImages = payload.images.length > 0
        ? payload.images
        : payload.assets?.map(asset => asset.imageUrl) ?? []

      if (resultImages.length === 0) {
        throw new Error('生成完成，但没有收到可展示的图片结果')
      }

      const savedReferenceImages = payload.assets?.[0]?.referenceImages || payload.assets?.[0]?.params.images || []
      setTasks(prev => prev.map(task =>
        task.id === newTask.id
          ? {
              ...task,
              status: 'success',
              stage: 'completed',
              progress: 100,
              params: {
                ...task.params,
                images: savedReferenceImages.length > 0 ? savedReferenceImages : task.params.images,
              },
              resultImages,
              endedAt: Date.now(),
            }
          : task
      ))
      setAssetCount(current => current + resultImages.length)
      setLibraryRefreshKey(current => current + 1)
    } catch (error) {
      setTasks(prev => prev.map(task =>
        task.id === newTask.id
          ? {
              ...task,
              status: 'error',
              stage: 'failed',
              progress: 100,
              errorMsg: error instanceof Error ? error.message : '生成失败，请重试',
              endedAt: Date.now(),
            }
          : task
      ))
    } finally {
      clearProgressTimer(progressTimer)
    }
  }, [clearProgressTimer, trackProgressTimer])

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsResizing(true)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampPanelWidth(window.innerWidth - moveEvent.clientX)
      setPanelWidth(nextWidth)
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      const nextWidth = clampPanelWidth(window.innerWidth - upEvent.clientX)
      setPanelWidth(nextWidth)
      window.localStorage.setItem('image2-panel-width', String(nextWidth))
      setIsResizing(false)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleResetPanelWidth = () => {
    const nextWidth = clampPanelWidth(DEFAULT_PANEL_WIDTH)
    setPanelWidth(nextWidth)
    window.localStorage.setItem('image2-panel-width', String(nextWidth))
  }

  const activeTaskCount = useMemo(
    () => tasks.filter(task => task.status === 'loading' || task.status === 'error' || task.status === 'interrupted').length,
    [tasks]
  )

  const handleRequestApiKey = useCallback(() => {
    window.open(API_KEY_REGISTER_URL, '_blank', 'noopener,noreferrer')
    setSettingsNotice('')
    setActiveView('settings')
    setHighlightApiKeyInput(true)
  }, [])

  const openSettingsForApi = () => {
    setSettingsNotice('请先配置 API Key')
    setActiveView('settings')
  }

  const handleUseAssetAsReference = useCallback(async (asset: { id: string; filename: string; imageUrl: string }) => {
    if (referenceImages.length >= 16) return

    setOperationNotice('')
    try {
      const { blob, dataUrl } = await fetchBlobAsDataUrl(asset.imageUrl, '无法读取资产图片')
      setReferenceImages(prev => {
        if (prev.length >= 16 || prev.some(image => image.id === `asset-${asset.id}`)) return prev
        return [
          ...prev,
          {
            id: `asset-${asset.id}`,
            name: asset.filename,
            type: blob.type || 'image/png',
            dataUrl,
          },
        ]
      })
    } catch (error) {
      setOperationNotice(error instanceof Error ? error.message : '无法引用资产图片')
    }
  }, [referenceImages.length])

  const handleEditTask = useCallback(async (task: Task, batchSize?: number) => {
    setOperationNotice('')
    try {
      const restoredImages = await normalizeReferenceImages(task.params.images)

      const request: GenerationRequest = {
        ...task.params,
        images: restoredImages,
      }

      setReferenceImages(restoredImages)
      setGenerationSettings(current => ({
        ...current,
        model: request.model,
        n: request.n,
        quality: request.quality,
        outputFormat: request.outputFormat,
        outputCompression: request.outputCompression,
        responseFormat: request.responseFormat,
        skipError: request.skipError,
      }))
      setEditDraft({
        id: createClientId(`edit-${task.id}`),
        request,
        batchSize,
      })
      setActiveView('create')
    } catch (error) {
      setOperationNotice(error instanceof Error ? error.message : '无法重新编辑这个任务')
    }
  }, [])

  const renderWorkspace = () => {
    if (activeView === 'library') {
      return (
        <LibraryView
          refreshKey={libraryRefreshKey}
          onRegenerate={handleGenerate}
          onEditAsset={asset => handleEditTask(taskFromAsset(asset))}
          onUseAsReference={handleUseAssetAsReference}
        />
      )
    }

    if (activeView === 'tasks') {
      return <TasksView tasks={tasks} onRegenerate={handleGenerate} />
    }

    if (activeView === 'settings') {
      return (
        <SettingsView
          settings={generationSettings}
          onSettingsChange={setGenerationSettings}
          config={apiConfig}
          initialError={settingsNotice}
          highlightApiKey={highlightApiKeyInput && !apiConfig.configured}
          onConfigChange={nextConfig => {
            setApiConfig(nextConfig)
            setSettingsNotice('')
            setHighlightApiKeyInput(false)
          }}
        />
      )
    }

    if (activeView === 'promptReference') {
      return <PromptReferenceView />
    }

    return (
      <Feed
        tasks={tasks}
        onRegenerate={handleGenerate}
        onEditTask={handleEditTask}
        onUseAsReference={handleUseAssetAsReference}
        isApiConfigured={apiConfig.configured}
        onRequestApiKey={handleRequestApiKey}
      />
    )
  }

  return (
    <AppLayout>
      <div
        className="relative h-screen overflow-hidden bg-[var(--color-dark-bg)] text-white font-sans antialiased"
        style={{ '--right-panel-width': `${panelWidth}px` } as React.CSSProperties}
      >
        <header data-layout="header" className="relative z-10 flex h-14 items-center justify-between gap-4 border-b border-[var(--color-dark-border)] bg-[#0a0a0a]/95 px-5 backdrop-blur max-[520px]:px-4">
        <div className="relative flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/logo.ico" alt="" className="h-9 w-10 shrink-0 rounded-xl object-cover" aria-hidden="true" />
            <h1 className="text-sm font-semibold tracking-[0.18em] text-white">OLDX IMAGE2</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={BILIBILI_HOME_URL}
              target="_blank"
              rel="noreferrer"
              title="B站主页"
              aria-label="B站主页"
              className="group/header-link flex h-8 w-8 items-center justify-end gap-0 overflow-hidden rounded-full border border-white/6 bg-white/[0.025] px-2 text-neutral-500 transition-all duration-300 hover:w-[88px] hover:gap-1.5 hover:border-white/14 hover:bg-white hover:px-3 hover:text-black focus-visible:w-[88px] focus-visible:gap-1.5 focus-visible:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span className="max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-all duration-300 group-hover/header-link:max-w-[56px] group-hover/header-link:translate-x-0 group-hover/header-link:opacity-100 group-focus-visible/header-link:max-w-[56px] group-focus-visible/header-link:translate-x-0 group-focus-visible/header-link:opacity-100">
                B站主页
              </span>
              <BilibiliIcon className="h-[17px] w-[17px] shrink-0" />
            </a>
            <button
              type="button"
              title="添加微信"
              aria-label="添加微信"
              onClick={(event) => {
                event.stopPropagation()
                setShowWechatTip(true)
              }}
              className="group/header-link flex h-8 w-8 items-center justify-end gap-0 overflow-hidden rounded-full border border-white/6 bg-white/[0.025] px-2 text-neutral-500 transition-all duration-300 hover:w-[92px] hover:gap-1.5 hover:border-white/14 hover:bg-white hover:px-3 hover:text-black focus-visible:w-[92px] focus-visible:gap-1.5 focus-visible:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span className="max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-all duration-300 group-hover/header-link:max-w-[60px] group-hover/header-link:translate-x-0 group-hover/header-link:opacity-100 group-focus-visible/header-link:max-w-[60px] group-focus-visible/header-link:translate-x-0 group-focus-visible/header-link:opacity-100">
                添加微信
              </span>
              <WechatIcon className="h-[17px] w-[17px] shrink-0" />
            </button>
          </div>

        </div>
        <button
          type="button"
          aria-expanded={showSponsorTip}
          aria-label="好用！打赏作者"
          onClick={() => {
            setShowSponsorTip(value => !value)
            setShowWechatTip(false)
          }}
          className="group/sponsor flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 text-sm font-semibold text-neutral-200 shadow-[0_10px_30px_rgba(0,0,0,0.24)] transition hover:border-white/16 hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 max-[520px]:px-2.5"
        >
          <Coffee size={16} strokeWidth={1.9} className="shrink-0 text-neutral-400 transition group-hover/sponsor:text-black" />
          <span className="whitespace-nowrap max-[520px]:hidden">好用！打赏作者</span>
        </button>
      </header>

      <AnimatePresence>
        {showWechatTip && (
          <>
            <button
              type="button"
              aria-label="关闭微信二维码"
              className="fixed inset-0 z-[9998] cursor-default bg-transparent"
              onClick={() => setShowWechatTip(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed left-[132px] top-16 z-[9999] w-[300px] rounded-2xl border border-white/10 bg-[#141414]/96 p-3 shadow-2xl shadow-black/45 backdrop-blur-xl max-[520px]:left-4 max-[520px]:right-4 max-[520px]:w-auto"
              onClick={event => event.stopPropagation()}
            >
              <img
                src="/wechat-qr.jpg"
                alt="微信二维码"
                className="aspect-[3/4] w-full rounded-xl bg-white object-contain"
                onError={event => {
                  event.currentTarget.src = '/wechat-qr-placeholder.svg'
                }}
              />
              <div className="mt-2 text-center text-xs text-neutral-500">扫码添加微信</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSponsorTip && (
          <>
            <button
              type="button"
              aria-label="关闭打赏二维码"
              className="fixed inset-0 z-[9998] cursor-default bg-transparent"
              onClick={() => setShowSponsorTip(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed right-5 top-16 z-[9999] w-[min(560px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#141414]/96 p-3 shadow-2xl shadow-black/45 backdrop-blur-xl max-[520px]:right-4"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-1 pb-3">
                <div>
                  <div className="text-sm font-semibold text-white">好用！打赏作者</div>
                  <div className="mt-1 text-xs text-neutral-500">扫码支持一下，继续把工具打磨好。</div>
                </div>
                <Coffee size={18} className="shrink-0 text-neutral-500" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-2">
                  <img
                    src="/sponsor-wechat.png"
                    alt="微信打赏二维码"
                    className="aspect-[0.74] w-full rounded-lg bg-white object-contain"
                  />
                  <div className="mt-2 text-center text-xs font-medium text-emerald-200/90">微信支付</div>
                </div>
                <div className="overflow-hidden rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-2">
                  <img
                    src="/sponsor-alipay.png"
                    alt="支付宝打赏二维码"
                    className="aspect-[0.74] w-full rounded-lg bg-white object-contain"
                  />
                  <div className="mt-2 text-center text-xs font-medium text-sky-200/90">支付宝</div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex h-[calc(100vh-56px)] overflow-hidden max-[760px]:flex-col">
        <Sidebar
          data-layout="sidebar"
          activeView={activeView}
          onViewChange={setActiveView}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          counts={{
            library: assetCount,
            activeTasks: activeTaskCount,
          }}
          apiKeyPreview={apiConfig.apiKeyPreview}
          isApiConfigured={apiConfig.configured}
          onRequestApiKey={handleRequestApiKey}
        />

        {operationNotice && (
          <div className="fixed left-1/2 top-16 z-50 max-w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-red-400/20 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-2xl shadow-black/40 backdrop-blur">
            {operationNotice}
          </div>
        )}

        {/* 主工作区 */}
        <motion.div
          data-layout="workspace"
          layout
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="flex-1 min-w-0 h-full overflow-y-auto relative border-r border-[var(--color-dark-border)] max-[760px]:h-[45vh] max-[760px]:border-r-0 max-[760px]:border-b"
        >
          {renderWorkspace()}
        </motion.div>

        <AnimatePresence initial={false}>
          {!isPromptReferenceView && (
            <motion.div
              key="panel-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整左右面板宽度"
              title="拖动调整面板宽度，双击恢复默认"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 8 }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onPointerDown={handleResizeStart}
              onDoubleClick={handleResetPanelWidth}
              className="group relative z-20 shrink-0 cursor-col-resize touch-none bg-transparent max-[760px]:hidden"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-dark-border)] transition group-hover:bg-white/50" />
              <div className="absolute top-1/2 left-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 opacity-0 transition group-hover:opacity-100" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 右侧控制台 */}
        <motion.div
          data-layout="panel"
          initial={false}
          animate={{
            width: isPromptReferenceView ? 0 : panelWidth,
            opacity: isPromptReferenceView ? 0 : 1,
            x: isPromptReferenceView ? 24 : 0,
          }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          aria-hidden={isPromptReferenceView}
          className="h-full overflow-y-auto shrink-0 bg-[var(--color-dark-bg)] shadow-2xl z-10 relative max-[760px]:w-full max-[760px]:h-[55vh]"
          style={{
            width: panelWidth,
            pointerEvents: isPromptReferenceView ? 'none' : 'auto',
            overflow: isPromptReferenceView ? 'hidden' : undefined,
          }}
        >
          <ControlPanel
            key={editDraft?.id || 'blank-control-panel'}
            onGenerate={handleGenerate}
            settings={generationSettings}
            isApiConfigured={apiConfig.configured}
            onOpenSettings={openSettingsForApi}
            referenceImages={referenceImages}
            onReferenceImagesChange={setReferenceImages}
            editDraft={editDraft}
          />
        </motion.div>

        {isResizing && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}
      </div>
    </div>
    </AppLayout>
  )
}
