import type { GenerateOptions, GenerationRequest, Task, TaskStage } from '../types'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle,
  CircleDashed,
  Clock,
  Download,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import type { ReferenceImagePayload } from '../imagePayload'
import { createClientId } from '../clientIds'
import AddToReferenceButton from './AddToReferenceButton'

const STAGE_LABELS: Record<TaskStage, string> = {
  preparing: '准备任务中',
  submitting: '提交任务中',
  generating: '正在绘制中',
  fetching: '拉取结果中',
  completed: '绘制完成',
  failed: '生成失败',
}

const clampErrorMessage = (message?: string) => {
  const fallback = '生成失败，请重试'
  if (!message?.trim()) return fallback

  const trimmed = message.trim()
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed
}

const getResolutionEstimate = (resolution: Task['params']['resolution']) => {
  if (resolution === '4k') return '4K 超清通常需要 4-5 分钟，适合最终细节输出。'
  if (resolution === '2k') return '2K 高清通常需要 3-4 分钟，会保留更多画面细节。'
  return '1K 标准约 1-2 分钟完成。'
}

type PreviewImage = {
  url: string
  type: 'result' | 'reference'
  task?: Task
  imageIndex?: number
}

type ReferenceAsset = {
  id: string
  filename: string
  imageUrl: string
}

type ResultTile =
  | { id: string; type: 'loading'; task: Task; label: string }
  | { id: string; type: 'result'; task: Task; imageUrl: string; imageIndex: number; label: string }
  | { id: string; type: 'empty'; task: Task; label: string }
  | { id: string; type: 'interrupted'; task: Task; label: string }
  | { id: string; type: 'error'; task: Task; label: string }

function GeneratedImageTile({
  imageUrl,
  label,
  task,
  imageIndex,
  onPreview,
  onDownload,
  onUseAsReference,
}: {
  imageUrl: string
  label: string
  task: Task
  imageIndex: number
  onPreview: (preview: PreviewImage) => void
  onDownload: () => void
  onUseAsReference?: () => void
}) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <motion.div
      onClick={() => onPreview({ url: imageUrl, type: 'result', task, imageIndex })}
      className="group relative flex h-[clamp(260px,44vh,480px)] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-dark-border)] bg-[#101010]"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      {loadState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#151515] text-xs text-neutral-500">
          正在载入结果...
        </div>
      )}

      {loadState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#151515] px-4 text-center text-xs text-red-300">
          <AlertCircle size={20} />
          图片载入失败，请到资产库查看
        </div>
      )}

      <img
        src={imageUrl}
        alt="Generated"
        className={clsx(
          'max-h-full max-w-full object-contain transition-opacity duration-300',
          loadState === 'loaded' ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => setLoadState('loaded')}
        onError={() => setLoadState('error')}
      />

      {loadState === 'loaded' && (
        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/[0.03]">
          <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur-md">
            {label}
          </span>
          {onUseAsReference && (
            <AddToReferenceButton
              onClick={(event) => {
                event.stopPropagation()
                onUseAsReference()
              }}
              className="absolute right-3 top-3"
            />
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDownload()
            }}
            className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 opacity-0 backdrop-blur-md transition hover:bg-black/70 hover:text-white group-hover:opacity-100"
            aria-label="下载图片"
          >
            <Download size={16} />
          </button>
        </div>
      )}
    </motion.div>
  )
}

function LoadingTile({ task, label }: { task: Task; label: string }) {
  return (
    <div className="relative h-[clamp(260px,44vh,480px)] w-full overflow-hidden rounded-2xl border border-white/6 bg-[#151515]">
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.032)_42%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.032)_58%,transparent_100%)]"
        animate={{ x: ['-120%', '120%'] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-x-6 top-6 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
        animate={{ opacity: [0.25, 0.78, 0.25], scaleX: [0.72, 1, 0.72] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
            {label}
          </span>
          <span className="shrink-0 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-mono text-neutral-400">
            {task.progress}%
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="relative grid h-[72px] w-[72px] place-items-center">
            <motion.div
              className="absolute inset-0 rounded-full border border-white/10"
              animate={{ scale: [0.82, 1.08, 0.82], opacity: [0.4, 0.08, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border border-transparent border-r-white/20 border-t-white/70"
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-[19px] rounded-full bg-white/[0.08] blur-md"
              animate={{ scale: [0.85, 1.22, 0.85], opacity: [0.14, 0.34, 0.14] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/35 text-neutral-100 shadow-2xl shadow-black/30"
              animate={{
                scale: [1, 1.055, 1],
                rotate: [0, 5, -4, 0],
                boxShadow: [
                  '0 20px 44px rgba(0,0,0,0.30), 0 0 0 rgba(255,255,255,0)',
                  '0 20px 44px rgba(0,0,0,0.30), 0 0 18px rgba(255,255,255,0.12)',
                  '0 20px 44px rgba(0,0,0,0.30), 0 0 0 rgba(255,255,255,0)',
                ],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.span
                className="grid place-items-center"
                animate={{ opacity: [0.72, 1, 0.72], scale: [0.94, 1.08, 0.94] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles size={16} strokeWidth={1.75} />
              </motion.span>
            </motion.div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-neutral-200">{STAGE_LABELS[task.stage]}</span>
            <span className="text-neutral-500">{task.params.resolution.toUpperCase()}</span>
          </div>
          <p className="text-xs leading-5 text-neutral-500">
            {getResolutionEstimate(task.params.resolution)}
          </p>
        </div>
      </div>
    </div>
  )
}

function MessageTile({
  type,
  message,
  label,
}: {
  type: 'empty' | 'interrupted' | 'error'
  message?: string
  label: string
}) {
  const isError = type === 'error'
  const isInterrupted = type === 'interrupted'

  return (
    <div
      className={clsx(
        'flex h-[clamp(260px,44vh,480px)] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border p-8 text-center',
        isError && 'border-red-900/30 bg-red-950/20 text-red-300',
        isInterrupted && 'border-amber-500/20 bg-amber-500/5 text-amber-200',
        type === 'empty' && 'border-amber-500/20 bg-amber-500/5 text-amber-200'
      )}
    >
      {isError ? <AlertCircle size={30} /> : <CircleDashed size={30} />}
      <div className="max-w-[min(560px,100%)]">
        <div className="mb-2 text-xs font-medium text-current/70">{label}</div>
        <p className="overflow-hidden break-words text-sm font-medium leading-relaxed [overflow-wrap:anywhere]">
          {message}
        </p>
      </div>
    </div>
  )
}

function ReferenceStack({
  images,
  onPreview,
}: {
  images: ReferenceImagePayload[]
  onPreview: (preview: PreviewImage) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const visibleImages = images.slice(0, 6)
  const hiddenCount = Math.max(0, images.length - visibleImages.length)

  if (images.length === 0) return null

  return (
    <div
      className="inline-flex w-fit max-w-full items-center gap-3 rounded-xl border border-white/6 bg-black/18 px-2.5 py-2 transition duration-300 hover:border-white/12 hover:bg-white/[0.035] focus-within:border-white/12 focus-within:bg-white/[0.035]"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onFocus={() => setIsExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsExpanded(false)
      }}
    >
      <div className="flex h-10 items-center">
        {visibleImages.map((image, index) => (
          <motion.button
            key={image.id || `${image.dataUrl}-${index}`}
            type="button"
            onClick={() => onPreview({ url: image.thumbUrl || image.dataUrl, type: 'reference' })}
            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-[#1a1a1a] shadow-[0_8px_22px_rgba(0,0,0,0.32)] outline-none transition focus-visible:ring-2 focus-visible:ring-white/60"
            initial={false}
            animate={{
              rotate: isExpanded ? 0 : (index % 2 === 0 ? -3 : 3),
              marginLeft: index === 0 ? 0 : isExpanded ? 6 : -14,
            }}
            whileHover={{
              y: -2,
              scale: 1.04,
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <img
              src={image.thumbUrl || image.dataUrl}
              alt={image.name || `参考图 ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white/90 backdrop-blur-sm">
              图{index + 1}
            </span>
            <span className={clsx(
              'pointer-events-none absolute inset-0 transition',
              isExpanded ? 'bg-white/[0.03]' : 'bg-black/10'
            )} />
          </motion.button>
        ))}
      </div>

      <div className="min-w-0 pr-0.5">
        <div className="text-[11px] font-medium leading-4 text-neutral-400">参考图</div>
        <div className="text-[10px] leading-4 text-neutral-600">
          {isExpanded ? '点击查看' : `${images.length} 张${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`}
        </div>
      </div>
    </div>
  )
}

const getTaskLabel = (task: Task, fallbackIndex: number) => `图${(task.batchIndex ?? fallbackIndex) + 1}`

const createResultTiles = (tasks: Task[]): ResultTile[] => {
  const tiles: ResultTile[] = []

  tasks.forEach((task, taskIndex) => {
    const label = getTaskLabel(task, taskIndex)

    if (task.status === 'loading') {
      tiles.push({ id: `${task.id}-loading`, type: 'loading', task, label })
      return
    }

    if (task.status === 'success') {
      if (task.resultImages?.length) {
        task.resultImages.forEach((imageUrl, imageIndex) => {
          tiles.push({
            id: `${task.id}-${imageIndex}-${imageUrl}`,
            type: 'result',
            task,
            imageUrl,
            imageIndex,
            label: task.resultImages && task.resultImages.length > 1 ? `${label}-${imageIndex + 1}` : label,
          })
        })
        return
      }

      tiles.push({ id: `${task.id}-empty`, type: 'empty', task, label })
      return
    }

    if (task.status === 'interrupted') {
      tiles.push({ id: `${task.id}-interrupted`, type: 'interrupted', task, label })
      return
    }

    tiles.push({ id: `${task.id}-error`, type: 'error', task, label })
  })

  return tiles
}

export default function TaskCard({
  tasks,
  onRegenerate,
  onEditTask,
  onUseAsReference,
}: {
  tasks: Task[]
  onRegenerate: (params: Partial<GenerationRequest>, options?: GenerateOptions) => void | Promise<void>
  onEditTask: (task: Task, batchSize?: number) => void
  onUseAsReference?: (asset: ReferenceAsset) => void
}) {
  const orderedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0) || a.timestamp - b.timestamp),
    [tasks]
  )
  const primaryTask = orderedTasks[0]
  const params = primaryTask.params
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  const tiles = useMemo(() => createResultTiles(orderedTasks), [orderedTasks])
  const batchSize = Math.max(primaryTask.batchSize ?? orderedTasks.length, orderedTasks.length)
  const successCount = orderedTasks.filter(task => task.status === 'success').length
  const loadingCount = orderedTasks.filter(task => task.status === 'loading').length
  const errorCount = orderedTasks.filter(task => task.status === 'error').length
  const interruptedCount = orderedTasks.filter(task => task.status === 'interrupted').length
  const hasFailures = errorCount > 0 || interruptedCount > 0
  const isLoading = loadingCount > 0
  const canRegenerate = loadingCount === 0
  const firstError = orderedTasks.find(task => task.errorMsg)?.errorMsg
  const elapsedSeconds = orderedTasks
    .filter(task => task.endedAt)
    .map(task => Math.max(1, Math.round(((task.endedAt ?? task.startedAt) - task.startedAt) / 1000)))
    .sort((a, b) => b - a)[0]
  const timeStr = new Date(primaryTask.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const gridCols = tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
  const referenceImages = params.images.filter(image => image.dataUrl || image.thumbUrl)
  const resultCount = orderedTasks.reduce((sum, task) => sum + (task.resultImages?.length ?? 0), 0)
  const displayCount = Math.max(batchSize, resultCount)
  const statusTone = isLoading ? 'loading' : hasFailures ? 'warning' : 'success'
  const statusText = isLoading
    ? `生成中 · ${successCount}/${displayCount}`
    : hasFailures
      ? `完成 ${successCount} · 异常 ${errorCount + interruptedCount}`
      : `绘制完成 · ${successCount || resultCount} 张${elapsedSeconds ? ` · ${elapsedSeconds}秒` : ''}`
  const actionLabel = hasFailures ? '重新提交' : '重新生成'

  const handleDownload = async (task: Task, imageUrl: string, index: number) => {
    const link = document.createElement('a')
    let objectUrl = ''

    try {
      if (!imageUrl.startsWith('data:')) {
        const response = await fetch(imageUrl)
        if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`)
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
      }

      link.href = objectUrl || imageUrl
      link.download = `image2-${task.id}-${index + 1}.png`
      document.body.appendChild(link)
      link.click()
    } finally {
      link.remove()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }

  const handleRegenerateBatch = () => {
    const nextTimestamp = Date.now()
    const nextBatchId = createClientId(`batch-${nextTimestamp}`)

    Array.from({ length: batchSize }).forEach((_, index) => {
      void onRegenerate(params, {
        timestamp: nextTimestamp,
        batchId: nextBatchId,
        batchIndex: index,
        batchSize,
      })
    })
  }

  const handleUsePreviewAsReference = () => {
    if (!previewImage || previewImage.type !== 'result' || !previewImage.task || previewImage.imageIndex == null || !onUseAsReference) return

    onUseAsReference({
      id: `result-${previewImage.task.id}-${previewImage.imageIndex}`,
      filename: `image2-${previewImage.task.id}-${previewImage.imageIndex + 1}.png`,
      imageUrl: previewImage.url,
    })
    setPreviewImage(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="ml-1 flex items-center gap-2 text-sm font-medium text-neutral-500">
        <Clock size={14} />
        <span>今天 {timeStr}</span>
        {batchSize > 1 && (
          <span className="rounded-full border border-white/6 bg-white/[0.03] px-2 py-0.5 text-[11px] text-neutral-600">
            批次 {batchSize} 张
          </span>
        )}
      </div>

      <article className="overflow-hidden rounded-2xl border border-[var(--color-dark-border)] bg-[var(--color-dark-card)] shadow-[0_18px_60px_rgba(0,0,0,0.26)]">
        <div className="border-b border-white/6 bg-[#111111] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <MessageSquareText size={14} strokeWidth={1.75} />
                  提示词
                </div>
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                    statusTone === 'success' && 'border-white/8 bg-white/[0.035] text-neutral-500',
                    statusTone === 'loading' && 'border-white/10 bg-white/[0.04] text-neutral-300',
                    statusTone === 'warning' && 'border-amber-300/20 bg-amber-300/10 text-amber-200'
                  )}
                >
                  {statusTone === 'success' && <CheckCircle size={13} />}
                  {statusTone === 'loading' && <CircleDashed size={13} />}
                  {statusTone === 'warning' && <AlertCircle size={13} />}
                  {statusText}
                </span>
              </div>

              <p className="line-clamp-2 text-sm leading-6 text-neutral-200" title={params.prompt}>
                {params.prompt || '未提供提示词'}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-white/6 bg-white/[0.04] px-2 py-1 text-xs font-medium text-neutral-400">
                  比例 {params.aspectRatio}
                </span>
                <span className="rounded-md border border-white/6 bg-white/[0.04] px-2 py-1 text-xs font-medium text-neutral-400">
                  {params.resolution.toUpperCase()}
                </span>
                <span className="rounded-md border border-white/6 bg-white/[0.04] px-2 py-1 text-xs font-medium text-neutral-400">
                  {params.model}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 xl:items-end">
              {referenceImages.length > 0 && (
                <ReferenceStack images={referenceImages} onPreview={setPreviewImage} />
              )}
              {hasFailures && firstError && (
                <div className="max-w-xs truncate text-xs text-amber-200/70" title={firstError}>
                  {clampErrorMessage(firstError)}
                </div>
              )}
              {canRegenerate && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditTask(primaryTask, batchSize)}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/6 bg-transparent px-4 text-sm font-medium text-neutral-500 transition hover:border-white/14 hover:bg-white/[0.055] hover:text-neutral-200 focus-visible:border-white/20 focus-visible:bg-white/[0.07] focus-visible:text-neutral-100 focus-visible:outline-none"
                  >
                    <SquarePen size={15} />
                    重新编辑
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateBatch}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/6 bg-transparent px-4 text-sm font-medium text-neutral-500 transition hover:border-white/14 hover:bg-white/[0.055] hover:text-neutral-200 focus-visible:border-white/20 focus-visible:bg-white/[0.07] focus-visible:text-neutral-100 focus-visible:outline-none"
                  >
                    <RotateCcw size={15} />
                    {actionLabel}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={clsx('grid gap-3 p-3', gridCols)}>
          {tiles.map(tile => {
            if (tile.type === 'loading') {
              return <LoadingTile key={tile.id} task={tile.task} label={tile.label} />
            }

            if (tile.type === 'result') {
              return (
                <GeneratedImageTile
                  key={tile.id}
                  imageUrl={tile.imageUrl}
                  label={tile.label}
                  task={tile.task}
                  imageIndex={tile.imageIndex}
                  onPreview={setPreviewImage}
                  onDownload={() => void handleDownload(tile.task, tile.imageUrl, tile.imageIndex)}
                  onUseAsReference={onUseAsReference ? () => onUseAsReference({
                    id: `result-${tile.task.id}-${tile.imageIndex}`,
                    filename: `image2-${tile.task.id}-${tile.imageIndex + 1}.png`,
                    imageUrl: tile.imageUrl,
                  }) : undefined}
                />
              )
            }

            if (tile.type === 'empty') {
              return (
                <MessageTile
                  key={tile.id}
                  type="empty"
                  label={tile.label}
                  message="生成完成，但没有可展示的图片结果。图片可能已保存到资产库，请切到资产库查看。"
                />
              )
            }

            if (tile.type === 'interrupted') {
              return (
                <MessageTile
                  key={tile.id}
                  type="interrupted"
                  label={tile.label}
                  message={tile.task.errorMsg || '页面刷新后，当前浏览器已停止追踪这个任务。结果如果已完成，会保存在资产库中。'}
                />
              )
            }

            return (
              <MessageTile
                key={tile.id}
                type="error"
                label={tile.label}
                message={clampErrorMessage(tile.task.errorMsg)}
              />
            )
          })}
        </div>
      </article>

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-full max-w-6xl" onClick={event => event.stopPropagation()}>
            <img src={previewImage.url} alt="Preview" className="max-h-[86vh] max-w-full rounded-2xl border border-white/10 object-contain" />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              {previewImage.type === 'result' && onUseAsReference && (
                <AddToReferenceButton
                  onClick={(event) => {
                    event.stopPropagation()
                    handleUsePreviewAsReference()
                  }}
                  className="opacity-100"
                />
              )}
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white transition hover:bg-white/15"
                aria-label="关闭预览"
              >
                <X size={18} />
              </button>
            </div>
            {previewImage.type === 'result' && (
              <button
                type="button"
                onClick={() => void handleDownload(previewImage.task || primaryTask, previewImage.url, previewImage.imageIndex ?? 0)}
                className="absolute bottom-3 right-3 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 text-sm text-white transition hover:bg-white/15"
              >
                <Download size={16} />
                下载
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
