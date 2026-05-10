import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, RefreshCw, X, AlertCircle, ExternalLink } from 'lucide-react'

type UpdateState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'not-available' }
  | { type: 'available'; version: string; releaseNotes: string }
  | { type: 'error'; message: string; rawMessage?: string }

const SKIPPED_VERSIONS_KEY = 'image2-skipped-versions'

const getSkippedVersions = (): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(SKIPPED_VERSIONS_KEY) || '[]')
  } catch { return [] }
}

const addSkippedVersion = (version: string) => {
  const skipped = getSkippedVersions()
  if (!skipped.includes(version)) {
    skipped.push(version)
    window.localStorage.setItem(SKIPPED_VERSIONS_KEY, JSON.stringify(skipped))
  }
}

const isSkipped = (version: string) => getSkippedVersions().includes(version)

const easeOut = [0.23, 1, 0.32, 1] as const

const GITHUB_RELEASE_URL = 'https://github.com/yamanacn/OLDXimage2/releases/latest'
const QUARK_URL = 'https://pan.quark.cn/s/0745fa1cfb6e?pwd=TPEw'

type Props = { collapsed?: boolean }

export default function UpdateChecker({ collapsed = false }: Props) {
  const [state, setState] = useState<UpdateState>({ type: 'idle' })
  const [badge, setBadge] = useState(false)
  const [popupPos, setPopupPos] = useState<{ bottom: number; left: number }>({ bottom: 80, left: 8 })
  const timerRef = useRef<number>(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const api = window.electronAPI

  const updatePopupPos = useCallback(() => {
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    setPopupPos({ bottom: window.innerHeight - r.top + 8, left: r.left })
  }, [])

  useLayoutEffect(() => {
    updatePopupPos()
    window.addEventListener('resize', updatePopupPos)
    return () => window.removeEventListener('resize', updatePopupPos)
  }, [state.type, updatePopupPos])

  useEffect(() => {
    if (!api?.onUpdateState) return
    return api.onUpdateState((data) => {
      if (data.type === 'available') {
        const version = data.version || ''
        if (version && !isSkipped(version)) {
          setState({ type: 'available', version, releaseNotes: data.releaseNotes || '' })
          setBadge(true)
        }
      } else if (data.type === 'not-available') {
        setState({ type: 'not-available' })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 3000)
      } else if (data.type === 'error') {
        setState({ type: 'error', message: data.message || '未知错误', rawMessage: data.rawMessage })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 6000)
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
    if (!api?.checkUpdate || state.type === 'checking') return
    setState({ type: 'checking' })
    api.checkUpdate().then((result) => {
      if (result?.type === 'error') {
        setState({ type: 'error', message: '更新检查不可用' })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 6000)
      }
    })
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setState((prev) => (prev.type === 'checking' ? { type: 'error', message: '检查超时，请确保已开启网络代理' } : prev))
      timerRef.current = window.setTimeout(() => setState({ type: 'idle' }), 6000)
    }, 15000)
  }, [api, state.type])

  const handleSkip = useCallback(() => {
    if (state.type === 'available') addSkippedVersion(state.version)
    setState({ type: 'idle' })
    setBadge(false)
  }, [state])

  /* ── icon button ── */
  const iconEl = (
    <motion.button
      type="button"
      onClick={handleCheck}
      title="检查更新"
      aria-label="检查更新"
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-neutral-600 transition hover:bg-white/[0.06] hover:text-neutral-300 disabled:pointer-events-none"
      whileTap={{ scale: 0.9 }}
      disabled={state.type === 'checking'}
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
          <motion.span key="err" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} title={state.rawMessage || state.message}>
            <AlertCircle size={16} className="text-red-400" />
          </motion.span>
        ) : state.type === 'available' ? (
          <motion.span key="avail" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
            <ExternalLink size={16} className="text-cyan-300" />
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RefreshCw size={16} />
          </motion.span>
        )}
      </AnimatePresence>
      {badge && state.type !== 'available' && (
        <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
      )}
    </motion.button>
  )

  /* ── collapsed layout ── */
  if (collapsed) {
    return <div className="relative">{iconEl}</div>
  }

  /* ── expanded layout ── */
  const popupStyle = { position: 'fixed' as const, ...popupPos, width: 280 }

  const popupCard = (
    <AnimatePresence>
      {state.type === 'checking' && (
        <motion.div
          style={popupStyle}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: easeOut }}
          className="z-[10000] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <RefreshCw size={15} className="animate-spin text-cyan-400" />
            正在检查更新...
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
            如检查失败，请确保已开启网络代理（魔法网络）
          </p>
        </motion.div>
      )}

      {state.type === 'not-available' && (
        <motion.div
          style={popupStyle}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: easeOut }}
          className="z-[10000] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <CheckCircle size={15} />
            已是最新版 v{__APP_VERSION__}
          </div>
        </motion.div>
      )}

      {state.type === 'available' && (
        <motion.div
          style={popupStyle}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: easeOut }}
          className="z-[10000] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
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
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.open(GITHUB_RELEASE_URL, '_blank')}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-medium text-black transition hover:bg-neutral-200"
            >
              <ExternalLink size={13} />
              GitHub 下载
            </button>
            <button
              type="button"
              onClick={() => window.open(QUARK_URL, '_blank')}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
            >
              夸克网盘下载
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="flex h-7 items-center justify-center text-[11px] text-neutral-600 transition hover:text-neutral-400"
            >
              跳过此版本
            </button>
          </div>
        </motion.div>
      )}

      {state.type === 'error' && (
        <motion.div
          style={popupStyle}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: easeOut }}
          className="z-[10000] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.56)] backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-300">
            <AlertCircle size={15} />
            {state.message}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.open(GITHUB_RELEASE_URL, '_blank')}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-medium text-black transition hover:bg-neutral-200"
            >
              <ExternalLink size={13} />
              GitHub 下载
            </button>
            <button
              type="button"
              onClick={() => window.open(QUARK_URL, '_blank')}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
            >
              夸克网盘下载
            </button>
            <button
              type="button"
              onClick={handleCheck}
              className="flex h-7 items-center justify-center text-[11px] text-neutral-600 transition hover:text-neutral-400"
            >
              重试
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <div ref={anchorRef}>
        <div className="flex items-center gap-1">
          {iconEl}
        </div>
      </div>
      {createPortal(popupCard, document.body)}
    </>
  )
}
