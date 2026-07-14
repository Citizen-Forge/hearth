import { useCallback, useEffect, useRef, useState } from 'react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Sidebar } from './components/Sidebar'
import { PlaybackBar } from './components/PlaybackBar'
import { HomeScreen } from './screens/HomeScreen'
import { AppsScreen } from './screens/AppsScreen'
import { FilmsScreen } from './screens/FilmsScreen'
import { TVScreen } from './screens/TVScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useGamepad } from './navigation/useGamepad'
import { pressKey } from './navigation/press'
import type { AppShortcut, HearthConfig, Library, PlaybackState, RemoteCommand, ScreenId } from './types'
import './styles/app.css'

const EMPTY_PLAYBACK: PlaybackState = { active: false, paused: false, position: 0, duration: 0, volume: 100 }
const EMPTY_LIBRARY: Library = { movies: [], shows: [] }

export function App() {
  const [config, setConfig] = useState<HearthConfig | null>(null)
  const [screen, setScreen] = useState<ScreenId>(() => {
    const hash = window.location.hash.replace('#', '')
    const valid: ScreenId[] = ['home', 'apps', 'films', 'tv', 'discover', 'settings']
    return (valid as string[]).includes(hash) ? (hash as ScreenId) : 'home'
  })
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY)
  const [libLoading, setLibLoading] = useState(true)
  const [libError, setLibError] = useState<string | null>(null)
  const [playback, setPlayback] = useState<PlaybackState>(EMPTY_PLAYBACK)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [pendingSearch, setPendingSearch] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const scan = useCallback(async () => {
    setLibLoading(true)
    setLibError(null)
    const res = await window.api.scanLibrary()
    setLibLoading(false)
    if (res.ok && res.data) setLibrary(res.data)
    else setLibError(res.error ?? 'Scan failed')
  }, [])

  // Initial load.
  useEffect(() => {
    void window.api.getConfig().then(setConfig)
    void window.api.getPlaybackState().then(setPlayback)
    void scan()
    setTimeout(() => setFocus('nav-home'), 100)
  }, [scan])

  // Playback + mpv error subscriptions.
  useEffect(() => {
    const offState = window.api.onPlaybackState(setPlayback)
    const offErr = window.api.onMpvError((msg) => showToast(msg, true))
    return () => {
      offState()
      offErr()
    }
  }, [showToast])

  const navigate = useCallback((id: ScreenId) => setScreen(id), [])

  const playFile = useCallback(
    async (item: { path: string; title: string }) => {
      const res = await window.api.playFile(item.path, item.title)
      if (!res.ok) showToast(res.error ?? 'Could not start playback', true)
    },
    [showToast]
  )

  const launchApp = useCallback(
    async (app: AppShortcut) => {
      const res = await window.api.launchApp(app)
      if (res.ok) showToast(`Launching ${app.name}...`)
      else showToast(res.error ?? 'Could not launch', true)
    },
    [showToast]
  )

  const playCommand = useCallback((action: string, value?: number) => {
    void window.api.playCommand(action, value)
  }, [])

  const goBack = useCallback(() => {
    if (screen !== 'home') {
      setScreen('home')
      setTimeout(() => setFocus('nav-home'), 60)
    } else {
      setFocus('nav-home')
    }
  }, [screen])

  // Unified command dispatch for phone-remote + gamepad.
  const dispatch = useCallback(
    (cmd: RemoteCommand) => {
      switch (cmd.type) {
        case 'nav': pressKey(cmd.dir); break
        case 'enter': pressKey('enter'); break
        case 'back': goBack(); break
        case 'home': setScreen('home'); setTimeout(() => setFocus('nav-home'), 60); break
        case 'playpause': playCommand('playpause'); break
        case 'seek': playCommand('seek', cmd.delta); break
        case 'volume': playCommand('volume', cmd.delta); break
        case 'goto': setScreen(cmd.screen as ScreenId); break
        case 'text': setScreen('discover'); setPendingSearch(cmd.value); break
      }
    },
    [goBack, playCommand]
  )

  // Phone remote -> dispatch.
  useEffect(() => window.api.onRemoteCommand(dispatch), [dispatch])

  // Gamepad -> dispatch.
  useGamepad({
    onNav: (dir) => dispatch({ type: 'nav', dir }),
    onEnter: () => dispatch({ type: 'enter' }),
    onBack: () => dispatch({ type: 'back' }),
    onHome: () => dispatch({ type: 'home' }),
    onPlayPause: () => dispatch({ type: 'playpause' }),
    onSeek: (delta) => dispatch({ type: 'seek', delta })
  })

  // Keyboard back (Esc/Backspace) - arrows & enter are handled by the nav lib.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'Escape' || (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA')) {
        goBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goBack])

  // Auto-hide the mouse cursor for a TV feel.
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout>
    const onMove = (): void => {
      document.body.classList.remove('hide-cursor')
      clearTimeout(idle)
      idle = setTimeout(() => document.body.classList.add('hide-cursor'), 3000)
    }
    window.addEventListener('mousemove', onMove)
    onMove()
    return () => {
      window.removeEventListener('mousemove', onMove)
      clearTimeout(idle)
    }
  }, [])

  const enabledApps = (config?.apps ?? []).filter((a) => a.enabled !== false)

  return (
    <div className="app">
      <Sidebar current={screen} onNavigate={navigate} />
      <main className="content">
        {screen === 'home' && (
          <HomeScreen apps={enabledApps} library={library} onLaunch={launchApp} onPlay={playFile} onNavigate={navigate} />
        )}
        {screen === 'apps' && <AppsScreen apps={enabledApps} onLaunch={launchApp} />}
        {screen === 'films' && (
          <FilmsScreen movies={library.movies} loading={libLoading} error={libError} onPlay={playFile} onRefresh={scan} />
        )}
        {screen === 'tv' && (
          <TVScreen shows={library.shows} loading={libLoading} error={libError} onPlay={playFile} onRefresh={scan} />
        )}
        {screen === 'discover' && (
          <DiscoverScreen
            pendingSearch={pendingSearch}
            onConsumeSearch={() => setPendingSearch(null)}
            showToast={showToast}
          />
        )}
        {screen === 'settings' && config && (
          <SettingsScreen config={config} onSaved={setConfig} showToast={showToast} />
        )}
      </main>

      <PlaybackBar state={playback} onCommand={playCommand} />
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
