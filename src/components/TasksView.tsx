import type { GenerationRequest, Task } from '../types'
import { AlertCircle, CheckCircle2, CircleDashed, Loader2, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

type TasksViewProps = {
  tasks: Task[]
  onRegenerate: (params: Partial<GenerationRequest>) => void
}

const STATUS_COPY = {
  loading: '生成中',
  success: '已完成',
  error: '失败',
  interrupted: '已中断',
} as const

export default function TasksView({ tasks, onRegenerate }: TasksViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center text-neutral-500">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/6 bg-[var(--color-dark-card)]">
          <CircleDashed size={24} strokeWidth={1.75} />
        </div>
        <h2 className="text-sm font-semibold text-neutral-300">暂无任务记录</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed">生成、失败和完成的任务会汇总在这里，方便快速回看状态。</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-8 pb-32">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <CircleDashed size={16} />
          <span>任务</span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">生成任务记录</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/6 bg-[#121212]">
        {tasks.map((task, index) => {
          const isLoading = task.status === 'loading'
          const isSuccess = task.status === 'success'
          const isInterrupted = task.status === 'interrupted'
          const icon = isLoading
            ? <Loader2 size={16} className="animate-spin text-neutral-200" />
            : isSuccess
              ? <CheckCircle2 size={16} className="text-green-500" />
              : isInterrupted
                ? <CircleDashed size={16} className="text-amber-300" />
                : <AlertCircle size={16} className="text-red-400" />

          return (
            <div
              key={task.id}
              className={clsx(
                "grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4 transition hover:bg-white/[0.035]",
                index !== tasks.length - 1 && "border-b border-white/5"
              )}
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/6 bg-black/20">
                {icon}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200">{STATUS_COPY[task.status]}</span>
                  <span className="text-xs text-neutral-600">{task.params.aspectRatio}</span>
                  <span className="text-xs text-neutral-600">{task.params.resolution}</span>
                </div>
                <p className="mt-1 truncate text-sm text-neutral-500">
                  {task.errorMsg || task.params.prompt || '未提供提示词'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-600">
                  {new Date(task.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  type="button"
                  onClick={() => onRegenerate(task.params)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/6 hover:text-neutral-100"
                  aria-label="同参数再生成"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
