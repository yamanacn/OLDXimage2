import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssetDaySummary, AssetItem, AssetListResponse } from '../assetTypes'
import type { GenerationRequest } from '../types'
import { Archive, ArrowUp, CalendarDays, ImageIcon, Maximize2, RotateCcw, Search, SlidersHorizontal, SquarePen } from 'lucide-react'
import clsx from 'clsx'
import { readJsonResponse } from '../apiClient'
import AddToReferenceButton from './AddToReferenceButton'

type LibraryViewProps = {
  refreshKey: number
  onRegenerate: (params: Partial<GenerationRequest>) => void
  onEditAsset: (asset: AssetItem) => void
  onUseAsReference: (asset: AssetItem) => void
}

type DayBucket = {
  day: string
  items: AssetItem[]
  nextCursor: number | null
  hasMore: boolean
  total: number
}

const PAGE_SIZE = 40
const SCROLL_TOP_THRESHOLD = 520

type AssetTileProps = {
  asset: AssetItem
  onPreview: (asset: AssetItem) => void
  onRegenerate: (params: Partial<GenerationRequest>) => void
  onEditAsset: (asset: AssetItem) => void
  onUseAsReference: (asset: AssetItem) => void
}

type PositionedVirtualItem = {
  key: string
  top: number
  height: number
  bottom: number
} & (
  | {
      type: 'day'
      day: string
      loaded: number
      total: number
    }
  | {
      type: 'row'
      assets: AssetItem[]
    }
)

const GRID_GAP = 12
const DAY_HEADER_HEIGHT = 36
const DAY_TO_ROW_GAP = 16
const ROW_GAP = 12
const TILE_META_HEIGHT = 136
const VIRTUAL_OVERSCAN = 900
const DEFAULT_LIST_WIDTH = 960

const findScrollParent = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null

  while (current) {
    const { overflowY } = window.getComputedStyle(current)
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current
    }
    current = current.parentElement
  }

  return document.scrollingElement as HTMLElement | null
}

const parseAspectRatio = (asset: AssetItem) => {
  if (asset.width && asset.height) return asset.width / asset.height

  const [width, height] = asset.params.aspectRatio.split(':').map(Number)
  if (Number.isFinite(width) && Number.isFinite(height) && height > 0) return width / height
  return 1
}

const getAssetFrame = (asset: AssetItem) => {
  const ratio = parseAspectRatio(asset)
  if (ratio >= 1.45) {
    return {
      tile: 'sm:col-span-2',
      media: 'aspect-[16/9]',
      image: 'object-cover',
    }
  }

  if (ratio <= 0.78) {
    return {
      tile: '',
      media: 'aspect-[3/4]',
      image: 'object-cover',
    }
  }

  return {
    tile: '',
    media: 'aspect-square',
    image: 'object-cover',
  }
}

const getTileColumnSpan = (asset: AssetItem, viewportWidth = Number.POSITIVE_INFINITY) =>
  viewportWidth >= 640 && parseAspectRatio(asset) >= 1.45 ? 2 : 1

const getTileMediaHeight = (asset: AssetItem, columnWidth: number, viewportWidth: number) => {
  const ratio = parseAspectRatio(asset)
  const span = getTileColumnSpan(asset, viewportWidth)
  const width = columnWidth * span + GRID_GAP * (span - 1)

  if (ratio >= 1.45) return width * 9 / 16
  if (ratio <= 0.78) return width * 4 / 3
  return width
}

const getColumnCount = (width: number, thumbSize: number) =>
  Math.max(1, Math.floor((Math.max(width, thumbSize) + GRID_GAP) / (thumbSize + GRID_GAP)))

const buildVirtualItems = ({
  buckets,
  thumbSize,
  viewportWidth,
}: {
  buckets: DayBucket[]
  thumbSize: number
  viewportWidth: number
}) => {
  const width = Math.max(viewportWidth, thumbSize)
  const columnCount = getColumnCount(width, thumbSize)
  const columnWidth = (width - GRID_GAP * (columnCount - 1)) / columnCount
  const items: PositionedVirtualItem[] = []
  let cursor = 0

  for (const bucket of buckets) {
    items.push({
      type: 'day',
      key: `day-${bucket.day}`,
      day: bucket.day,
      loaded: bucket.items.length,
      total: bucket.total,
      top: cursor,
      height: DAY_HEADER_HEIGHT,
      bottom: cursor + DAY_HEADER_HEIGHT,
    })
    cursor += DAY_HEADER_HEIGHT + DAY_TO_ROW_GAP

    let rowAssets: AssetItem[] = []
    let usedColumns = 0
    const commitRow = () => {
      if (rowAssets.length === 0) return

      const rowHeight = Math.ceil(
        Math.max(...rowAssets.map(asset => getTileMediaHeight(asset, columnWidth, width))) + TILE_META_HEIGHT
      )
      items.push({
        type: 'row',
        key: `row-${bucket.day}-${items.length}`,
        assets: rowAssets,
        top: cursor,
        height: rowHeight,
        bottom: cursor + rowHeight,
      })
      cursor += rowHeight + ROW_GAP
      rowAssets = []
      usedColumns = 0
    }

    for (const asset of bucket.items) {
      const span = Math.min(getTileColumnSpan(asset, width), columnCount)
      if (usedColumns > 0 && usedColumns + span > columnCount) commitRow()
      rowAssets.push(asset)
      usedColumns += span
      if (usedColumns >= columnCount) commitRow()
    }

    commitRow()
    cursor += 20
  }

  return {
    items,
    totalHeight: Math.max(0, cursor),
    columnCount,
    columnWidth,
  }
}

function AssetReferenceStack({ asset, expanded = false }: { asset: AssetItem; expanded?: boolean }) {
  const references = asset.referenceImages || asset.params.images || []
  if (references.length === 0) return null

  const visible = references.slice(0, expanded ? 8 : 4)
  const hiddenCount = Math.max(0, references.length - visible.length)

  return (
    <div className={clsx(
      "flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-2 py-1.5",
      expanded ? "flex-wrap" : "w-fit"
    )}>
      <div className="flex h-8 items-center">
        {visible.map((image, index) => (
          <button
            key={image.id || `${asset.id}-reference-${index}`}
            type="button"
            className={clsx(
              "relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#1a1a1a] shadow-[0_6px_14px_rgba(0,0,0,0.32)]",
              index > 0 && !expanded && "-ml-2"
            )}
            title={`图${index + 1}`}
          >
            <img
              src={image.thumbUrl || image.dataUrl}
              alt={image.name || `参考图 ${index + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute left-0.5 top-0.5 rounded-full bg-black/70 px-1 py-0.5 text-[8px] font-medium leading-none text-white/90">
              图{index + 1}
            </span>
          </button>
        ))}
      </div>
      <span className="whitespace-nowrap text-[10px] leading-none text-neutral-500">
        参考图 {references.length}{hiddenCount > 0 ? ` +${hiddenCount}` : ''}
      </span>
    </div>
  )
}

const AssetTile = memo(function AssetTile({
  asset,
  onPreview,
  onRegenerate,
  onEditAsset,
  onUseAsReference,
}: AssetTileProps) {
  const frame = getAssetFrame(asset)

  return (
    <article
      className={clsx(
        "group overflow-hidden rounded-lg border border-white/6 bg-[#151515] [content-visibility:auto] [contain-intrinsic-size:320px]",
        "transition hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#181818] hover:shadow-lg hover:shadow-black/20",
        frame.tile
      )}
    >
      <div className={clsx("relative w-full overflow-hidden bg-black", frame.media)}>
        <button
          type="button"
          onClick={() => onPreview(asset)}
          className="absolute inset-0 block h-full w-full text-left"
        >
          <img
            src={asset.thumbUrl}
            alt="历史生成结果"
            loading="lazy"
            decoding="async"
            className={clsx("h-full w-full transition-transform duration-300 group-hover:scale-[1.018]", frame.image)}
          />
        </button>
        <AddToReferenceButton
          onClick={event => {
            event.stopPropagation()
            onUseAsReference(asset)
          }}
          className="absolute right-2 top-2"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent p-2.5 opacity-0 transition group-hover:opacity-100">
          <span className="rounded-full bg-black/45 px-2 py-1 text-[11px] text-neutral-300 backdrop-blur">
            {asset.params.aspectRatio}
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/50 text-neutral-200 backdrop-blur">
            <Maximize2 size={14} />
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <p className="truncate text-sm leading-5 text-neutral-300" title={asset.prompt}>
          {asset.prompt || '未提供提示词'}
        </p>
        <AssetReferenceStack asset={asset} />
        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-600">
          <span className="flex items-center gap-1">
            <ImageIcon size={12} />
            {asset.params.resolution}
          </span>
          <button
            type="button"
            onClick={() => onEditAsset(asset)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/8 hover:text-neutral-100"
            aria-label="编辑资产"
            title="编辑"
          >
            <SquarePen size={13} />
          </button>
          <button
            type="button"
            onClick={() => onRegenerate(asset.params)}
            className="grid h-7 w-7 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/8 hover:text-neutral-100"
            aria-label="同参数再生成"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
    </article>
  )
})

function VirtualDayHeader({ item }: { item: Extract<PositionedVirtualItem, { type: 'day' }> }) {
  return (
    <div className="flex h-full items-center justify-between border-b border-white/6 pb-3">
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
        <CalendarDays size={16} className="text-neutral-500" />
        {formatDayLabel(item.day)}
        <span className="font-mono text-xs text-neutral-600">{item.day}</span>
      </div>
      <span className="text-xs text-neutral-600">
        {item.loaded}/{item.total} 张
      </span>
    </div>
  )
}

function VirtualAssetRow({
  item,
  thumbSize,
  onPreview,
  onRegenerate,
  onEditAsset,
  onUseAsReference,
}: {
  item: Extract<PositionedVirtualItem, { type: 'row' }>
  thumbSize: number
  onPreview: (asset: AssetItem) => void
  onRegenerate: (params: Partial<GenerationRequest>) => void
  onEditAsset: (asset: AssetItem) => void
  onUseAsReference: (asset: AssetItem) => void
}) {
  return (
    <div
      className="grid grid-flow-dense gap-2 sm:gap-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
      }}
    >
      {item.assets.map(asset => (
        <AssetTile
          key={asset.id}
          asset={asset}
          onPreview={onPreview}
          onRegenerate={onRegenerate}
          onEditAsset={onEditAsset}
          onUseAsReference={onUseAsReference}
        />
      ))}
    </div>
  )
}

const formatDayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  const value = new Date(year, month - 1, date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(value, today)) return '今天'
  if (isSameDay(value, yesterday)) return '昨天'

  return value.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const loadAssets = async ({ day, cursor, keyword }: { day: string; cursor: number; keyword: string }) => {
  const params = new URLSearchParams({
    day,
    cursor: String(cursor),
    pageSize: String(PAGE_SIZE),
  })
  if (keyword.trim()) params.set('keyword', keyword.trim())

  const response = await fetch(`/api/assets?${params.toString()}`)
  return readJsonResponse<AssetListResponse>(response, '资产库加载失败')
}

export default function LibraryView({ refreshKey, onRegenerate, onEditAsset, onUseAsReference }: LibraryViewProps) {
  const [days, setDays] = useState<AssetDaySummary[]>([])
  const [buckets, setBuckets] = useState<DayBucket[]>([])
  const [outputDir, setOutputDir] = useState('')
  const [keyword, setKeyword] = useState('')
  const [draftKeyword, setDraftKeyword] = useState('')
  const [thumbSize, setThumbSize] = useState(220)
  const [status, setStatus] = useState<'loading' | 'idle' | 'loadingMore' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(760)
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  const visibleItems = useMemo(
    () => buckets.reduce((sum, bucket) => sum + bucket.items.length, 0),
    [buckets]
  )

  const virtualLayout = useMemo(
    () => buildVirtualItems({ buckets, thumbSize, viewportWidth: listWidth }),
    [buckets, listWidth, thumbSize]
  )

  const renderedVirtualItems = useMemo(
    () => virtualLayout.items.filter(item =>
      item.bottom >= scrollTop - VIRTUAL_OVERSCAN &&
      item.top <= scrollTop + viewportHeight + VIRTUAL_OVERSCAN
    ),
    [scrollTop, virtualLayout.items, viewportHeight]
  )

  const loadInitial = useCallback(async (nextKeyword: string) => {
    setStatus('loading')
    setErrorMsg('')

    try {
      const firstPayload = await loadAssets({ day: '', cursor: 0, keyword: nextKeyword })
      setDays(firstPayload.days)
      setOutputDir(firstPayload.outputDir)

      const initialBuckets: DayBucket[] = []
      if (firstPayload.days.length > 0) {
        initialBuckets.push({
          day: firstPayload.days[0].day,
          items: firstPayload.items,
          nextCursor: firstPayload.nextCursor,
          hasMore: firstPayload.hasMore,
          total: firstPayload.total,
        })
      }

      if (firstPayload.days[1]) {
        const secondPayload = await loadAssets({ day: firstPayload.days[1].day, cursor: 0, keyword: nextKeyword })
        initialBuckets.push({
          day: firstPayload.days[1].day,
          items: secondPayload.items,
          nextCursor: secondPayload.nextCursor,
          hasMore: secondPayload.hasMore,
          total: secondPayload.total,
        })
      }

      setBuckets(initialBuckets)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setErrorMsg(error instanceof Error ? error.message : '资产库加载失败')
    }
  }, [])

  useEffect(() => {
    const element = listRef.current
    if (!element) return

    const updateWidth = () => {
      setListWidth(Math.max(1, element.getBoundingClientRect().width))
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [visibleItems])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || status === 'loading' || status === 'loadingMore') return
    loadingRef.current = true
    setStatus('loadingMore')

    try {
      const activeIndex = buckets.findIndex(bucket => bucket.hasMore)
      if (activeIndex >= 0) {
        const bucket = buckets[activeIndex]
        const payload = await loadAssets({ day: bucket.day, cursor: bucket.nextCursor ?? bucket.items.length, keyword })
        setBuckets(current => current.map((item, index) =>
          index === activeIndex
            ? {
                ...item,
                items: [...item.items, ...payload.items],
                nextCursor: payload.nextCursor,
                hasMore: payload.hasMore,
                total: payload.total,
              }
            : item
        ))
        setStatus('idle')
        return
      }

      const loadedDays = new Set(buckets.map(bucket => bucket.day))
      const nextDay = days.find(day => !loadedDays.has(day.day))
      if (!nextDay) {
        setStatus('idle')
        return
      }

      const payload = await loadAssets({ day: nextDay.day, cursor: 0, keyword })
      setBuckets(current => [
        ...current,
        {
          day: nextDay.day,
          items: payload.items,
          nextCursor: payload.nextCursor,
          hasMore: payload.hasMore,
          total: payload.total,
        },
      ])
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setErrorMsg(error instanceof Error ? error.message : '加载更多失败')
    } finally {
      loadingRef.current = false
    }
  }, [buckets, days, keyword, status])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitial(keyword)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [refreshKey, keyword, loadInitial])

  useEffect(() => {
    const element = sentinelRef.current
    if (!element) return

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        void loadMore()
      }
    }, { rootMargin: '560px 0px' })

    observer.observe(element)
    return () => observer.disconnect()
  }, [loadMore])

  useEffect(() => {
    const scrollParent = findScrollParent(rootRef.current)
    scrollParentRef.current = scrollParent
    if (!scrollParent) return

    let frameId = 0
    const updateVisibility = () => {
      frameId = 0
      const listElement = listRef.current
      const listTop = listElement
        ? listElement.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
        : 0
      setScrollTop(Math.max(0, scrollParent.scrollTop - listTop))
      setViewportHeight(scrollParent.clientHeight || window.innerHeight)
      setShowScrollTop(scrollParent.scrollTop > SCROLL_TOP_THRESHOLD)
    }

    const handleScroll = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(updateVisibility)
    }

    updateVisibility()
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollParent.removeEventListener('scroll', handleScroll)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [visibleItems])

  useEffect(() => {
    const scrollParent = scrollParentRef.current || findScrollParent(rootRef.current)
    if (!scrollParent) return

    const listElement = listRef.current
    const listTop = listElement
      ? listElement.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
      : 0
    setScrollTop(Math.max(0, scrollParent.scrollTop - listTop))
    setViewportHeight(scrollParent.clientHeight || window.innerHeight)
  }, [listWidth, visibleItems])

  const handleSearch = () => {
    setKeyword(draftKeyword.trim())
  }

  const handleScrollToTop = () => {
    const scrollParent = scrollParentRef.current || findScrollParent(rootRef.current)
    scrollParent?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleThumbSizeChange = (nextSize: number) => {
    setThumbSize(nextSize)
    requestAnimationFrame(() => {
      const scrollParent = scrollParentRef.current || findScrollParent(rootRef.current)
      if (!scrollParent) return

      const listElement = listRef.current
      const listTop = listElement
        ? listElement.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
        : 0
      setScrollTop(Math.max(0, scrollParent.scrollTop - listTop))
    })
  }

  const handlePreviewAsset = useCallback((asset: AssetItem) => {
    setPreviewAsset(asset)
  }, [])

  const hasMore = buckets.some(bucket => bucket.hasMore) || buckets.length < days.length

  if (status === 'loading' && buckets.length === 0) {
    return (
      <div className="mx-auto max-w-6xl p-8 pb-32">
        <div className="mb-8 h-24 rounded-2xl border border-white/6 bg-[#121212]" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-white/6 bg-[#151515]" />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'error' && buckets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center text-neutral-500">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/6 bg-[var(--color-dark-card)]">
          <Archive size={24} strokeWidth={1.75} />
        </div>
        <h2 className="text-sm font-semibold text-neutral-300">资产库暂时无法读取</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed">{errorMsg}</p>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative mx-auto max-w-7xl space-y-8 p-8 pb-32">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Archive size={16} />
              <span>资产库</span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">本地输出目录</h2>
            <p className="mt-2 max-w-3xl truncate text-sm text-neutral-500" title={outputDir}>
              {outputDir || '默认图片目录'}，按日期归档生成图片。
            </p>
          </div>
          <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-400">
            已加载 {visibleItems} 张
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/6 bg-[#121212] p-3">
          <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3">
            <Search size={16} className="text-neutral-500" />
            <input
              value={draftKeyword}
              onChange={event => setDraftKeyword(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleSearch()
              }}
              placeholder="按提示词关键词筛选"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="h-7 rounded-lg bg-white px-2.5 text-xs font-medium text-black transition hover:bg-neutral-200"
            >
              筛选
            </button>
          </div>

          <div className="flex h-10 items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 text-xs text-neutral-500">
            <SlidersHorizontal size={15} />
            <span>缩略图</span>
            <input
              type="range"
              min="140"
              max="320"
              step="10"
              value={thumbSize}
              onChange={event => handleThumbSizeChange(Number(event.target.value))}
              className="w-28 cursor-pointer accent-white"
            />
            <span className="w-10 text-right font-mono text-neutral-400">{thumbSize}px</span>
          </div>
        </div>
      </div>

      {buckets.length === 0 || visibleItems === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-white/6 bg-[#121212] px-8 text-center text-neutral-500">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/6 bg-black/20">
            <Archive size={24} strokeWidth={1.75} />
          </div>
          <h2 className="text-sm font-semibold text-neutral-300">还没有匹配的资产</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed">
            生成完成后会自动保存到图片日期目录。关键词筛选基于图片绑定的提示词元数据。
          </p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="relative"
          style={{ height: virtualLayout.totalHeight }}
        >
          {renderedVirtualItems.map(item => (
            <section
              key={item.key}
              className="absolute left-0 right-0"
              style={{
                height: item.height,
                transform: `translateY(${item.top}px)`,
              }}
            >
              {item.type === 'day' ? (
                <VirtualDayHeader item={item} />
              ) : (
                <VirtualAssetRow
                  item={item}
                  thumbSize={thumbSize}
                  onPreview={handlePreviewAsset}
                  onRegenerate={onRegenerate}
                  onEditAsset={onEditAsset}
                  onUseAsReference={onUseAsReference}
                />
              )}
            </section>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex h-16 items-center justify-center text-xs text-neutral-600">
        {status === 'loadingMore' ? '正在加载更多资产...' : hasMore ? '继续向下滚动加载历史日期' : '已经到底了'}
      </div>

      <button
        type="button"
        onClick={handleScrollToTop}
        aria-label="返回顶部"
        title="返回顶部"
        className={clsx(
          'fixed bottom-7 right-[calc(var(--right-panel-width,380px)+28px)] z-40 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[#171717]/88 text-neutral-300 shadow-2xl shadow-black/35 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/18 hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 max-[760px]:right-7',
          showScrollTop
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-3 opacity-0'
        )}
      >
        <ArrowUp size={17} strokeWidth={1.9} />
      </button>

      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setPreviewAsset(null)}
        >
          <div className="grid max-h-[88vh] max-w-6xl gap-4 md:grid-cols-[minmax(0,1fr)_320px]" onClick={event => event.stopPropagation()}>
            <img
              src={previewAsset.imageUrl}
              alt="资产预览"
              className="max-h-[88vh] min-w-0 rounded-2xl border border-white/10 object-contain"
            />
            <aside className="flex max-h-[88vh] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/8 bg-[#121212] p-5">
              <div>
                <div className="mb-1 text-xs text-neutral-500">提示词</div>
                <p className="text-sm leading-6 text-neutral-200">{previewAsset.prompt || '未提供提示词'}</p>
              </div>
              {(previewAsset.referenceImages?.length || previewAsset.params.images.length) > 0 && (
                <div>
                  <div className="mb-2 text-xs text-neutral-500">参考图</div>
                  <AssetReferenceStack asset={previewAsset} expanded />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500">
                <span className="rounded-lg bg-white/5 px-2.5 py-2">比例 {previewAsset.params.aspectRatio}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-2">{previewAsset.params.resolution}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-2">{previewAsset.params.model}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-2">{previewAsset.params.outputFormat.toUpperCase()}</span>
              </div>
              <div className="mt-auto grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    onEditAsset(previewAsset)
                    setPreviewAsset(null)
                  }}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] text-sm font-medium text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.1]"
                >
                  <SquarePen size={15} />
                  重新编辑
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerate(previewAsset.params)}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-black transition hover:bg-neutral-200"
                >
                  <RotateCcw size={15} />
                  同参数再生成
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
