import { useEffect, useRef, useState } from 'react'
import { Focusable } from '../components/Focusable'
import { IconGlyph } from '../components/IconGlyph'
import type { AppShortcut, HearthConfig, InstalledApp, MediaFolder, MpvStatus, UpdateStatus } from '../types'

interface Props {
  config: HearthConfig
  onSaved: (config: HearthConfig) => void
  showToast: (msg: string, err?: boolean) => void
}

type PingState = '' | 'ok' | 'bad'

const KIND_LABEL: Record<string, string> = {
  webapp: 'web',
  url: 'browser',
  uwp: 'app',
  exe: 'exe',
  embed: 'in-app'
}

export function SettingsScreen({ config, onSaved, showToast }: Props) {
  const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>(config.mediaFolders)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newFolderKind, setNewFolderKind] = useState<MediaFolder['kind']>('movies')
  const [sonarrUrl, setSonarrUrl] = useState(config.sonarr.baseUrl)
  const [sonarrKey, setSonarrKey] = useState(config.sonarr.apiKey)
  const [radarrUrl, setRadarrUrl] = useState(config.radarr.baseUrl)
  const [radarrKey, setRadarrKey] = useState(config.radarr.apiKey)
  const [mpvPath, setMpvPath] = useState(config.mpvPath)
  const [remotePort, setRemotePort] = useState(String(config.remotePort))
  const [kiosk, setKiosk] = useState(config.kiosk)
  const [apps, setApps] = useState<AppShortcut[]>(config.apps)
  const [sonarrPing, setSonarrPing] = useState<PingState>('')
  const [radarrPing, setRadarrPing] = useState<PingState>('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [mpv, setMpv] = useState<MpvStatus | null>(null)
  const [mpvBusy, setMpvBusy] = useState(false)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [installedLoading, setInstalledLoading] = useState(false)

  const refreshMpv = async (): Promise<MpvStatus> => {
    const status = await window.api.checkMpv()
    setMpv(status)
    if (status.path) setMpvPath(status.path)
    return status
  }

  const refreshInstalledApps = async (): Promise<void> => {
    setInstalledLoading(true)
    const res = await window.api.listInstalledApps()
    setInstalledLoading(false)
    if (res.ok && res.data) setInstalledApps(res.data)
  }

  useEffect(() => {
    void window.api.getRemoteUrl().then(setRemoteUrl)
    void window.api.getConfigPath().then(setConfigPath)
    void refreshMpv()
    void window.api.getUpdateStatus().then(setUpdate)
    void refreshInstalledApps()
    return window.api.onUpdateStatus(setUpdate)
  }, [])

  const save = async (): Promise<void> => {
    const next = await window.api.saveConfig({
      mediaFolders,
      sonarr: { baseUrl: sonarrUrl.trim(), apiKey: sonarrKey.trim() },
      radarr: { baseUrl: radarrUrl.trim(), apiKey: radarrKey.trim() },
      mpvPath: mpvPath.trim() || 'mpv',
      remotePort: Number(remotePort) || 842,
      kiosk,
      apps
    })
    onSaved(next)
    showToast('Settings saved')
  }

  const installMpv = async (): Promise<void> => {
    setMpvBusy(true)
    showToast('Installing mpv via winget… this can take a minute')
    const res = await window.api.installMpv()
    const status = await refreshMpv()
    setMpvBusy(false)
    if (status.installed) showToast(`mpv installed (${status.version ?? 'ok'})`)
    else showToast(res.message || 'mpv install failed', true)
  }

  const testSonarr = async (): Promise<void> => {
    await window.api.saveConfig({ sonarr: { baseUrl: sonarrUrl.trim(), apiKey: sonarrKey.trim() } })
    const res = await window.api.arrPing('sonarr')
    setSonarrPing(res.ok ? 'ok' : 'bad')
    if (!res.ok) showToast(`Sonarr: ${res.error}`, true)
  }
  const testRadarr = async (): Promise<void> => {
    await window.api.saveConfig({ radarr: { baseUrl: radarrUrl.trim(), apiKey: radarrKey.trim() } })
    const res = await window.api.arrPing('radarr')
    setRadarrPing(res.ok ? 'ok' : 'bad')
    if (!res.ok) showToast(`Radarr: ${res.error}`, true)
  }

  const toggleApp = (id: string): void =>
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: a.enabled === false } : a)))

  const addInstalledApp = (installed: InstalledApp): void => {
    setApps((prev) => [
      ...prev,
      {
        id: `installed-${installed.aumid}`,
        name: installed.name,
        icon: installed.icon,
        kind: 'uwp',
        target: installed.aumid,
        enabled: true
      }
    ])
    setInstalledApps((prev) => prev.filter((a) => a.aumid !== installed.aumid))
  }
  const removeCustomApp = (id: string): void => {
    const removed = apps.find((a) => a.id === id)
    setApps((prev) => prev.filter((a) => a.id !== id))
    if (removed) {
      setInstalledApps((prev) => [...prev, { name: removed.name, aumid: removed.target, icon: removed.icon }])
    }
  }

  const addFolder = (): void => {
    const path = newFolderPath.trim()
    if (!path) return
    if (mediaFolders.some((f) => f.path.toLowerCase() === path.toLowerCase())) {
      showToast('That folder is already added', true)
      return
    }
    setMediaFolders((prev) => [...prev, { path, kind: newFolderKind }])
    setNewFolderPath('')
  }
  const removeFolder = (path: string): void =>
    setMediaFolders((prev) => prev.filter((f) => f.path !== path))
  const toggleFolderKind = (path: string): void =>
    setMediaFolders((prev) =>
      prev.map((f) => (f.path === path ? { ...f, kind: f.kind === 'movies' ? 'tv' : 'movies' } : f))
    )

  return (
    <div>
      <div className="screen-head">
        <div>
          <h1>Admin</h1>
          <div className="sub">Playback, media sources, services &amp; tiles</div>
        </div>
      </div>

      <div className="form">
        {/* ---- version / updates ---- */}
        <div className="admin-card">
          <div className="admin-card-head">
            <span className="admin-card-title">🔥 Hearth version</span>
            {update && (
              <span className={`status-pill ${update.error ? 'bad' : update.downloaded ? 'ok' : ''}`}>
                {update.checking
                  ? 'Checking…'
                  : update.downloaded
                    ? `Update ready · v${update.latestVersion}`
                    : update.downloading
                      ? `Downloading v${update.latestVersion}…`
                      : update.error
                        ? 'Error'
                        : 'Up to date'}
              </span>
            )}
          </div>
          <div className="admin-card-body">
            <div className="mono">v{update?.currentVersion ?? '…'}</div>
            {update?.error && (
              <div className="hint" style={{ textAlign: 'left', margin: '8px 0 0' }}>
                {update.error}
              </div>
            )}
            <div className="row2" style={{ marginTop: 12 }}>
              <Focusable className="btn" onEnter={() => void window.api.checkForUpdates()}>
                ↻ Check for updates
              </Focusable>
              {update?.downloaded && (
                <Focusable className="btn primary" onEnter={() => void window.api.installUpdate()}>
                  ⬇ Update now (restarts Hearth)
                </Focusable>
              )}
            </div>
          </div>
        </div>

        {/* ---- mpv ---- */}
        <div className="admin-card">
          <div className="admin-card-head">
            <span className="admin-card-title">🎬 Local playback (mpv)</span>
            {mpv && (
              <span className={`status-pill ${mpv.installed ? 'ok' : 'bad'}`}>
                {mpv.installed ? `Installed · ${mpv.version ?? 'ok'}` : 'Not installed'}
              </span>
            )}
          </div>
          {mpv?.installed ? (
            <div className="admin-card-body">
              <div className="mono">{mpv.path}</div>
              <div className="row2" style={{ marginTop: 12 }}>
                <Focusable className="btn" onEnter={() => void refreshMpv()}>↻ Re-check</Focusable>
              </div>
            </div>
          ) : (
            <div className="admin-card-body">
              <div className="hint" style={{ textAlign: 'left', margin: 0 }}>
                mpv is required to play local films & TV. Install it with one click, or grab it manually.
              </div>
              <div className="row2" style={{ marginTop: 14 }}>
                <Focusable className="btn primary" onEnter={() => void installMpv()}>
                  {mpvBusy ? '⏳ Installing…' : '⬇ Install mpv'}
                </Focusable>
                <Focusable className="btn" onEnter={() => void refreshMpv()}>↻ Re-check</Focusable>
                <Focusable className="btn" onEnter={() => void window.api.openExternal('https://mpv.io/installation/')}>
                  🌐 Get mpv manually
                </Focusable>
              </div>
            </div>
          )}
        </div>

        {/* ---- media folders ---- */}
        <div className="field">
          <label>Media folders — tag each as Films or TV so the library never has to guess</label>
          <div className="tile-list">
            {mediaFolders.map((f) => (
              <div key={f.path} className="tile-row" style={{ cursor: 'default' }}>
                <span className="tile-row-icon">{f.kind === 'movies' ? '🎬' : '📺'}</span>
                <span className="tile-row-name mono" style={{ flex: 1 }}>{f.path}</span>
                <Focusable className="btn" onEnter={() => toggleFolderKind(f.path)}>
                  {f.kind === 'movies' ? 'Films' : 'TV'}
                </Focusable>
                <Focusable className="btn" onEnter={() => removeFolder(f.path)}>
                  ✕ Remove
                </Focusable>
              </div>
            ))}
            {mediaFolders.length === 0 && (
              <div className="hint" style={{ textAlign: 'left', margin: '4px 0' }}>
                No folders yet — add your Films and TV shared-drive paths below.
              </div>
            )}
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <FocusInput
              value={newFolderPath}
              onChange={setNewFolderPath}
              placeholder="e.g. Z:\Movies or \\unraid\Main\TV"
            />
            <Focusable className="btn" onEnter={() => setNewFolderKind((k) => (k === 'movies' ? 'tv' : 'movies'))}>
              {newFolderKind === 'movies' ? '🎬 Films' : '📺 TV'}
            </Focusable>
            <Focusable className="btn primary" onEnter={addFolder}>
              + Add folder
            </Focusable>
          </div>
        </div>

        {/* ---- Sonarr / Radarr ---- */}
        <div className="field">
          <label>
            Sonarr {sonarrPing && <span className={`status-pill ${sonarrPing}`}>{sonarrPing === 'ok' ? 'Connected' : 'Failed'}</span>}
          </label>
          <div className="row2">
            <FocusInput value={sonarrUrl} onChange={setSonarrUrl} placeholder="http://192.168.1.10:8989" />
            <FocusInput value={sonarrKey} onChange={setSonarrKey} placeholder="API key" />
            <Focusable className="btn" onEnter={testSonarr}>Test</Focusable>
          </div>
        </div>

        <div className="field">
          <label>
            Radarr {radarrPing && <span className={`status-pill ${radarrPing}`}>{radarrPing === 'ok' ? 'Connected' : 'Failed'}</span>}
          </label>
          <div className="row2">
            <FocusInput value={radarrUrl} onChange={setRadarrUrl} placeholder="http://192.168.1.10:7878" />
            <FocusInput value={radarrKey} onChange={setRadarrKey} placeholder="API key" />
            <Focusable className="btn" onEnter={testRadarr}>Test</Focusable>
          </div>
        </div>

        {/* ---- tiles ---- */}
        <div className="field">
          <label>Tiles — choose what shows on Home &amp; Apps</label>
          <div className="tile-list">
            {apps.map((app) => {
              const on = app.enabled !== false
              const isCustom = app.id.startsWith('installed-')
              return (
                <div key={app.id} className="tile-row" style={{ cursor: 'default' }}>
                  <span className="tile-row-icon"><IconGlyph icon={app.icon} /></span>
                  <span className="tile-row-name" style={{ flex: 1 }}>{app.name}</span>
                  <span className="tile-row-kind">{KIND_LABEL[app.kind] ?? app.kind}</span>
                  <Focusable className="btn" onEnter={() => toggleApp(app.id)}>
                    <span className={`check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span> {on ? 'On' : 'Off'}
                  </Focusable>
                  {isCustom && (
                    <Focusable className="btn" onEnter={() => removeCustomApp(app.id)}>
                      ✕ Remove
                    </Focusable>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ---- other installed apps ---- */}
        <div className="field">
          <label>Other installed apps — check any you'd like as Home/Apps tiles</label>
          <div className="tile-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {installedApps.map((ia) => (
              <Focusable key={ia.aumid} className="tile-row" onEnter={() => addInstalledApp(ia)}>
                <span className="check" />
                <span className="tile-row-icon"><IconGlyph icon={ia.icon} /></span>
                <span className="tile-row-name">{ia.name}</span>
              </Focusable>
            ))}
            {installedApps.length === 0 && !installedLoading && (
              <div className="hint" style={{ textAlign: 'left', margin: '4px 0' }}>
                No other installed apps found (or they're all already tiles).
              </div>
            )}
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <Focusable className="btn" onEnter={() => void refreshInstalledApps()}>
              {installedLoading ? '⏳ Scanning…' : '↻ Rescan installed apps'}
            </Focusable>
          </div>
        </div>

        {/* ---- playback / remote ---- */}
        <div className="field">
          <label>Playback &amp; remote</label>
          <div className="row2">
            <FocusInput value={mpvPath} onChange={setMpvPath} placeholder="mpv (path to mpv.exe)" />
            <FocusInput value={remotePort} onChange={setRemotePort} placeholder="Remote port" />
            <Focusable className="btn" onEnter={() => setKiosk((k) => !k)}>
              Fullscreen: {kiosk ? 'On' : 'Off'}
            </Focusable>
          </div>
        </div>

        <Focusable className="btn primary" onEnter={save} style={{ alignSelf: 'flex-start' }}>
          💾 Save settings
        </Focusable>

        <div className="sub" style={{ marginTop: 8, lineHeight: 1.8 }}>
          📱 Phone remote: <b>{remoteUrl || '…'}</b>
          <br />
          🗂️ Config file: <span style={{ color: 'var(--text-faint)' }}>{configPath}</span>
        </div>
      </div>
    </div>
  )
}

function FocusInput(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <Focusable className="field" style={{ flex: 1 }} onEnter={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Focusable>
  )
}
