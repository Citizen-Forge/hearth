import { BrowserWindow, WebContentsView } from 'electron'
import { blog } from '../boot-log'

let view: WebContentsView | null = null
let resizeHandler: (() => void) | null = null

export function isEmbedOpen(): boolean {
  return view !== null
}

/**
 * Loads a URL directly inside Hearth's own (already frameless) window instead of
 * spawning a separate process/window — the only way to get a genuinely chrome-free
 * DRM player, since native Store apps and Edge --app mode both draw their own bars.
 * Requires a Widevine-enabled Electron build (see package.json).
 */
export function openEmbeddedPlayer(win: BrowserWindow, url: string): void {
  closeEmbeddedPlayer(win)

  const newView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: false
    }
  })
  view = newView
  win.contentView.addChildView(newView)

  const applyBounds = (): void => {
    const { width, height } = win.getContentBounds()
    newView.setBounds({ x: 0, y: 0, width, height })
  }
  applyBounds()
  resizeHandler = applyBounds
  win.on('resize', resizeHandler)

  // The embedded page owns keyboard focus, so Hearth's own window-level Escape/Backspace
  // handler never fires — intercept here instead, before the page sees the keystroke.
  newView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.key === 'Backspace')) {
      event.preventDefault()
      closeEmbeddedPlayer(win)
    }
  })

  newView.webContents.on('did-finish-load', () => blog('embed: did-finish-load', url))
  newView.webContents.on('did-fail-load', (_e, code, desc) => blog('embed: did-fail-load', code, desc))

  void newView.webContents.loadURL(url)
  blog('embed: opened', url)
}

export function closeEmbeddedPlayer(win: BrowserWindow): void {
  if (!view) return
  if (resizeHandler) {
    win.removeListener('resize', resizeHandler)
    resizeHandler = null
  }
  win.contentView.removeChildView(view)
  view.webContents.close()
  view = null
  blog('embed: closed')
}
