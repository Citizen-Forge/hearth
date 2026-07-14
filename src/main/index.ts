import { app, BrowserWindow, shell, components } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { loadConfig } from './config'
import { registerIpc } from './ipc'
import { stopRemoteServer } from './services/remote-server'
import { mpv } from './services/mpv'
import { blog } from './boot-log'

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

/** Checks GitHub Releases for a newer tagged build and installs it silently in the background. */
function setupAutoUpdater(): void {
  if (process.env['ELECTRON_RENDERER_URL']) return // skip in dev (no packaged app-update.yml)
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (err) => blog('autoUpdater error', err instanceof Error ? err.message : String(err)))
  autoUpdater.on('checking-for-update', () => blog('autoUpdater: checking for update'))
  autoUpdater.on('update-available', (info) => blog('autoUpdater: update available', info.version))
  autoUpdater.on('update-not-available', () => blog('autoUpdater: up to date'))
  autoUpdater.on('update-downloaded', (info) =>
    blog('autoUpdater: downloaded, installs on next restart', info.version)
  )

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => blog('autoUpdater check failed', String(err)))
  }
  check()
  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
}

let mainWindow: BrowserWindow | null = null

process.on('uncaughtException', (err) => blog('UNCAUGHT', err.stack ?? String(err)))
process.on('unhandledRejection', (reason) => blog('UNHANDLED_REJECTION', String(reason)))

function createWindow(): void {
  const cfg = loadConfig()
  // HEARTH_WINDOWED=1 skips true fullscreen/kiosk lock (handy for development on a desktop)
  // but the window still stays frameless so it matches the real look.
  const isWindowedOverride = Boolean(process.env['HEARTH_WINDOWED'])
  const trueKiosk = cfg.kiosk && !isWindowedOverride
  blog('createWindow: kiosk=', cfg.kiosk, 'windowed=', isWindowedOverride)

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    frame: !cfg.kiosk,
    fullscreen: trueKiosk,
    kiosk: trueKiosk,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (process.env['HEARTH_CAPTURE']) {
      blog('ready-to-show: capture mode, keeping window hidden')
      return
    }
    blog('ready-to-show: showing window')
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    blog('renderer: did-finish-load')
    // Dev/CI capture: snapshot the rendered UI to a PNG and exit. Non-interactive.
    if (process.env['HEARTH_CAPTURE']) {
      setTimeout(async () => {
        try {
          const img = await mainWindow!.webContents.capturePage()
          const { writeFileSync } = await import('fs')
          writeFileSync(process.env['HEARTH_CAPTURE'] as string, img.toPNG())
          blog('capture: wrote', process.env['HEARTH_CAPTURE'])
        } catch (err) {
          blog('capture FAILED', String(err))
        }
        app.quit()
      }, 1200)
    }
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
    blog('renderer: did-fail-load', code, desc, url)
  )
  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    blog('renderer: process-gone', details.reason)
  )

  // Open external links (e.g. streaming services) in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  try {
    registerIpc(mainWindow)
  } catch (err) {
    blog('registerIpc FAILED', err instanceof Error ? err.stack : String(err))
  }

  // electron-vite injects the dev server URL in development.
  if (process.env['ELECTRON_RENDERER_URL']) {
    blog('loading dev URL', process.env['ELECTRON_RENDERER_URL'])
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const indexHtml = join(__dirname, '../renderer/index.html')
    const startScreen = process.env['HEARTH_START_SCREEN']
    blog('loading file', indexHtml, startScreen ? `#${startScreen}` : '')
    void mainWindow.loadFile(indexHtml, startScreen ? { hash: startScreen } : undefined)
  }
}

app.whenReady().then(() => {
  blog('app ready')
  createWindow()
  setupAutoUpdater()

  // Experimental (widevine-embed branch): triggers the Widevine CDM download/install
  // on first run. Non-blocking — embedded DRM tiles just won't play until this resolves.
  components
    .whenReady([components.WIDEVINE_CDM_ID])
    .then((result) => blog('widevine components ready', JSON.stringify(result)))
    .catch((err) => blog('widevine components.whenReady FAILED', err instanceof Error ? err.message : String(err)))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopRemoteServer()
  void mpv.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopRemoteServer()
  void mpv.stop()
})
