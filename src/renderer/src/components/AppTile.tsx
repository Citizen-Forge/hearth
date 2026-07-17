import { Focusable } from './Focusable'
import { IconGlyph } from './IconGlyph'
import type { AppShortcut } from '../types'

interface Props {
  app: AppShortcut
  onLaunch: (app: AppShortcut) => void
}

export function AppTile({ app, onLaunch }: Props) {
  return (
    <Focusable
      className="app-tile"
      style={{ ['--tile-color' as string]: app.color ?? 'var(--accent)' }}
      onEnter={() => onLaunch(app)}
    >
      <div className="glow" />
      <div className="app-icon">
        <IconGlyph icon={app.icon} size={44} />
      </div>
      <div className="app-name">{app.name}</div>
    </Focusable>
  )
}
