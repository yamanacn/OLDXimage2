import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'

type AppLayoutProps = {
  children: ReactNode
}

const easeOut = [0.16, 1, 0.3, 1] as const

// 检测是否是移动端
const isMobile = () => window.innerWidth < 860

export default function AppLayout({ children }: AppLayoutProps) {
  const [isFirstLaunch, setIsFirstLaunch] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 检查是否首次启动
    const hasLaunchedBefore = localStorage.getItem('app-has-launched-before')
    const first = !hasLaunchedBefore
    setIsFirstLaunch(first)

    // 标记为已启动
    if (first) {
      localStorage.setItem('app-has-launched-before', 'true')
    }

    setReady(true)
  }, [])

  if (!ready) return null

  // 非首次启动或动效完成后，直接渲染子组件
  if (!isFirstLaunch) {
    return <>{children}</>
  }

  // 首次启动，包裹动效
  return <FirstLaunchAnimation>{children}</FirstLaunchAnimation>
}

function FirstLaunchAnimation({ children }: AppLayoutProps) {
  const mobile = isMobile()

  // 提取子组件的各个部分（通过 data-* 属性识别）
  const childrenArray = Array.isArray(children) ? children : [children]
  const header = childrenArray.find(c => (c as any)?.props?.['data-layout'] === 'header')
  const sidebar = childrenArray.find(c => (c as any)?.props?.['data-layout'] === 'sidebar')
  const workspace = childrenArray.find(c => (c as any)?.props?.['data-layout'] === 'workspace')
  const panel = childrenArray.find(c => (c as any)?.props?.['data-layout'] === 'panel')
  const others = childrenArray.filter(c =>
    !['header', 'sidebar', 'workspace', 'panel'].includes((c as any)?.props?.['data-layout'])
  )

  return (
    <>
      {/* Header - 从上方滑入 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut }}
      >
        {header}
      </motion.div>

      {/* Sidebar - 从左滑入（桌面端） */}
      {!mobile && (
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: easeOut }}
        >
          {sidebar}
        </motion.div>
      )}

      {/* 主工作区 - 从下方上浮 */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: easeOut }}
      >
        {workspace}
      </motion.div>

      {/* ControlPanel - 从右滑入（桌面端） */}
      {!mobile && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: easeOut }}
        >
          {panel}
        </motion.div>
      )}

      {/* 其他元素（弹窗等）正常渲染 */}
      {others}
    </>
  )
}
