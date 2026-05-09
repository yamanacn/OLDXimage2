import { Plus } from 'lucide-react'
import clsx from 'clsx'
import type { MouseEvent } from 'react'

export default function AddToReferenceButton({
  onClick,
  className,
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
}) {
  return (
    <button
      type="button"
      title="添加到参考"
      aria-label="添加到参考"
      onClick={onClick}
      className={clsx(
        'group/add-ref flex h-8 w-8 items-center justify-end gap-0 overflow-hidden rounded-full border border-white/10 bg-black/55 px-2 text-neutral-100 opacity-0 shadow-lg shadow-black/30 backdrop-blur transition-all duration-300 ease-out hover:w-[104px] hover:gap-1.5 hover:border-white/18 hover:bg-white hover:px-3 hover:text-black group-hover:opacity-100 focus-visible:w-[104px] focus-visible:gap-1.5 focus-visible:px-3 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        className
      )}
    >
      <span className="max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-[11px] font-medium opacity-0 transition-all duration-300 group-hover/add-ref:max-w-[72px] group-hover/add-ref:translate-x-0 group-hover/add-ref:opacity-100 group-focus-visible/add-ref:max-w-[72px] group-focus-visible/add-ref:translate-x-0 group-focus-visible/add-ref:opacity-100">
        添加到参考
      </span>
      <Plus size={15} strokeWidth={1.9} className="shrink-0" />
    </button>
  )
}
