import { AnimatePresence, motion } from 'framer-motion'
import { Image as ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReferenceImagePayload } from '../imagePayload'

type PromptEditorProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  canSubmit?: boolean
  images: ReferenceImagePayload[]
  placeholder?: string
}

const CHIP_CLASS =
  'mx-0.5 inline-flex h-5 max-w-[120px] align-[-3px] select-none items-center gap-1 overflow-hidden rounded-md border border-cyan-300/20 bg-cyan-300/10 px-1 pr-1.5 text-xs font-medium leading-none text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const imageLabel = (imageId: string, images: ReferenceImagePayload[]) => {
  const index = images.findIndex(image => image.id === imageId)
  return index >= 0 ? `图${index + 1}` : '已移除'
}

const serializedImageLabel = (imageId: string, images: ReferenceImagePayload[]) => {
  const index = images.findIndex(image => image.id === imageId)
  return index >= 0 ? `第${index + 1}张图` : '已移除参考图'
}

const isBlockElement = (tagName: string) => ['DIV', 'P'].includes(tagName)
const IMAGE_TOKEN_PATTERN = /第(\d+)张图/g

const writeValueToEditor = (root: HTMLDivElement, text: string, images: ReferenceImagePayload[], createChip: (image: ReferenceImagePayload) => HTMLElement) => {
  root.innerHTML = ''

  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (index > 0) root.append(document.createElement('br'))
    if (!line) return

    let cursor = 0
    for (const match of line.matchAll(IMAGE_TOKEN_PATTERN)) {
      const matchIndex = match.index ?? 0
      const imageIndex = Number(match[1]) - 1
      const image = images[imageIndex]

      if (matchIndex > cursor) root.append(document.createTextNode(line.slice(cursor, matchIndex)))
      if (image) {
        root.append(createChip(image), document.createTextNode(' '))
      } else {
        root.append(document.createTextNode(match[0]))
      }
      cursor = matchIndex + match[0].length
    }

    if (cursor < line.length) root.append(document.createTextNode(line.slice(cursor)))
  })
}

export default function PromptEditor({
  value,
  onChange,
  onSubmit,
  canSubmit = true,
  images,
  placeholder = '请直接描述你想生成的图片内容...',
}: PromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState({ top: 36, left: 0 })
  const [preview, setPreview] = useState<{ imageId: string; top: number; left: number } | null>(null)
  const isEmpty = value.trim().length === 0

  const imagesById = useMemo(() => new Map(images.map(image => [image.id, image])), [images])
  const previewImage = preview ? imagesById.get(preview.imageId) : undefined

  const serializeEditor = useCallback(() => {
    const root = editorRef.current
    if (!root) return ''

    const serializeNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const element = node as HTMLElement
      const imageId = element.dataset.refId
      if (element.dataset.refChip === 'true' && imageId) return serializedImageLabel(imageId, images)
      if (element.tagName === 'BR') return '\n'

      const childrenText = Array.from(element.childNodes).map(serializeNode).join('')
      return isBlockElement(element.tagName) ? `${childrenText}\n` : childrenText
    }

    return Array.from(root.childNodes)
      .map(serializeNode)
      .join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
  }, [images])

  const syncEditorValue = useCallback(() => {
    const nextValue = serializeEditor()
    onChange(nextValue)
  }, [onChange, serializeEditor])

  const createChip = useCallback((image: ReferenceImagePayload) => {
    const chip = document.createElement('span')
    chip.className = CHIP_CLASS
    chip.dataset.refChip = 'true'
    chip.dataset.refId = image.id
    chip.contentEditable = 'false'

    const thumbnail = document.createElement('img')
    thumbnail.src = image.dataUrl
    thumbnail.alt = imageLabel(image.id, images)
    thumbnail.className = 'h-4 w-4 shrink-0 rounded-[3px] object-cover'

    const label = document.createElement('span')
    label.dataset.refLabel = 'true'
    label.className = 'truncate'
    label.textContent = imageLabel(image.id, images)

    chip.append(thumbnail, label)
    return chip
  }, [images])

  const placeCaretAfter = (node: Node) => {
    const selection = window.getSelection()
    if (!selection) return

    const nextRange = document.createRange()
    nextRange.setStartAfter(node)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)
    savedRangeRef.current = nextRange.cloneRange()
  }

  const insertReference = (image: ReferenceImagePayload) => {
    const root = editorRef.current
    if (!root) return

    root.focus()
    const selection = window.getSelection()
    let range = savedRangeRef.current?.cloneRange()

    if (!range || !root.contains(range.commonAncestorContainer)) {
      range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
    }

    range.deleteContents()
    const chip = createChip(image)
    range.insertNode(chip)

    const spacer = document.createTextNode(' ')
    const spacerRange = document.createRange()
    spacerRange.setStartAfter(chip)
    spacerRange.collapse(true)
    spacerRange.insertNode(spacer)

    selection?.removeAllRanges()
    placeCaretAfter(spacer)
    setMentionOpen(false)
    setPreview(null)
    syncEditorValue()
  }

  const positionFloatingPanel = () => {
    const root = editorRef.current
    const shell = shellRef.current
    const selection = window.getSelection()
    if (!root || !shell || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0).cloneRange()
    savedRangeRef.current = range.cloneRange()

    const shellRect = shell.getBoundingClientRect()
    const rect = range.getBoundingClientRect()
    const fallbackTop = root.offsetTop + 34
    const fallbackLeft = root.offsetLeft + 2
    const top = rect.height ? rect.bottom - shellRect.top + 8 : fallbackTop
    const left = rect.width || rect.height ? rect.left - shellRect.left : fallbackLeft

    setMenuPosition({
      top: clamp(top, 12, Math.max(12, shellRect.height - 28)),
      left: clamp(left, 0, Math.max(0, shellRect.width - 288)),
    })
  }

  const openMentionMenu = () => {
    setActiveIndex(0)
    setPreview(null)
    positionFloatingPanel()
    setMentionOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey && event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSubmit) onSubmit?.()
      return
    }

    if (mentionOpen) {
      if (event.key === 'Backspace') {
        event.preventDefault()
        setMentionOpen(false)
        setPreview(null)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(index => clamp(index + 1, 0, Math.max(images.length - 1, 0)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(index => clamp(index - 1, 0, Math.max(images.length - 1, 0)))
        return
      }
      if (event.key === 'Enter' && images[activeIndex]) {
        event.preventDefault()
        insertReference(images[activeIndex])
        return
      }
    }

    if (event.key === '@') {
      event.preventDefault()
      openMentionMenu()
    }
  }

  const insertPlainText = (text: string) => {
    const root = editorRef.current
    if (!root) return
    root.focus()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    placeCaretAfter(textNode)
    syncEditorValue()
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    event.preventDefault()
    insertPlainText(text)
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-ref-chip="true"]')
    if (!chip || !shellRef.current) {
      setPreview(null)
      return
    }

    const imageId = chip.dataset.refId
    if (!imageId || !imagesById.has(imageId)) return

    const chipRect = chip.getBoundingClientRect()
    const shellRect = shellRef.current.getBoundingClientRect()
    setMentionOpen(false)
    setPreview({
      imageId,
      top: chipRect.bottom - shellRect.top + 8,
      left: clamp(chipRect.left - shellRect.left, 0, Math.max(0, shellRect.width - 236)),
    })
  }

  useEffect(() => {
    const root = editorRef.current
    if (!root) return

  const currentValue = serializeEditor()
    if (value === currentValue) return

    if (value === '') {
      root.innerHTML = ''
    } else {
      writeValueToEditor(root, value, images, createChip)
    }

  }, [createChip, images, serializeEditor, value])

  useEffect(() => {
    const root = editorRef.current
    if (!root) return

    root.querySelectorAll<HTMLElement>('[data-ref-chip="true"]').forEach(chip => {
      const imageId = chip.dataset.refId
      if (!imageId) return
      const image = imagesById.get(imageId)
      const label = chip.querySelector<HTMLElement>('[data-ref-label="true"]')
      const thumbnail = chip.querySelector<HTMLImageElement>('img')

      if (label) label.textContent = imageLabel(imageId, images)
      if (thumbnail && image) {
        thumbnail.src = image.dataUrl
        thumbnail.alt = imageLabel(imageId, images)
      }
      chip.classList.toggle('opacity-50', !image)
    })

    const nextValue = serializeEditor()
    if (nextValue !== value) onChange(nextValue)
  }, [images, imagesById, onChange, serializeEditor, value])

  useEffect(() => {
    if (!mentionOpen && !preview) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (shellRef.current?.contains(target)) return
      setMentionOpen(false)
      setPreview(null)
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [mentionOpen, preview])

  return (
    <div ref={shellRef} className="relative min-h-0 flex-1">
      {isEmpty && (
        <div className="pointer-events-none absolute left-0 top-0 text-sm leading-relaxed text-neutral-600">
          {placeholder}
        </div>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={syncEditorValue}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
        className="h-full min-h-[220px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-sm leading-relaxed text-neutral-300 outline-none empty:before:content-['']"
      />

      <AnimatePresence>
        {mentionOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute z-40 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]/98 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-neutral-500">
              <span className="grid h-6 w-6 place-items-center rounded-lg border border-white/8 bg-white/[0.04] text-neutral-300">
                @
              </span>
              可引用的参考图
            </div>

            {images.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl px-2.5 py-3 text-sm text-neutral-500">
                <ImageIcon size={16} />
                先添加参考图后再引用
              </div>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={image.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onPointerDown={event => event.preventDefault()}
                    onClick={() => insertReference(image)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                      activeIndex === index
                        ? 'bg-white/[0.08] text-white'
                        : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <img src={image.dataUrl} alt={`图${index + 1}`} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">图{index + 1}</span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-600">{image.name}</span>
                    </span>
                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                      插入
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {preview && previewImage && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute z-50 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#181818] p-2 shadow-2xl shadow-black/45"
            style={{ top: preview.top, left: preview.left }}
          >
            <img src={previewImage.dataUrl} alt={imageLabel(previewImage.id, images)} className="max-h-48 w-full rounded-xl object-contain bg-black/30" />
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-200">{imageLabel(previewImage.id, images)}</div>
                <div className="mt-0.5 truncate text-[11px] text-neutral-600">{previewImage.name}</div>
              </div>
              <span className="shrink-0 rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-neutral-500">
                预览
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
