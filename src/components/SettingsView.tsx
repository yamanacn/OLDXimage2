import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Globe2, KeyRound, MessageCircle, QrCode, Save, Settings } from 'lucide-react'
import clsx from 'clsx'
import type { ProxyConfigResponse } from '../apiTypes'
import type { AssetConfigResponse } from '../assetTypes'
import type { GenerationSettings, ImageModel, ImageQuality, OutputFormat, ResponseFormat } from '../types'
import BilibiliIcon from './BilibiliIcon'
import DarkSelect from './DarkSelect'
import { readJsonResponse } from '../apiClient'

type SettingsViewProps = {
  settings: GenerationSettings
  onSettingsChange: (settings: GenerationSettings) => void
  onConfigChange: (config: { configured: boolean; apiKeyPreview: string; apiBase: string }) => void
  config: {
    configured: boolean
    apiKeyPreview: string
    apiBase: string
  }
  initialError?: string
  highlightApiKey?: boolean
}

const QUALITY_OPTIONS: Array<{ value: ImageQuality; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const MODEL_OPTIONS: Array<{ value: ImageModel; label: string }> = [
  { value: 'gpt-image-2', label: 'gpt-image-2' },
  { value: 'gpt-image-2-all', label: 'gpt-image-2-all' },
]

const OUTPUT_FORMAT_OPTIONS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
]

const RESPONSE_FORMAT_OPTIONS: Array<{ value: ResponseFormat; label: string }> = [
  { value: 'url', label: '图片链接' },
  { value: 'b64_json', label: 'Base64 数据' },
]

const API_KEY_REGISTER_URL = 'https://ai.t8star.org/register?aff=9263aa44936'
const BILIBILI_HOME_URL = 'https://space.bilibili.com/5758057'

export default function SettingsView({
  settings,
  onSettingsChange,
  onConfigChange,
  config,
  initialError,
  highlightApiKey = false,
}: SettingsViewProps) {
  const [apiBase, setApiBase] = useState(config.apiBase || 'https://ai.t8star.cn')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [defaultOutputDir, setDefaultOutputDir] = useState('')
  const [assetStatus, setAssetStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [assetMessage, setAssetMessage] = useState('')
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const displayStatus = initialError && status === 'idle' ? 'error' : status
  const displayMessage = initialError && status === 'idle' ? initialError : message

  const updateSettings = (next: Partial<GenerationSettings>) => {
    onSettingsChange({ ...settings, ...next })
  }

  useEffect(() => {
    let isMounted = true

    fetch('/api/assets/config')
      .then(response => readJsonResponse<AssetConfigResponse>(response, '读取输出目录失败'))
      .then(payload => {
        if (!isMounted) return
        setOutputDir(payload.outputDir)
        setDefaultOutputDir(payload.defaultOutputDir)
      })
      .catch(error => {
        if (!isMounted) return
        setAssetStatus('error')
        setAssetMessage(error instanceof Error ? error.message : '读取输出目录失败')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!highlightApiKey) return

    apiKeyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusTimer = window.setTimeout(() => {
      apiKeyInputRef.current?.focus()
    }, 240)

    return () => window.clearTimeout(focusTimer)
  }, [highlightApiKey])

  const handleSaveConfig = async () => {
    setStatus('saving')
    setMessage('')

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiBase,
          apiKey: apiKeyDraft,
        }),
      })
      const payload = await readJsonResponse<ProxyConfigResponse>(response, '保存接口配置失败')

      onConfigChange({
        configured: payload.configured,
        apiKeyPreview: payload.apiKeyPreview,
        apiBase: payload.apiBase,
      })
      setApiBase(payload.apiBase)
      setApiKeyDraft('')
      setStatus('saved')
      setMessage('已保存到本地配置')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '保存失败')
    }
  }

  const handleSaveOutputDir = async (nextDir = outputDir) => {
    setAssetStatus('saving')
    setAssetMessage('')

    try {
      const response = await fetch('/api/assets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputDir: nextDir }),
      })
      const payload = await readJsonResponse<AssetConfigResponse>(response, '保存输出目录失败')
      setOutputDir(payload.outputDir)
      setDefaultOutputDir(payload.defaultOutputDir)
      setAssetStatus('saved')
      setAssetMessage('输出目录已保存，生成结果会继续按日期归档。')
    } catch (error) {
      setAssetStatus('error')
      setAssetMessage(error instanceof Error ? error.message : '保存输出目录失败')
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8 pb-32">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Settings size={16} />
            <span>设置</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">接口与生成偏好</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
            这里管理全局 API 配置和默认生成参数。右侧面板只保留创作输入，避免两个设置入口互相打架。
          </p>
        </div>

        <span className={clsx(
          "shrink-0 rounded-full border px-3 py-1.5 text-xs",
          config.configured
            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
            : "border-amber-300/20 bg-amber-300/10 text-amber-200"
        )}>
          {config.configured ? `Key ${config.apiKeyPreview}` : '未配置 Key'}
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-white/6 bg-[#121212] p-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
              <Globe2 size={16} className="text-neutral-500" />
              接口配置
            </div>
            <span className="text-xs text-neutral-600">本地代理参数</span>
          </div>

          <div className="space-y-4">
            <div>
              <DarkSelect
                label="生图模型"
                value={settings.model}
                options={MODEL_OPTIONS}
                onChange={model => updateSettings({ model })}
              />
              {settings.model === 'gpt-image-2-all' && (
                <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
                  gpt-image-2-all 仅支持 1K，右侧分辨率会同步锁定为 1K 标准。
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-neutral-500">Base URL</label>
              <input
                type="url"
                value={apiBase}
                onChange={event => setApiBase(event.target.value)}
                placeholder="https://ai.t8star.cn"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#101010] px-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-700 focus:border-white/70 focus:ring-2 focus:ring-[var(--color-focus-ring)]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
                <KeyRound size={12} />
                API Key
              </label>
              <div className={clsx('api-key-input-shell rounded-xl', highlightApiKey && 'api-key-guidance-ring')}>
                <input
                  ref={apiKeyInputRef}
                  type="password"
                  value={apiKeyDraft}
                  onChange={event => setApiKeyDraft(event.target.value)}
                  placeholder={config.configured ? '输入新 Key 后保存' : '请输入 API Key'}
                  className="relative z-10 h-11 w-full rounded-xl border border-white/10 bg-[#101010] px-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-700 focus:border-white/70 focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className={clsx(
                "text-xs",
                displayStatus === 'error' ? "text-red-300" : displayStatus === 'saved' ? "text-emerald-200" : "text-neutral-500"
              )}>
                {displayStatus === 'saving' ? '正在保存...' : displayMessage || 'Base URL 使用当前本地代理参数'}
              </p>

              <button
                type="button"
                onClick={() => void handleSaveConfig()}
                disabled={status === 'saving' || (!apiBase.trim() && !apiKeyDraft.trim())}
                className={clsx(
                  "flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition",
                  status === 'saving'
                    ? "cursor-wait border-white/5 bg-white/5 text-neutral-600"
                    : "border-white/10 bg-white/10 text-neutral-200 hover:bg-white/15"
                )}
              >
                <Save size={14} />
                保存配置
              </button>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-white/6 bg-[#121212] p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <KeyRound size={16} className="text-neutral-500" />
                API Key 获取
              </div>
              <span className="text-xs text-neutral-600">{config.configured ? '已保存' : '未配置'}</span>
            </div>

            <p className="text-sm leading-relaxed text-neutral-500">
              {config.configured
                ? `当前已保存 ${config.apiKeyPreview || 'API Key'}，也可以继续打开页面管理账号或获取新的 Key。`
                : '没有 API Key 时，先打开注册页获取，再回到这里保存到本地配置。'}
            </p>

            <a
              href={API_KEY_REGISTER_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.1] active:scale-[0.99]"
            >
              打开获取页面
              <ExternalLink size={15} />
            </a>
          </section>

          <section className="rounded-2xl border border-white/6 bg-[#121212] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">生成控制</div>
              <span className="text-xs text-neutral-600">{settings.quality === 'high' ? '高质量' : '自动质量'}</span>
            </div>

            <div className="space-y-5">
              <DarkSelect
                label="质量"
                value={settings.quality}
                options={QUALITY_OPTIONS}
                onChange={quality => updateSettings({ quality })}
              />
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/6 bg-[#121212] p-5 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-300">输出与容错</div>
            <span className="text-xs text-neutral-600">{settings.outputFormat.toUpperCase()}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DarkSelect
              label="格式"
              value={settings.outputFormat}
              options={OUTPUT_FORMAT_OPTIONS}
              onChange={outputFormat => updateSettings({ outputFormat })}
            />
            <DarkSelect
              label="返回方式"
              value={settings.responseFormat}
              options={RESPONSE_FORMAT_OPTIONS}
              onChange={responseFormat => updateSettings({ responseFormat })}
            />
          </div>

          {settings.outputFormat !== 'png' && (
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <label className="text-xs text-neutral-500">压缩质量</label>
                <span className="font-mono text-xs text-neutral-400">{settings.outputCompression}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.outputCompression}
                onChange={event => updateSettings({ outputCompression: Number(event.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-white"
              />
            </div>
          )}

          <label className="mt-5 flex items-center justify-between rounded-xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-neutral-400">
            允许跳过失败结果
            <input
              type="checkbox"
              checked={settings.skipError}
              onChange={event => updateSettings({ skipError: event.target.checked })}
              className="accent-white"
            />
          </label>

          <div className="mt-5 rounded-xl border border-white/6 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-neutral-500">
                <FolderOpen size={14} />
                资产输出目录
              </label>
              <button
                type="button"
                onClick={() => void handleSaveOutputDir(defaultOutputDir)}
                disabled={!defaultOutputDir || assetStatus === 'saving'}
                className="text-xs text-neutral-500 transition hover:text-neutral-200 disabled:opacity-40"
              >
                恢复默认
              </button>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={outputDir}
                onChange={event => setOutputDir(event.target.value)}
                placeholder={defaultOutputDir || 'output'}
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101010] px-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-700 focus:border-white/70 focus:ring-2 focus:ring-[var(--color-focus-ring)]"
              />
              <button
                type="button"
                onClick={() => void handleSaveOutputDir()}
                disabled={assetStatus === 'saving' || !outputDir.trim()}
                className={clsx(
                  "flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-medium transition",
                  assetStatus === 'saving'
                    ? "cursor-wait border-white/5 bg-white/5 text-neutral-600"
                    : "border-white/10 bg-white/10 text-neutral-200 hover:bg-white/15"
                )}
              >
                <Save size={14} />
                保存目录
              </button>
            </div>
            <p className={clsx(
              "mt-3 text-xs leading-relaxed",
              assetStatus === 'error' ? "text-red-300" : assetStatus === 'saved' ? "text-emerald-200" : "text-neutral-500"
            )}>
              {assetStatus === 'saving'
                ? '正在检查并保存目录...'
                : assetMessage || '留空使用默认图片目录；切换目录后仍按 YYYY-MM-DD 自动归档。'}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/6 bg-[#121212] p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <MessageCircle size={16} className="text-neutral-500" />
                关注与联系
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                工具更新、案例教程和使用交流都放在这里。
              </p>
            </div>
            <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1 text-xs text-neutral-500">
              OLDX IMAGE2
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <a
              href={BILIBILI_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-black/20 p-4 transition hover:border-white/18 hover:bg-white/[0.055]"
            >
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/8 bg-white/[0.045] text-neutral-300 transition group-hover:border-white/20 group-hover:bg-white group-hover:text-black">
                <BilibiliIcon className="h-7 w-7" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-white">B站主页</h3>
                  <ExternalLink size={14} className="text-neutral-600 transition group-hover:text-neutral-300" />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
                  查看更新、教程和案例演示。
                </p>
                <div className="mt-3 truncate rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-500">
                  space.bilibili.com/5758057
                </div>
              </div>
            </a>

            <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center">
              <div className="mx-auto w-[150px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white p-2 sm:mx-0">
                <img
                  src="/wechat-qr.jpg"
                  alt="微信二维码"
                  className="aspect-[3/4] w-full rounded-xl object-contain"
                  onError={event => {
                    event.currentTarget.src = '/wechat-qr-placeholder.svg'
                  }}
                />
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-neutral-300 sm:justify-start">
                  <QrCode size={16} className="text-neutral-500" />
                  微信二维码
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  扫码添加微信，反馈问题或交流本地生图工作流。
                </p>
                <div className="mt-3 inline-flex rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-500">
                  扫码添加
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
