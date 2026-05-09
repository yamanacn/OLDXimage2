import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  BookOpen,
  Brush,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Settings,
} from 'lucide-react'
import UpdateChecker from './UpdateChecker'
import clsx from 'clsx'

export type WorkspaceView = 'create' | 'library' | 'promptReference' | 'tasks' | 'settings'

type SidebarProps = {
  activeView: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  counts: {
    library: number
    activeTasks: number
  }
  apiKeyPreview: string
  isApiConfigured: boolean
  onRequestApiKey: () => void
}

const NAV_SECTIONS: Array<{
  title: string
  items: Array<{
    id: WorkspaceView
    label: string
    description: string
    icon: typeof Brush
    count?: keyof SidebarProps['counts']
  }>
}> = [
  {
    title: 'WORKSPACE',
    items: [
      {
        id: 'create',
        label: '生成流',
        description: '实时创作',
        icon: Brush,
      },
      {
        id: 'library',
        label: '资产库',
        description: '按天归档',
        icon: Archive,
      },
      {
        id: 'promptReference',
        label: '提示词参考',
        description: '灵感图库',
        icon: BookOpen,
      },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      {
        id: 'settings',
        label: '设置',
        description: '接口与偏好',
        icon: Settings,
      },
    ],
  },
]

export default function Sidebar({
  activeView,
  onViewChange,
  collapsed,
  onCollapsedChange,
  counts,
  apiKeyPreview,
  isApiConfigured,
  onRequestApiKey,
}: SidebarProps) {
  const apiKeyDisplay = isApiConfigured ? apiKeyPreview || '已配置' : ''

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 76 : 236 }}
      transition={{ type: 'spring', stiffness: 360, damping: 34 }}
      className="hidden h-full shrink-0 border-r border-white/5 bg-[#080808] text-neutral-300 shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] min-[860px]:flex"
    >
      <div className="flex min-w-0 flex-1 flex-col px-3 py-4">
        <div className="mb-5 flex h-10 items-center justify-between">
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="min-w-0"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                  Studio
                </div>
                <div className="mt-1 truncate text-xs text-neutral-600">Local image workspace</div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            className={clsx(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/5 text-neutral-500 transition",
              "hover:border-white/12 hover:bg-white/[0.06] hover:text-neutral-100 active:scale-95",
              collapsed && "mx-auto"
            )}
          >
            <motion.span
              animate={{ x: collapsed ? 1 : 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </motion.span>
          </button>
        </div>

        <nav className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-7 overflow-hidden">
            {NAV_SECTIONS.map(section => (
              <div key={section.title} className="space-y-2">
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16 }}
                      className="px-3 text-[11px] font-semibold tracking-[0.16em] text-neutral-600"
                    >
                      {section.title}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1">
                  {section.items.map(item => {
                    const Icon = item.icon
                    const active = activeView === item.id
                    const count = item.count ? counts[item.count] : 0

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onViewChange(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={clsx(
                          "group relative flex h-12 w-full items-center rounded-2xl text-left transition",
                          collapsed ? "justify-center px-0" : "px-3",
                          active
                            ? "text-black"
                            : "text-neutral-400 hover:bg-white/[0.045] hover:text-neutral-100"
                        )}
                      >
                        {active && (
                          <motion.div
                            layoutId="sidebar-active-pill"
                            className="absolute inset-0 rounded-2xl border border-white/80 bg-[#ededed] shadow-[0_16px_36px_rgba(255,255,255,0.08)]"
                            transition={{ type: 'spring', stiffness: 430, damping: 34 }}
                          />
                        )}

                        <motion.span
                          className="relative z-10 grid h-8 w-8 shrink-0 place-items-center"
                          animate={active ? {
                            scale: [0.92, 1.16, 1],
                            rotate: [0, -8, 5, 0],
                          } : {
                            scale: 1,
                            rotate: 0,
                          }}
                          transition={{ duration: 0.42, ease: 'easeOut' }}
                        >
                          <motion.span
                            key={active ? `active-${item.id}` : `idle-${item.id}`}
                            className="grid place-items-center"
                            initial={active ? { opacity: 0.78, y: 2 } : false}
                            animate={active ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                          >
                            <Icon size={21} strokeWidth={active ? 2 : 1.75} />
                          </motion.span>
                        </motion.span>

                        <AnimatePresence initial={false}>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0, x: -5 }}
                              animate={{ opacity: 1, width: 'auto', x: 0 }}
                              exit={{ opacity: 0, width: 0, x: -5 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              className="relative z-10 ml-3 flex min-w-0 flex-1 items-center justify-between overflow-hidden"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{item.label}</span>
                                <span className="mt-0.5 block truncate text-[11px] text-neutral-600 group-hover:text-neutral-500">
                                  {item.description}
                                </span>
                              </span>

                              {count > 0 && (
                                <span
                                  className={clsx(
                                    "ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    active ? "bg-black/10 text-black" : "bg-white/6 text-neutral-500"
                                  )}
                                >
                                  {count}
                                </span>
                              )}
                            </motion.span>
                          )}
                        </AnimatePresence>

                        {collapsed && count > 0 && (
                          <span className="absolute right-2 top-2 z-10 h-2 w-2 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.45)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={clsx("mt-4 shrink-0", collapsed ? "px-0" : "px-1")}>
            {isApiConfigured ? (
              <a
                href="https://ai.t8star.org/register?aff=9263aa44936"
                target="_blank"
                rel="noreferrer"
                className={clsx(
                  "block rounded-2xl border border-transparent bg-transparent text-neutral-600 transition hover:bg-white/[0.025] hover:text-neutral-400",
                  collapsed ? "grid h-11 place-items-center" : "px-3 py-2.5"
                )}
                title={apiKeyDisplay || 'API Key 已保存'}
              >
                {collapsed ? (
                  <KeyRound size={17} strokeWidth={1.7} />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[0.04] bg-white/[0.015] text-neutral-600">
                      <KeyRound size={15} strokeWidth={1.7} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-neutral-700">API Key 已保存</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                        {apiKeyDisplay}
                      </div>
                    </div>
                  </div>
                )}
              </a>
            ) : (
              <button
                type="button"
                onClick={onRequestApiKey}
                title="获取 API Key"
                className={clsx(
                  "w-full text-left",
                  "group relative isolate overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/20 hover:bg-white/[0.07]",
                  collapsed ? "grid h-12 place-items-center" : "flex items-center gap-3 p-3"
                )}
              >
                <motion.span
                  className="absolute inset-y-0 -left-1/2 z-0 w-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent"
                  animate={{ x: ['0%', '320%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.2 }}
                />
                <span className={clsx("relative z-10 grid shrink-0 place-items-center rounded-xl border border-white/8 bg-black/20", collapsed ? "h-9 w-9" : "h-9 w-9")}>
                  <KeyRound size={16} strokeWidth={1.8} />
                </span>
                {!collapsed && (
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-100">获取 API Key</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500 group-hover:text-neutral-400">
                      打开注册页
                      <ExternalLink size={11} />
                    </span>
                  </span>
                )}
              </button>
            )}
          </div>

          <div className={clsx("shrink-0 border-t border-white/5 pt-3", collapsed ? "flex justify-center px-0" : "px-3")}>
            <div className={clsx("flex items-center gap-1", collapsed ? "flex-col" : "justify-between")}>
              {collapsed ? (
                <UpdateChecker />
              ) : (
                <>
                  <span className="text-[10px] font-mono text-neutral-700">v{__APP_VERSION__}</span>
                  <div className="relative">
                    <UpdateChecker />
                  </div>
                </>
              )}
            </div>
          </div>
        </nav>
      </div>
    </motion.aside>
  )
}
