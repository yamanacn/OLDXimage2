declare const __APP_VERSION__: string

interface ElectronAPI {
  onUpdateState?: (callback: (data: {
    type: 'available' | 'not-available' | 'error'
    version?: string
    releaseNotes?: string
    message?: string
    rawMessage?: string
  }) => void) => () => void
  checkUpdate?: () => Promise<{ type: string; message?: string }>
  getAppVersion?: () => string
}

interface Window {
  electronAPI?: ElectronAPI
}
