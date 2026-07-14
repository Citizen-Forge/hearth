export type ScreenId = 'home' | 'apps' | 'films' | 'tv' | 'discover' | 'settings'

export type {
  HearthConfig,
  AppShortcut,
  MediaFolder,
  Movie,
  Show,
  Season,
  Episode,
  Library,
  DiscoverResult,
  PlaybackState,
  RemoteCommand,
  ApiResult,
  ArrConfig,
  MpvStatus,
  InstallResult
} from '../../shared/types'

import type { Library, Episode } from '../../shared/types'

/** A single playable poster tile — used for Home's "Recently added" row. */
export interface RecentTile {
  id: string
  title: string
  subtitle: string
  posterUrl?: string
  icon: string
  path: string
  addedAt: number
}

export function recentFromLibrary(library: Library, limit = 12): RecentTile[] {
  const movieTiles: RecentTile[] = library.movies.map((m) => ({
    id: m.id,
    title: m.title,
    subtitle: [m.year, formatSize(m.sizeBytes)].filter(Boolean).join(' · '),
    posterUrl: m.posterUrl,
    icon: '🎬',
    path: m.path,
    addedAt: m.addedAt ?? 0
  }))
  // Only the latest episode per show, so one binge-watched show doesn't crowd out everything else.
  const episodeTiles: RecentTile[] = library.shows.flatMap((s) => {
    let latest: { season: number; episode: Episode } | null = null
    for (const season of s.seasons) {
      for (const ep of season.episodes) {
        if (!latest || (ep.addedAt ?? 0) > (latest.episode.addedAt ?? 0)) {
          latest = { season: season.season, episode: ep }
        }
      }
    }
    if (!latest) return []
    return [
      {
        id: latest.episode.id,
        title: s.title,
        subtitle: `S${latest.season}E${latest.episode.episode} · ${latest.episode.title}`,
        posterUrl: s.posterUrl,
        icon: '📺',
        path: latest.episode.path,
        addedAt: latest.episode.addedAt ?? 0
      }
    ]
  })
  return [...movieTiles, ...episodeTiles].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit)
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}
