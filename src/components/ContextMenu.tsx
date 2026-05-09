import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

export type ContextMenuItem = {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

type ContextMenuProps = {
  items: ContextMenuItem[]
  children: (props: { onContextMenu: (event: React.MouseEvent) => void }) => React.ReactNode
}

const MENU_WIDTH = 220
const MENU_PADDING = 8

export default function ContextMenu({ items, children }: ContextMenuProps) {
  const [state, setState] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!state) return

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const handleScroll = () => close()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [state, close])

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const vw = window.innerWidth
    const vh = window.innerHeight
    const estimatedHeight = items.length * 38 + MENU_PADDING * 2

    const x = event.clientX + MENU_WIDTH + MENU_PADDING > vw
      ? Math.max(MENU_PADDING, event.clientX - MENU_WIDTH)
      : event.clientX
    const y = event.clientY + estimatedHeight + MENU_PADDING > vh
      ? Math.max(MENU_PADDING, vh - estimatedHeight - MENU_PADDING)
      : event.clientY

    setState({ x, y })
  }

  const menu = (
    <AnimatePresence>
      {state && (
        <>
          <div className="fixed inset-0 z-[10000]" onClick={close} onContextMenu={event => { event.preventDefault(); close() }} />
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -2 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            style={{ left: state.x, top: state.y, width: MENU_WIDTH }}
            className="fixed z-[10001] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/95 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.56),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl"
          >
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => { item.onClick(); close() }}
                className={`flex w-full items-center gap-3 px-4 py-[9px] text-[13px] transition-colors ${
                  item.danger
                    ? 'text-red-300 hover:bg-red-500/10'
                    : 'text-neutral-200 hover:bg-white/[0.06]'
                }`}
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-neutral-400">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {children({ onContextMenu: handleContextMenu })}
      {createPortal(menu, document.body)}
    </>
  )
}

export const revealFile = async (imageUrl: string) => {
  const response = await fetch('/api/reveal-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || '打开文件位置失败')
  }
}

export const copyImageToClipboard = async (imageUrl: string) => {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error('图片加载失败')
  const blob = await response.blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}
