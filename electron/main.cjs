const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let serverHandle
let mainWindow

const isDev = !app.isPackaged
const APP_NAME = 'OLDXImage2'

app.setName(APP_NAME)

if (process.platform === 'darwin') {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `关于 ${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
} else {
  Menu.setApplicationMenu(null)
}

// Auto-updater setup (production only)
let autoUpdater = null
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://ghfast.top/https://github.com/yamanacn/OLDXimage2/releases/latest/download',
    })

    autoUpdater.on('update-available', (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', {
          type: 'available',
          version: info.version,
          releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
        })
      }
    })

    autoUpdater.on('update-not-available', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', { type: 'not-available' })
      }
    })

    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', {
          type: 'progress',
          percent: Math.round(progress.percent),
          speed: Math.round(progress.bytesPerSecond / 1024),
        })
      }
    })

    autoUpdater.on('update-downloaded', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', { type: 'downloaded' })
      }
    })

    autoUpdater.on('error', (error) => {
      console.error('[updater]', error.message)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', { type: 'error', message: error.message })
      }
    })
  } catch (error) {
    console.error('[updater] Failed to initialize', error.message)
  }
}

// IPC handlers
ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion()
})

ipcMain.handle('update:check', async () => {
  if (!autoUpdater) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-state', { type: 'error', message: '当前为开发模式，不支持自动更新' })
    }
    return { type: 'error', message: 'Updater not available' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { type: 'checking' }
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-state', { type: 'error', message: error.message })
    }
    return { type: 'error', message: error.message }
  }
})

ipcMain.handle('update:download', async () => {
  if (!autoUpdater) return
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-state', { type: 'error', message: error.message })
    }
  }
})

ipcMain.handle('update:install', () => {
  if (autoUpdater) autoUpdater.quitAndInstall(false, true)
})

const resolveServerEntry = () => {
  if (isDev) return path.join(__dirname, '..', 'build-server', 'electronRuntime.js')
  return path.join(process.resourcesPath, 'build-server', 'electronRuntime.js')
}

const resolveStaticDir = () => {
  if (isDev) return path.join(__dirname, '..', 'dist')
  return path.join(process.resourcesPath, 'dist')
}

const resolveWindowIcon = () => {
  if (isDev) return path.join(__dirname, '..', 'build', 'icon.ico')
  return path.join(process.resourcesPath, 'build', 'icon.ico')
}

const resolvePreload = () => path.join(__dirname, 'preload.cjs')

const createWindow = async () => {
  const { startLocalServer } = await import(pathToFileURL(resolveServerEntry()).href)
  const { createServerRuntime } = await import(pathToFileURL(resolveServerEntry()).href)

  const runtime = createServerRuntime({
    env: {},
    configFile: path.join(app.getPath('userData'), 'config.json'),
    defaultOutputDir: path.join(app.getPath('pictures'), APP_NAME),
  })

  serverHandle = await startLocalServer({
    staticDir: resolveStaticDir(),
    runtime,
  })

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0b',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolvePreload(),
    },
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(APP_NAME)
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  await mainWindow.loadURL(serverHandle.url)
}

app.whenReady().then(() => {
  createWindow().catch(error => {
    console.error('[electron] Failed to start', error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(error => {
        console.error('[electron] Failed to recreate window', error)
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', event => {
  if (!serverHandle) return

  event.preventDefault()
  const handle = serverHandle
  serverHandle = undefined
  handle.close()
    .catch(error => console.error('[electron] Failed to close local server', error))
    .finally(() => app.quit())
})
