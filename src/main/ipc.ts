import { ipcMain, BrowserWindow, shell } from 'electron'
import type {
  HearthConfig,
  DiscoverResult,
  ApiResult,
  AppShortcut,
  Library,
  PlaybackState
} from '../shared/types'
import { loadConfig, saveConfig, getConfigPath } from './config'
import { sonarrSearch, radarrSearch, sonarrAdd, radarrAdd, arrPing, buildPosterMap } from './services/arr'
import { scanLibrary, normalizeFolderName } from './services/library'
import { mpv } from './services/mpv'
import { launchApp } from './services/apps'
import { openEmbeddedPlayer, closeEmbeddedPlayer } from './services/embed'
import { startRemoteServer, remoteUrl } from './services/remote-server'
import { checkMpv, installMpv } from './services/system'
import { getUpdateStatus, checkForUpdates, installUpdate } from './services/updater'
import { listInstalledApps } from './services/installed-apps'
import type { MpvStatus, InstallResult, UpdateStatus, InstalledApp } from '../shared/types'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}
function fail<T>(error: unknown): ApiResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export function registerIpc(win: BrowserWindow): void {
  const cfg = loadConfig()
  mpv.setBinary(cfg.mpvPath)

  // Push mpv playback state + errors to the renderer.
  mpv.on('state', (state: PlaybackState) => {
    if (!win.isDestroyed()) win.webContents.send('playback:state', state)
  })
  mpv.on('error', (msg: string) => {
    if (!win.isDestroyed()) win.webContents.send('mpv:error', msg)
  })

  // Companion phone remote → forward commands to the renderer's nav system.
  startRemoteServer(cfg.remotePort, (command) => {
    if (!win.isDestroyed()) win.webContents.send('remote:command', command)
  })

  // ---- Config ----
  ipcMain.handle('config:get', (): HearthConfig => loadConfig())
  ipcMain.handle('config:save', (_e, patch: Partial<HearthConfig>): HearthConfig => {
    const next = saveConfig(patch)
    mpv.setBinary(next.mpvPath)
    return next
  })
  ipcMain.handle('config:path', (): string => getConfigPath())

  // ---- Local library ----
  ipcMain.handle('library:scan', async (): Promise<ApiResult<Library>> => {
    try {
      const c = loadConfig()
      const lib = await scanLibrary(c.mediaFolders)
      // Best-effort poster enrichment — never fail the scan if Sonarr/Radarr are unreachable.
      const [movieMap, showMap] = await Promise.all([
        c.radarr.baseUrl ? buildPosterMap(c.radarr, 'radarr').catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
        c.sonarr.baseUrl ? buildPosterMap(c.sonarr, 'sonarr').catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>())
      ])
      for (const m of lib.movies) m.posterUrl = movieMap.get(normalizeFolderName(m.folderPath))
      for (const s of lib.shows) s.posterUrl = showMap.get(normalizeFolderName(s.folderPath))
      return ok(lib)
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Discover (Sonarr / Radarr) ----
  ipcMain.handle(
    'discover:search',
    async (_e, term: string, service?: 'sonarr' | 'radarr'): Promise<ApiResult<DiscoverResult[]>> => {
      const c = loadConfig()
      try {
        const jobs: Promise<DiscoverResult[]>[] = []
        if (service !== 'radarr' && c.sonarr.baseUrl) jobs.push(sonarrSearch(c.sonarr, term).catch(() => []))
        if (service !== 'sonarr' && c.radarr.baseUrl) jobs.push(radarrSearch(c.radarr, term).catch(() => []))
        const results = (await Promise.all(jobs)).flat()
        return ok(results)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(
    'discover:add',
    async (_e, service: 'sonarr' | 'radarr', remoteId: number): Promise<ApiResult<null>> => {
      const c = loadConfig()
      try {
        if (service === 'sonarr') await sonarrAdd(c.sonarr, remoteId)
        else await radarrAdd(c.radarr, remoteId)
        return ok(null)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle('arr:ping', async (_e, service: 'sonarr' | 'radarr'): Promise<ApiResult<{ version: string }>> => {
    const c = loadConfig()
    try {
      return ok(await arrPing(service === 'sonarr' ? c.sonarr : c.radarr))
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Apps ----
  ipcMain.handle('apps:launch', async (_e, app: AppShortcut): Promise<ApiResult<null>> => {
    try {
      if (app.kind === 'embed') {
        openEmbeddedPlayer(win, app.target)
        return ok(null)
      }
      await launchApp(app)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('embed:close', (): void => closeEmbeddedPlayer(win))

  ipcMain.handle('apps:listInstalled', async (): Promise<ApiResult<InstalledApp[]>> => {
    try {
      const known = new Set(loadConfig().apps.map((a) => a.target))
      const all = await listInstalledApps()
      return ok(all.filter((a) => !known.has(a.aumid)))
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Playback (mpv) ----
  ipcMain.handle('play:file', async (_e, path: string, title?: string): Promise<ApiResult<null>> => {
    try {
      await mpv.play(path, title)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('play:command', async (_e, action: string, value?: number): Promise<ApiResult<null>> => {
    try {
      switch (action) {
        case 'playpause': await mpv.playPause(); break
        case 'seek': await mpv.seek(value ?? 0); break
        case 'seekTo': await mpv.seekTo(value ?? 0); break
        case 'volume': await mpv.setVolume(value ?? 0); break
        case 'stop': await mpv.stop(); break
      }
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('play:getState', (): PlaybackState => mpv.getState())

  // ---- System / mpv ----
  ipcMain.handle('system:checkMpv', async (): Promise<MpvStatus> => {
    const c = loadConfig()
    const status = await checkMpv(c.mpvPath)
    // If mpv was found at a concrete path but the config still points at the bare
    // "mpv" command (not resolvable on PATH), persist the working path so playback works.
    if (status.installed && status.path && status.path !== c.mpvPath) {
      const isPath = status.path.includes('/') || status.path.includes('\\')
      if (isPath && c.mpvPath === 'mpv') {
        const next = saveConfig({ mpvPath: status.path })
        mpv.setBinary(next.mpvPath)
      }
    }
    return status
  })

  ipcMain.handle('system:installMpv', async (): Promise<InstallResult> => {
    const result = await installMpv()
    if (result.ok) {
      const status = await checkMpv(loadConfig().mpvPath)
      if (status.installed && status.path) {
        const next = saveConfig({ mpvPath: status.path })
        mpv.setBinary(next.mpvPath)
      }
    }
    return result
  })

  ipcMain.handle('system:openExternal', (_e, url: string): Promise<void> => shell.openExternal(url))

  // ---- Updates ----
  ipcMain.handle('update:get', (): UpdateStatus => getUpdateStatus())
  ipcMain.handle('update:check', (): void => checkForUpdates())
  ipcMain.handle('update:install', (): void => installUpdate())

  // ---- Remote info ----
  ipcMain.handle('remote:url', (): string => remoteUrl(loadConfig().remotePort))
}
