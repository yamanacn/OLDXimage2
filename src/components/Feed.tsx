import { useMemo } from 'react'
import type { GenerateOptions, GenerationRequest, Task } from '../types'
import TaskCard from './TaskCard'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, KeyRound, Wand2 } from 'lucide-react'

type ReferenceAsset = {
  id: string
  filename: string
  imageUrl: string
}

type TaskBatch = {
  id: string
  timestamp: number
  tasks: Task[]
}

const groupTasksByBatch = (tasks: Task[]): TaskBatch[] => {
  const groups = new Map<string, Task[]>()

  for (const task of tasks) {
    const key = task.batchId || task.id
    const group = groups.get(key)
    if (group) group.push(task)
    else groups.set(key, [task])
  }

  return Array.from(groups.entries())
    .map(([id, groupTasks]) => {
      const orderedTasks = [...groupTasks].sort((a, b) => {
        const aIndex = a.batchIndex ?? 0
        const bIndex = b.batchIndex ?? 0
        return aIndex - bIndex || a.timestamp - b.timestamp
      })

      return {
        id,
        timestamp: Math.max(...orderedTasks.map(task => task.timestamp)),
        tasks: orderedTasks,
      }
    })
    .sort((a, b) => b.timestamp - a.timestamp)
}

export default function Feed({
  tasks,
  onRegenerate,
  onEditTask,
  onUseAsReference,
  isApiConfigured,
  onRequestApiKey,
}: {
  tasks: Task[]
  onRegenerate: (params: Partial<GenerationRequest>, options?: GenerateOptions) => void | Promise<void>
  onEditTask: (task: Task, batchSize?: number) => void
  onUseAsReference?: (asset: ReferenceAsset) => void
  isApiConfigured: boolean
  onRequestApiKey: () => void
}) {
  const batches = useMemo(() => groupTasksByBatch(tasks), [tasks])

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-[var(--color-dark-card)] border border-[var(--color-dark-border)] flex items-center justify-center">
          <Wand2 size={26} strokeWidth={1.7} className="text-neutral-400" />
        </div>
        <p>暂无生成任务，在右侧输入提示词开始创作</p>
        {!isApiConfigured && (
          <button
            type="button"
            onClick={onRequestApiKey}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white px-4 text-sm font-semibold text-black shadow-[0_12px_34px_rgba(255,255,255,0.08)] transition hover:bg-neutral-200 active:scale-[0.99]"
          >
            <KeyRound size={15} />
            获取APIKEY
            <ExternalLink size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10 pb-32">
      <AnimatePresence>
        {batches.map(batch => (
          <motion.div
            key={batch.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <TaskCard
              tasks={batch.tasks}
              onRegenerate={onRegenerate}
              onEditTask={onEditTask}
              onUseAsReference={onUseAsReference}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
