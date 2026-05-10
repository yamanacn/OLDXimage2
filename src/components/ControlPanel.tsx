import { useCallback, useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { Sparkles, ChevronUp, Image as ImageIcon, X, ChevronDown, Check, Monitor, LayoutTemplate, ArrowLeft, ArrowRight, Trash2, Copy, Eraser, Layers } from 'lucide-react'
import type { ReferenceImagePayload } from '../imagePayload'
import type { AspectRatio, GenerateOptions, GenerationEditDraft, GenerationRequest, GenerationSettings, Resolution } from '../types'
import PromptEditor from './PromptEditor'
import clsx from 'clsx'
import { createClientId } from '../clientIds'

const ASPECT_RATIOS = [
  { value: 'auto', label: '自动', w: 1, h: 1 },
  { value: '1:1', label: '方形', w: 1, h: 1 },
  { value: '3:4', label: '竖版', w: 3, h: 4 },
  { value: '9:16', label: '故事版', w: 9, h: 16 },
  { value: '4:3', label: '横版', w: 4, h: 3 },
  { value: '16:9', label: '宽屏', w: 16, h: 9 },
]

const RESOLUTIONS = [
  { value: '1k', label: '1K 标准' },
  { value: '2k', label: '2K 高清' },
  { value: '4k', label: '4K 超清' },
]

const THUMBNAIL_LAYOUT_TRANSITION = {
  type: 'spring' as const,
  bounce: 0,
  duration: 0.38,
  stiffness: 400,
  damping: 32,
}

const THUMBNAIL_EXIT_TRANSITION = {
  type: 'spring' as const,
  bounce: 0,
  duration: 0.22,
}

const getClipboardImageFiles = (clipboardData: DataTransfer) => {
  const itemFiles = Array.from(clipboardData.items)
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (itemFiles.length > 0) return itemFiles

  return Array.from(clipboardData.files).filter(file => file.type.startsWith('image/'))
}

export default function ControlPanel({
  onGenerate,
  settings,
  isApiConfigured,
  onOpenSettings,
  referenceImages,
  onReferenceImagesChange,
  editDraft,
}: {
  onGenerate: (params: GenerationRequest, options?: GenerateOptions) => void
  settings: GenerationSettings
  isApiConfigured: boolean
  onOpenSettings: () => void
  referenceImages: ReferenceImagePayload[]
  onReferenceImagesChange: Dispatch<SetStateAction<ReferenceImagePayload[]>>
  editDraft?: GenerationEditDraft | null
}) {
  const [prompt, setPrompt] = useState(() => editDraft?.request.prompt ?? '')
  const images = referenceImages
  const setImages = onReferenceImagesChange
  const [isRefOpen, setIsRefOpen] = useState(() => editDraft ? editDraft.request.images.length > 0 : true)
  const [previewImage, setPreviewImage] = useState<ReferenceImagePayload | null>(null)
  const [submitState, setSubmitState] = useState<'idle' | 'submitted'>('idle')
  
  // Dropdown states
  const [arMenuOpen, setArMenuOpen] = useState(false)
  const [resMenuOpen, setResMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const suppressPreviewClickRef = useRef('')

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => editDraft?.request.aspectRatio ?? '16:9')
  const [resolution, setResolution] = useState<Resolution>(() => editDraft?.request.resolution ?? '1k')
  const [concurrency, setConcurrency] = useState(() => editDraft?.batchSize ?? 1)
  const isResolutionLocked = settings.model === 'gpt-image-2-all'
  const effectiveResolution: Resolution = isResolutionLocked ? '1k' : resolution

  const readFiles = useCallback((files: File[]) => {
    const selectedFiles = files.filter(file => file.type.startsWith('image/')).slice(0, 16)
    const readImage = (file: File) => new Promise<ReferenceImagePayload>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        if (!dataUrl) reject(new Error(`无法读取图片: ${file.name}`))
        resolve({
          id: createClientId(`ref-${file.lastModified}-${file.size}`),
          name: file.name,
          type: file.type,
          dataUrl,
        })
      }
      reader.onerror = () => reject(new Error(`无法读取图片: ${file.name}`))
      reader.readAsDataURL(file)
    })

    void Promise.all(selectedFiles.map(readImage)).then(payloads => {
      setImages(prev => {
        const capacity = 16 - prev.length
        if (capacity <= 0) return prev
        return [...prev, ...payloads.slice(0, capacity)]
      })
    })
  }, [setImages])

  const handleGenerate = () => {
    if (!isApiConfigured) {
      onOpenSettings()
      return
    }
    if (!prompt.trim() && images.length === 0) return
    const request: GenerationRequest = {
      prompt,
      aspectRatio,
      resolution: effectiveResolution,
      n: settings.n,
      images,
      quality: settings.quality,
      background: 'auto',
      outputFormat: settings.outputFormat,
      outputCompression: settings.outputCompression,
      moderation: 'auto',
      responseFormat: settings.responseFormat,
      asyncMode: true,
      webhook: '',
      maxPollAttempts: 300,
      pollInterval: 5,
      maxRetries: 5,
      initialTimeout: 900,
      skipError: settings.skipError,
      model: settings.model,
    }
    const batchTimestamp = Date.now()
    const batchId = createClientId(`batch-${batchTimestamp}`)
    Array.from({ length: concurrency }).forEach((_, index) => {
      onGenerate(request, {
        timestamp: batchTimestamp,
        batchId,
        batchIndex: index,
        batchSize: concurrency,
      })
    })
    setSubmitState('submitted')
    window.setTimeout(() => setSubmitState('idle'), 1600)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    readFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    readFiles(Array.from(event.dataTransfer.files))
  }

  const handlePreviewClick = (image: ReferenceImagePayload) => {
    if (suppressPreviewClickRef.current === image.id) return
    setPreviewImage(image)
  }

  const moveImage = (id: string, direction: -1 | 1) => {
    setImages(prev => {
      const index = prev.findIndex(image => image.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev

      const next = [...prev]
      const current = next[index]
      next[index] = next[nextIndex]
      next[nextIndex] = current
      return next
    })
  }

  const currentAR = ASPECT_RATIOS.find(r => r.value === aspectRatio) || ASPECT_RATIOS[0]
  const currentRes = RESOLUTIONS.find(r => r.value === effectiveResolution) || RESOLUTIONS[0]
  const isGenerateDisabled = submitState === 'submitted' || (!prompt.trim() && images.length === 0)

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const files = getClipboardImageFiles(event.clipboardData)
      if (files.length === 0) return

      event.preventDefault()
      setIsRefOpen(true)
      readFiles(files)
    }

    window.addEventListener('paste', handleWindowPaste)
    return () => window.removeEventListener('paste', handleWindowPaste)
  }, [readFiles])

  return (
    <div
      className="flex flex-col h-full bg-[#0a0a0a] text-neutral-300 p-4 gap-4 relative"
      onDragOver={event => event.preventDefault()}
      onDrop={handleDrop}
    >
      
      {/* Box 1: 参考生图 */}
      <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden shrink-0 z-10">
        <div 
          className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/[0.02] transition"
          onClick={() => setIsRefOpen(!isRefOpen)}
        >
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-base tracking-wide">参考生图</h3>
            <span className="text-neutral-500 text-sm">(可选)</span>
          </div>
          <div className="flex items-center gap-3 text-neutral-500">
            {images.length > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setImages([])
                }}
                className="text-xs text-neutral-500 hover:text-red-400 transition"
              >
                清空
              </button>
            )}
            <span className="text-sm font-mono">{images.length}/16</span>
            <motion.div animate={{ rotate: isRefOpen ? 0 : 180 }}>
              <ChevronUp size={18} />
            </motion.div>
          </div>
        </div>

        <AnimatePresence>
          {isRefOpen && (
            <motion.div 
              initial={{ height: 0 }} 
              animate={{ height: 'auto' }} 
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 pt-0 overflow-x-auto">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  accept="image/*" 
                  onChange={handleFileUpload} 
                />
                <Reorder.Group
                  as="div"
                  axis="x"
                  values={images}
                  onReorder={setImages}
                  className="flex gap-3"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                  {images.map((img, index) => (
                    <Reorder.Item
                      as="div"
                      key={img.id}
                      value={img}
                      layout="position"
                      initial={{ opacity: 0, scale: 0.86, y: 8, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{
                        opacity: 0,
                        scale: 0.86,
                        y: -4,
                        filter: 'blur(2px)',
                        transition: THUMBNAIL_EXIT_TRANSITION,
                      }}
                      whileDrag={{
                        scale: 1.04,
                        zIndex: 30,
                        boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                      }}
                      transition={{
                        ...THUMBNAIL_LAYOUT_TRANSITION,
                        opacity: { duration: 0.16, ease: 'easeOut' },
                        filter: { duration: 0.18, ease: 'easeOut' },
                      }}
                      onDragStart={() => {
                        suppressPreviewClickRef.current = img.id
                      }}
                      onDragEnd={() => {
                        window.setTimeout(() => {
                          if (suppressPreviewClickRef.current === img.id) {
                            suppressPreviewClickRef.current = ''
                          }
                        }, 0)
                      }}
                      className="relative h-[100px] w-[100px] shrink-0 cursor-grab overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a] touch-pan-x active:cursor-grabbing group"
                    >
                      <button
                        type="button"
                        onClick={() => handlePreviewClick(img)}
                        className="block h-full w-full cursor-inherit"
                        title="拖拽排序，点击预览"
                      >
                        <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover pointer-events-none" />
                      </button>
                      <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/90 shadow-sm backdrop-blur-sm">
                        图{index + 1}
                      </span>
                      <div className="absolute left-1.5 bottom-1.5 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label="左移参考图"
                          disabled={images[0]?.id === img.id}
                          onPointerDown={event => event.stopPropagation()}
                          onClick={() => moveImage(img.id, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ArrowLeft size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label="右移参考图"
                          disabled={images[images.length - 1]?.id === img.id}
                          onPointerDown={event => event.stopPropagation()}
                          onClick={() => moveImage(img.id, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ArrowRight size={12} />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="删除参考图"
                        onPointerDown={event => event.stopPropagation()}
                        onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white opacity-0 backdrop-blur-sm transition hover:bg-red-500/90 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Reorder.Item>
                  ))}
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= 16}
                    layout="position"
                    transition={THUMBNAIL_LAYOUT_TRANSITION}
                    className="flex h-[100px] w-[100px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/5 bg-[#1a1a1a] transition hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-40"
                    title="点击上传图片"
                  >
                    <ImageIcon size={24} className="text-neutral-500" />
                  </motion.button>
                </Reorder.Group>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="relative max-w-5xl max-h-full"
              onClick={event => event.stopPropagation()}
            >
              <img src={previewImage.dataUrl} alt={previewImage.name} className="max-h-[82vh] max-w-full rounded-2xl object-contain border border-white/10" />
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 border border-white/10 text-white hover:bg-white/15 transition flex items-center justify-center"
                aria-label="关闭预览"
              >
                <X size={18} />
              </button>
              <div className="mt-3 text-sm text-neutral-300 truncate max-w-[80vw]">{previewImage.name}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Box 2: 提示词输入 + 内置选项栏 */}
      <div className="bg-[#121212] border border-white/5 rounded-2xl flex-1 flex flex-col relative focus-within:border-white/20 transition-colors z-10 overflow-visible">
        <div className="p-4 flex-1 flex flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold tracking-wide text-white">提示词</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(prompt)}
                disabled={!prompt.trim()}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition disabled:opacity-30"
                title="复制提示词"
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                onClick={() => setPrompt('')}
                disabled={!prompt}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition disabled:opacity-30"
                title="清空提示词"
              >
                <Eraser size={15} />
              </button>
            </div>
          </div>
          <PromptEditor
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            canSubmit={!isGenerateDisabled}
            images={images}
            onImagePaste={readFiles}
            placeholder="请直接描述你想生成的图片内容..."
          />
        </div>

        {/* 底部内置工具栏：比例、清晰度、并发 */}
        <div className="p-3 border-t border-white/5 flex flex-wrap items-center gap-2">
          {/* 比例下拉组件 */}
          <div className="relative">
            <button 
              onClick={() => {
                setArMenuOpen(!arMenuOpen)
                setResMenuOpen(false)
              }}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition text-xs font-medium",
                arMenuOpen ? "bg-[#1a1a1a] border-white/20 text-white" : "bg-transparent border-white/5 hover:bg-white/5 text-neutral-400 hover:text-white"
              )}
            >
              <LayoutTemplate size={14} className="text-neutral-500" />
              <span>{currentAR.label}</span>
              {currentAR.value !== 'auto' && (
                <span className="font-mono text-[11px] text-neutral-500">{currentAR.value}</span>
              )}
              <ChevronDown size={14} className="text-neutral-500 ml-1" />
            </button>

            <AnimatePresence>
              {arMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setArMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute left-0 bottom-full mb-2 w-44 bg-[#1a1a1a] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-30 backdrop-blur-xl"
                  >
                    <div className="px-3 py-2 text-[11px] text-neutral-500 font-medium mb-1">选择图片宽高比</div>
                    {ASPECT_RATIOS.map(item => (
                      <div 
                        key={item.value}
                        onClick={() => { setAspectRatio(item.value as AspectRatio); setArMenuOpen(false); }}
                        className={clsx(
                          "flex items-center gap-3 p-2 rounded-xl cursor-pointer text-sm transition",
                          aspectRatio === item.value ? "bg-white/10 text-white" : "hover:bg-white/5 text-neutral-300"
                        )}
                      >
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">
                           {item.value === 'auto' ? (
                             <Sparkles size={14} className="text-neutral-400" />
                           ) : (
                             <div 
                               className={clsx("border-[1.5px] rounded-[2px]", aspectRatio === item.value ? "border-white" : "border-neutral-500")} 
                               style={{ 
                                 aspectRatio: `${item.w}/${item.h}`, 
                                 width: item.w > item.h ? '100%' : 'auto', 
                                 height: item.h >= item.w ? '100%' : 'auto' 
                               }} 
                             />
                           )}
                        </div>
                        <span className="flex-1 flex items-baseline gap-1.5">
                          {item.label} 
                          {item.value !== 'auto' && <span className="text-[10px] text-neutral-500 font-mono">{item.value}</span>}
                        </span>
                        {aspectRatio === item.value && <Check size={14} className="text-white shrink-0" />}
                      </div>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* 清晰度下拉组件 */}
          <div className="relative">
            <button 
              onClick={() => {
                if (isResolutionLocked) return
                setResMenuOpen(!resMenuOpen)
                setArMenuOpen(false)
              }}
              disabled={isResolutionLocked}
              title={isResolutionLocked ? 'gpt-image-2-all 仅支持 1K' : '选择清晰度'}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition text-xs font-medium",
                isResolutionLocked
                  ? "bg-white/[0.04] border-white/10 text-neutral-500 cursor-not-allowed"
                  : resMenuOpen
                    ? "bg-[#1a1a1a] border-white/20 text-white"
                    : "bg-transparent border-white/5 hover:bg-white/5 text-neutral-400 hover:text-white"
              )}
            >
              <Monitor size={14} className="text-neutral-500" />
              {currentRes.label}
              {isResolutionLocked && <span className="text-[11px] text-neutral-600">锁定</span>}
              <ChevronDown size={14} className="text-neutral-500 ml-1" />
            </button>

            <AnimatePresence>
              {resMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setResMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute left-0 bottom-full mb-2 w-36 bg-[#1a1a1a] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-30 backdrop-blur-xl"
                  >
                    <div className="px-3 py-2 text-[11px] text-neutral-500 font-medium mb-1">选择清晰度</div>
                    {RESOLUTIONS.map(item => (
                      <div 
                        key={item.value}
                        onClick={() => { setResolution(item.value as Resolution); setResMenuOpen(false); }}
                        className={clsx(
                          "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer text-sm transition",
                          resolution === item.value ? "bg-white/10 text-white" : "hover:bg-white/5 text-neutral-300"
                        )}
                      >
                        <span className="flex-1">{item.label}</span>
                        {resolution === item.value && <Check size={14} className="text-white shrink-0" />}
                      </div>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="basis-full rounded-xl border border-white/6 bg-black/15 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-neutral-500">
                <Layers size={14} />
                <span>并发</span>
                <span className="font-mono text-neutral-300">{concurrency}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={concurrency}
                onChange={event => setConcurrency(Number(event.target.value))}
                aria-label="设置并发生成数量"
                title="设置并发生成数量"
                className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-white"
              />
              <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-neutral-600">
                <span>1</span>
                <span>/</span>
                <span>8</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 底部操作区：生成按钮 */}
      <div className="shrink-0 flex items-center pt-2 z-10">
        <button 
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
          className="group flex-1 h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold flex items-center justify-center gap-2 transition hover:bg-[var(--color-primary-hover)] active:scale-[0.985] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-primary)]"
        >
          {submitState === 'submitted' ? (
            <>
              <Check size={18} />
              {concurrency > 1 ? `已排队 ${concurrency} 个` : '已提交'}
            </>
          ) : (
            <>
              <span className="grid place-items-center transition duration-300 ease-out group-hover:scale-110 group-hover:rotate-12 group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.55)] group-active:scale-95">
                <Sparkles size={18} />
              </span>
              生成
            </>
          )}
        </button>
      </div>

    </div>
  )
}
