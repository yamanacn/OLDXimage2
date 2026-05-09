import { useState } from 'react'
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

const PROMPT_REFERENCE_URL = 'https://gpt-image2.canghe.ai/#gallery'

export default function PromptReferenceView() {
  const [frameKey, setFrameKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const handleReload = () => {
    setIsLoading(true)
    setFrameKey(current => current + 1)
  }

  const handleOpenExternal = () => {
    window.open(PROMPT_REFERENCE_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0a] p-3">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="mb-3 flex h-11 shrink-0 items-center justify-between rounded-lg border border-white/8 bg-[#111]/92 px-3 shadow-lg shadow-black/20 backdrop-blur"
      >
        <div className="flex min-w-0 items-center gap-2 text-neutral-300">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[0.04] text-neutral-400">
            <BookOpen size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-100">提示词参考</div>
            <div className="truncate text-[11px] text-neutral-600">gpt-image2.canghe.ai</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReload}
            title="刷新"
            aria-label="刷新提示词参考"
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition hover:bg-white/8 hover:text-neutral-100 active:scale-95"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            title="在浏览器打开"
            aria-label="在浏览器打开提示词参考"
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition hover:bg-white/8 hover:text-neutral-100 active:scale-95"
          >
            <ExternalLink size={15} />
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/8 bg-[#050505] shadow-2xl shadow-black/25"
      >
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#080808]"
            >
              <div className="absolute left-0 right-0 top-0 h-px overflow-hidden bg-white/6">
                <motion.div
                  className="h-full w-1/3 bg-white/35"
                  animate={{ x: ['-120%', '330%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-400">
                <RefreshCw size={17} className="animate-spin" />
              </div>
              <div className="mt-3 text-sm font-medium text-neutral-300">正在打开提示词参考...</div>
              <div className="mt-1 text-xs text-neutral-600">如果页面无法显示，可以用右上角外部打开</div>
            </motion.div>
          )}
        </AnimatePresence>

        <iframe
          key={frameKey}
          src={PROMPT_REFERENCE_URL}
          title="提示词参考"
          className="h-full w-full border-0 bg-white"
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setIsLoading(false)}
        />
      </motion.div>
    </div>
  )
}
