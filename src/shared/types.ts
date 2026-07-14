// Types shared between the main and renderer processes.
// Keep this dependency-free (no node/electron/react imports) so both builds can use it.

export interface AppShortcut {
  id: string
  name: string
  /** Emoji or short label used as a placeholder tile art. */
  icon?: string
  /** One of: exe path, UWP AppUserModelID (shell:AppsFolder\...), or a URL. */
  target: string
  /**
   * - exe: run an executable
   * - uwp: launch a Store app by AppUserModelID
   * - webapp: open a URL in Edge's chromeless fullscreen app mode (DRM works)
   * - url: open a URL in the default browser
   * - embed: load a URL directly inside Hearth's own window (experimental,
   *   requires a Widevine-enabled Electron build) — truly chrome-free
   */
  kind: 'exe' | 'uwp' | 'webapp' | 'url' | 'embed'
  /** Optional accent colour for the tile. */
  color?: string
  /** Whether the tile is shown on Home/Apps. Defaults to true. */
  enabled?: boolean
}

export interface MpvStatus {
  installed: boolean
  version?: string
  /** Resolved path or command that worked. */
  path?: string
}

export interface InstallResult {
  ok: boolean
  message: string
}

export interface ArrConfig {
  /** Base URL, e.g. http://192.168.1.10:8989 */
  baseUrl: string
  apiKey: string
}

/** A shared-drive folder to scan, tagged so Films and TV are never guessed. */
export interface MediaFolder {
  path: string
  kind: 'movies' | 'tv'
}

export interface HearthConfig {
  /** Folders on the shared drive to scan for local media. */
  mediaFolders: MediaFolder[]
  sonarr: ArrConfig
  radarr: ArrConfig
  apps: AppShortcut[]
  /** Path to the mpv.exe binary, if not on PATH. */
  mpvPath: string
  /** Port for the companion phone-remote server. */
  remotePort: number
  /** Start the window fullscreen/kiosk. */
  kiosk: boolean
}

export interface Movie {
  id: string
  title: string
  year?: number
  /** Path to the video file itself. */
  path: string
  /** Path to the movie's own folder, used to match poster art from Radarr. */
  folderPath: string
  posterUrl?: string
  sizeBytes?: number
  addedAt?: number
}

export interface Episode {
  id: string
  title: string
  season: number
  episode: number
  path: string
  sizeBytes?: number
  addedAt?: number
}

export interface Season {
  season: number
  episodes: Episode[]
}

export interface Show {
  id: string
  title: string
  /** Path to the show's own folder, used to match poster art from Sonarr. */
  folderPath: string
  posterUrl?: string
  seasons: Season[]
  /** Most recent episode's mtime, for "recently added" sorting. */
  addedAt?: number
}

export interface Library {
  movies: Movie[]
  shows: Show[]
}

/** A normalized search result from Sonarr (series) or Radarr (movie) lookup. */
export interface DiscoverResult {
  service: 'sonarr' | 'radarr'
  title: string
  year?: number
  overview?: string
  posterUrl?: string
  /** tmdbId for movies, tvdbId for series. */
  remoteId: number
  /** Already present in the library on the *arr side. */
  alreadyAdded: boolean
}

export interface PlaybackState {
  active: boolean
  title?: string
  path?: string
  paused: boolean
  /** seconds */
  position: number
  /** seconds */
  duration: number
  volume: number
}

export type RemoteCommand =
  | { type: 'nav'; dir: 'up' | 'down' | 'left' | 'right' }
  | { type: 'enter' }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'playpause' }
  | { type: 'seek'; delta: number }
  | { type: 'volume'; delta: number }
  | { type: 'text'; value: string }
  | { type: 'goto'; screen: string }

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}
