declare const __APP_VERSION__: string

interface ElectronAPI {
  onUpdateState?: (callback: (data: {
    type: 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
    version?: string
    releaseNotes?: string
    percent?: number
    speed?: number
    message?: string
    rawMessage?: string
    releaseUrl?: string
  }) => void) => () => void
  checkUpdate?: () => Promise<{ type: string; message?: string }>
  downloadUpdate?: () => Promise<void>
  installUpdate?: () => void
  getAppVersion?: () => string
}

interface Window {
  electronAPI?: ElectronAPI
}
