import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'

export type SelectOption<T extends string> = {
  value: T
  label: string
}

export default function DarkSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  widthClass = 'w-full',
}: {
  label: string
  value: T
  options: Array<SelectOption<T>>
  onChange: (value: T) => void
  widthClass?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = options.find(option => option.value === value) ?? options[0]

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs text-neutral-500">{label}</label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(current => !current)}
        className={clsx(
          "group flex h-11 items-center justify-between rounded-xl border px-3 text-left text-sm transition",
          "bg-[#101010] text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          isOpen ? "border-white/70 ring-2 ring-[var(--color-focus-ring)]" : "border-white/10 hover:border-white/20 hover:bg-[#141414]",
          widthClass
        )}
      >
        <span className="font-medium tracking-wide">{selected.label}</span>
        <ChevronDown
          size={16}
          className={clsx("text-neutral-500 transition group-hover:text-neutral-300", isOpen && "rotate-180 text-neutral-100")}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              role="listbox"
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#171717]/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={clsx(
                    "flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-sm transition",
                    option.value === value
                      ? "bg-white text-black"
                      : "text-neutral-300 hover:bg-white/[0.07] hover:text-white"
                  )}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={14} className="text-black" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
