import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Download, RefreshCw, X, AlertCircle } from 'lucide-react'

type UpdateState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'not-available' }
  | { type: 'available'; version: string; releaseNotes: string }
  | { type: 'downloading'; percent: number; speed: number }
  | { type: 'downloaded' }
  | { type: 'error'; message: string }

const SKIPPED_VERSIONS_KEY = 'image2-skipped-versions'

const getSkippedVersions = (): string[] => {
  try {
    return JSON.parse(window.sessionStorage.getItem(SKIPPED_VERSIONS_KEY) || '[]')
  } catch { return [] }
}

const addSkippedVersion = (version: string) => {
  const skipped = getSkippedVersions()
  if (!skipped.includes(version)) {
    skipped.push(version)
    window.sessionStorage.setItem(SKIPPED_VERSIONS_KEY, JSON.stringify(skipped))
  }
}

const isSkipped = (version: string) => getSkippedVersions().includes(version)

const easeOut = [0.23, 1, 0.32, 1] as const

type Props = { collapsed?: boolean }

export default function UpdateChecker({ collapsed = false }: Props) {
  const [state, setState] = useState<UpdateState>({ type: 'idle' })
  const [badge, setBadge] = useState(false)
  const timerRef = useRef<number>(0)
  const api = window.electronAPI

  const isDownloading = state.type === 'downloading'
  const isDownloaded = state.type === 'downloaded'
  const showProgress = isDownloading || isDownloaded

  useEffect(() => {
    if (!api?.onUpdateState) return
    return api.onUpdateState((data) => {
      if (data.type === 'available') {
        const version = data.version || ''
        if (version && !isSkipped(version)) {
          setState({ type: 'available', version, releaseNotes: data.releaseNotes || '' })
          setBadge(true)
        }
      } else if (data.type === 'progress') {
        setState({ type: 'downloading', percent: data.percent ?? 0, speed: data.speed ?? 0 })
      } else if (data.type === 'downloaded') {
        setState({ type: 'downloaded' })
      } else if (data.type === 'not-available') {
        setState({ type: 'not-available' })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 3000)
      } else if (data.type === 'error') {
        setState({ type: 'error', message: data.message || '未知错误' })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 4000)
      }
    })
  }, [api])

  useEffect(() => {
    if (api?.checkUpdate) {
      const timer = window.setTimeout(() => { void api.checkUpdate!() }, 3000)
      return () => window.clearTimeout(timer)
    }
  }, [api])

  const handleCheck = useCallback(() => {
    if (!api?.checkUpdate || state.type === 'checking' || isDownloading) return
    setState({ type: 'checking' })
    api.checkUpdate().then((result) => {
      if (result?.type === 'error') {
        setState({ type: 'error', message: result.message || '更新检查不可用' })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 4000)
      }
    })
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setState((prev) => (prev.type === 'checking' ? { type: 'error', message: '检查超时，请稍后重试' } : prev))
      timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 4000)
    }, 15000)
  }, [api, state.type, isDownloading])

  const handleDownload = useCallback(() => {
    if (api?.downloadUpdate) void api.downloadUpdate()
    setState({ type: 'downloading', percent: 0, speed: 0 })
  }, [api])

  const handleInstall = useCallback(() => {
    if (api?.installUpdate) api.installUpdate()
  }, [api])

  const handleSkip = useCallback(() => {
    if (state.type === 'available') addSkippedVersion(state.version)
    setState({ type: 'idle' })
    setBadge(false)
  }, [state])

  /* ── icon button (used when collapsed OR no download in progress in expanded) ── */
  const iconEl = (
    <motion.button
      type="button"
      onClick={handleCheck}
      title="检查更新"
      aria-label="检查更新"
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-neutral-600 transition hover:bg-white/[0.06] hover:text-neutral-300"
      whileTap={{ scale: 0.9 }}
    >
      <AnimatePresence mode="wait">
        {state.type === 'checking' ? (
          <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RefreshCw size={16} className="animate-spin" />
          </motion.span>
        ) : state.type === 'not-available' ? (
          <motion.span key="ok" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <CheckCircle size={16} className="text-emerald-400" />
          </motion.span>
        ) : state.type === 'error' ? (
          <motion.span key="err" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <AlertCircle size={16} className="text-red-400" />
          </motion.span>
        ) : isDownloading || isDownloaded ? (
          <motion.span key="dl" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <Download size={16} className="text-cyan-300" />
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RefreshCw size={16} />
          </motion.span>
        )}
      </AnimatePresence>
      {badge && !showProgress && (
        <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
      )}
    </motion.button>
  )

  /* ── capsule progress bar ── */
  const percent = state.type === 'downloading' ? state.percent : isDownloaded ? 100 : 0

  const progressBar = (
    <motion.div
      key="capsule"
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={{ duration: 0.25, ease: easeOut }}
      onClick={isDownloaded ? handleInstall : undefined}
      className={collapsed
        ? "relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full bg-white/8"
        : "relative h-7 w-full shrink-0 cursor-pointer overflow-hidden rounded-full bg-white/8"}
    >
      {/* fill */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        initial={false}
        animate={{
          width: `${percent}%`,
          backgroundColor: isDownloaded ? '#10b981' : '#22d3ee',
        }}
        transition={{ width: { duration: 0.35, ease: 'easeOut' }, backgroundColor: { duration: 0.4 } }}
      />

      {/* shimmer (downloading only) */}
      {isDownloading && (
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          style={{ skewX: '-20deg' }}
          initial={{ x: '-100%' }}
          animate={{ x: '400%' }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-medium tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {isDownloaded
            ? (collapsed ? 'OK' : '点击重启')
            : (collapsed ? `${percent}%` : `更新 ${percent}%`)}
        </span>
      </div>
    </motion.div>
  )

  /* ── collapsed layout: icon only, swap to capsule on download ── */
  if (collapsed) {
    return (
      <div className="relative">
        <AnimatePresence mode="wait">
          {showProgress ? progressBar : iconEl}
        </AnimatePresence>
      </div>
    )
  }

  /* ── expanded layout ── */
  return (
    <>
      <AnimatePresence mode="wait">
        {showProgress ? (
          <div key="progress-row" className="flex w-full items-center">
            {progressBar}
          </div>
        ) : (
          <div key="icon-row" className="flex items-center gap-1">
            {iconEl}
          </div>
        )}
      </AnimatePresence>

      {/* popup cards */}
      <AnimatePresence>
        {state.type === 'available' && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: easeOut }}
            className="absolute bottom-full left-0 mb-2 w-[280px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">发现新版本 v{state.version}</span>
              <button type="button" onClick={handleSkip} className="text-neutral-600 hover:text-neutral-300 transition">
                <X size={14} />
              </button>
            </div>
            {state.releaseNotes && (
              <p className="mb-3 text-xs leading-relaxed text-neutral-400">{state.releaseNotes.slice(0, 200)}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-medium text-black transition hover:bg-neutral-200"
              >
                <Download size={13} />
                更新
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-xs text-neutral-400 transition hover:border-white/20 hover:text-neutral-200"
              >
                跳过
              </button>
            </div>
          </motion.div>
        )}

        {state.type === 'downloaded' && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: easeOut }}
            className="absolute bottom-full left-0 mb-2 w-[280px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle size={15} />
              下载完成
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-medium text-black transition hover:bg-neutral-200"
              >
                立即重启
              </button>
              <button
                type="button"
                onClick={() => setState({ type: 'idle' })}
                className="flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-xs text-neutral-400 transition hover:text-neutral-200"
              >
                稍后
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
