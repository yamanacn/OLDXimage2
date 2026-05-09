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

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ type: 'idle' })
  const [badge, setBadge] = useState(false)
  const timerRef = useRef<number>(0)
  const api = window.electronAPI

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

  // Silent check on mount
  useEffect(() => {
    if (api?.checkUpdate) {
      const timer = window.setTimeout(() => { void api.checkUpdate!() }, 3000)
      return () => window.clearTimeout(timer)
    }
  }, [api])

  const handleCheck = useCallback(() => {
    if (!api?.checkUpdate || state.type === 'checking' || state.type === 'downloading') return
    setState({ type: 'checking' })
    void api.checkUpdate()
  }, [api, state.type])

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
        ) : state.type === 'downloading' || state.type === 'downloaded' ? (
          <motion.span key="dl" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <Download size={16} className="text-cyan-300" />
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RefreshCw size={16} />
          </motion.span>
        )}
      </AnimatePresence>
      {badge && state.type !== 'downloading' && state.type !== 'downloaded' && (
        <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
      )}
    </motion.button>
  )

  return (
    <>
      {iconEl}

      <AnimatePresence>
        {state.type === 'available' && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
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

        {state.type === 'downloading' && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 mb-2 w-[280px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
          >
            <div className="mb-2 text-xs font-medium text-neutral-300">正在下载更新...</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${state.percent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
              <span>{state.percent}%</span>
              <span>{state.speed > 0 ? `${state.speed} KB/s` : ''}</span>
            </div>
          </motion.div>
        )}

        {state.type === 'downloaded' && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
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
