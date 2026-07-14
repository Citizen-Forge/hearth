import { useState } from 'react'
import { MediaCard } from '../components/MediaCard'
import { Focusable } from '../components/Focusable'
import type { Show } from '../types'

interface Props {
  shows: Show[]
  loading: boolean
  error: string | null
  onPlay: (item: { path: string; title: string }) => void
  onRefresh: () => void
}

export function TVScreen({ shows, loading, error, onPlay, onRefresh }: Props) {
  const [openShow, setOpenShow] = useState<Show | null>(null)
  const episodeCount = shows.reduce(
    (n, s) => n + s.seasons.reduce((m, season) => m + season.episodes.length, 0),
    0
  )

  if (openShow) {
    return (
      <div>
        <div className="screen-head">
          <div>
            <h1>{openShow.title}</h1>
            <div className="sub">
              {openShow.seasons.length} season{openShow.seasons.length === 1 ? '' : 's'}
            </div>
          </div>
          <Focusable className="btn" onEnter={() => setOpenShow(null)}>
            ← Back to TV
          </Focusable>
        </div>

        {openShow.seasons.map((season) => (
          <div className="row-block" key={season.season}>
            <div className="row-title">{season.season === 0 ? 'Specials' : `Season ${season.season}`}</div>
            <div className="card-row" style={{ flexWrap: 'wrap' }}>
              {season.episodes.map((ep) => (
                <MediaCard
                  key={ep.id}
                  poster={false}
                  icon="📺"
                  title={ep.title}
                  subtitle={`S${season.season}E${ep.episode}`}
                  onEnter={() =>
                    onPlay({ path: ep.path, title: `${openShow.title} — S${season.season}E${ep.episode}` })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="screen-head">
        <div>
          <h1>TV</h1>
          <div className="sub">
            {loading ? 'Scanning shared drive…' : `${shows.length} shows · ${episodeCount} episodes`}
          </div>
        </div>
        <Focusable className="btn" onEnter={onRefresh}>
          ↻ Rescan
        </Focusable>
      </div>

      {error && (
        <div className="empty">
          <div className="big">⚠️</div>
          <div className="hint">{error}</div>
        </div>
      )}

      {!loading && !error && shows.length === 0 && (
        <div className="empty">
          <div className="big">📺</div>
          <div className="hint">
            No shows found. Add a TV folder in <b>Admin</b>, then rescan.
          </div>
        </div>
      )}

      <div className="card-row" style={{ flexWrap: 'wrap' }}>
        {shows.map((s) => (
          <MediaCard
            key={s.id}
            posterUrl={s.posterUrl}
            icon="📺"
            badge="Open"
            title={s.title}
            subtitle={`${s.seasons.length} season${s.seasons.length === 1 ? '' : 's'}`}
            onEnter={() => setOpenShow(s)}
          />
        ))}
      </div>
    </div>
  )
}
