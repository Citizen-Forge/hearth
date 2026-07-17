import { contextBridge, ipcRenderer } from 'electron'
import type {
  HearthConfig,
  DiscoverResult,
  ApiResult,
  AppShortcut,
  Library,
  PlaybackState,
  RemoteCommand,
  MpvStatus,
  InstallResult,
  UpdateStatus,
  InstalledApp
} from '../shared/types'

const api = {
  // Config
  getConfig: (): Promise<HearthConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (patch: Partial<HearthConfig>): Promise<HearthConfig> =>
    ipcRenderer.invoke('config:save', patch),
  getConfigPath: (): Promise<string> => ipcRenderer.invoke('config:path'),

  // Library
  scanLibrary: (): Promise<ApiResult<Library>> => ipcRenderer.invoke('library:scan'),

  // Discover
  discoverSearch: (term: string, service?: 'sonarr' | 'radarr'): Promise<ApiResult<DiscoverResult[]>> =>
    ipcRenderer.invoke('discover:search', term, service),
  discoverAdd: (service: 'sonarr' | 'radarr', remoteId: number): Promise<ApiResult<null>> =>
    ipcRenderer.invoke('discover:add', service, remoteId),
  arrPing: (service: 'sonarr' | 'radarr'): Promise<ApiResult<{ version: string }>> =>
    ipcRenderer.invoke('arr:ping', service),

  // Apps
  launchApp: (app: AppShortcut): Promise<ApiResult<null>> => ipcRenderer.invoke('apps:launch', app),
  closeEmbed: (): Promise<void> => ipcRenderer.invoke('embed:close'),
  listInstalledApps: (): Promise<ApiResult<InstalledApp[]>> => ipcRenderer.invoke('apps:listInstalled'),

  // Playback
  playFile: (path: string, title?: string): Promise<ApiResult<null>> =>
    ipcRenderer.invoke('play:file', path, title),
  playCommand: (action: string, value?: number): Promise<ApiResult<null>> =>
    ipcRenderer.invoke('play:command', action, value),
  getPlaybackState: (): Promise<PlaybackState> => ipcRenderer.invoke('play:getState'),

  // System / mpv
  checkMpv: (): Promise<MpvStatus> => ipcRenderer.invoke('system:checkMpv'),
  installMpv: (): Promise<InstallResult> => ipcRenderer.invoke('system:installMpv'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),

  // Updates
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:get'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),

  // Remote
  getRemoteUrl: (): Promise<string> => ipcRenderer.invoke('remote:url'),

  // Events (main → renderer)
  onPlaybackState: (cb: (s: PlaybackState) => void): (() => void) => {
    const listener = (_e: unknown, s: PlaybackState): void => cb(s)
    ipcRenderer.on('playback:state', listener)
    return () => ipcRenderer.removeListener('playback:state', listener)
  },
  onRemoteCommand: (cb: (c: RemoteCommand) => void): (() => void) => {
    const listener = (_e: unknown, c: RemoteCommand): void => cb(c)
    ipcRenderer.on('remote:command', listener)
    return () => ipcRenderer.removeListener('remote:command', listener)
  },
  onMpvError: (cb: (msg: string) => void): (() => void) => {
    const listener = (_e: unknown, msg: string): void => cb(msg)
    ipcRenderer.on('mpv:error', listener)
    return () => ipcRenderer.removeListener('mpv:error', listener)
  },
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    const listener = (_e: unknown, s: UpdateStatus): void => cb(s)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  }
}

export type HearthApi = typeof api

contextBridge.exposeInMainWorld('api', api)
