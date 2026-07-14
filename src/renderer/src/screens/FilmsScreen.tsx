import { MediaCard } from '../components/MediaCard'
import { Focusable } from '../components/Focusable'
import type { Movie } from '../types'
import { formatSize } from '../types'

interface Props {
  movies: Movie[]
  loading: boolean
  error: string | null
  onPlay: (item: { path: string; title: string }) => void
  onRefresh: () => void
}

export function FilmsScreen({ movies, loading, error, onPlay, onRefresh }: Props) {
  return (
    <div>
      <div className="screen-head">
        <div>
          <h1>Films</h1>
          <div className="sub">{loading ? 'Scanning shared drive…' : `${movies.length} films`}</div>
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

      {!loading && !error && movies.length === 0 && (
        <div className="empty">
          <div className="big">🎬</div>
          <div className="hint">
            No films found. Add a Films folder in <b>Admin</b>, then rescan.
          </div>
        </div>
      )}

      <div className="card-row" style={{ flexWrap: 'wrap' }}>
        {movies.map((m) => (
          <MediaCard
            key={m.id}
            posterUrl={m.posterUrl}
            icon="🎬"
            title={m.title}
            subtitle={[m.year, formatSize(m.sizeBytes)].filter(Boolean).join(' · ')}
            onEnter={() => onPlay({ path: m.path, title: m.title })}
          />
        ))}
      </div>
    </div>
  )
}
