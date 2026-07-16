import { useEffect, useState } from 'react'
import { Focusable } from './Focusable'
import { QrCode } from './QrCode'
import type { ScreenId } from '../types'

const ITEMS: { id: ScreenId; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'apps', icon: '🚀', label: 'Apps' },
  { id: 'films', icon: '🎬', label: 'Films' },
  { id: 'tv', icon: '📺', label: 'TV' },
  { id: 'discover', icon: '🔍', label: 'Discover' },
  { id: 'settings', icon: '⚙️', label: 'Admin' }
]

interface Props {
  current: ScreenId
  onNavigate: (id: ScreenId) => void
}

export function Sidebar({ current, onNavigate }: Props) {
  const [remoteUrl, setRemoteUrl] = useState('')

  useEffect(() => {
    void window.api.getRemoteUrl().then(setRemoteUrl)
  }, [])

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="logo">🔥</span>
      </div>
      {ITEMS.map((item) => (
        <Focusable
          key={item.id}
          focusKey={`nav-${item.id}`}
          className={`nav-item ${current === item.id ? 'active' : ''}`}
          onEnter={() => onNavigate(item.id)}
        >
          <span className="icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </Focusable>
      ))}
      {remoteUrl && (
        <div className="sidebar-qr">
          <QrCode value={remoteUrl} size={64} />
          <span className="nav-label sidebar-qr-label">Phone remote</span>
        </div>
      )}
    </nav>
  )
}
