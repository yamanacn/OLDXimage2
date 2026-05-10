const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateState: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.removeAllListeners('update-state')
    ipcRenderer.on('update-state', handler)
    return () => ipcRenderer.removeListener('update-state', handler)
  },
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  getAppVersion: () => ipcRenderer.sendSync('get-app-version') || '0.0.0',
})
