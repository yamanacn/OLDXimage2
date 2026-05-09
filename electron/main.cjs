const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let serverHandle

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

  const window = new BrowserWindow({
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
    },
  })

  window.setMenuBarVisibility(false)

  window.once('ready-to-show', () => {
    window.setTitle(APP_NAME)
    window.show()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  await window.loadURL(serverHandle.url)
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
