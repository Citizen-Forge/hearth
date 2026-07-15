import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import { EventEmitter } from 'events'
import type { PlaybackState } from '../../shared/types'

const PIPE = '\\\\.\\pipe\\hearth-mpv'

/**
 * Controls an mpv instance for local playback. mpv runs as a borderless,
 * fullscreen child process; we drive it over its JSON IPC named pipe so the UI
 * keeps full control (play/pause/seek/volume/subtitles) and a unified 10-foot UX.
 *
 * A future enhancement is to embed mpv's window into the Electron BrowserWindow
 * via `--wid` for a truly in-app surface; the IPC control layer here stays the same.
 */
class MpvController extends EventEmitter {
  private proc: ChildProcess | null = null
  private socket: net.Socket | null = null
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, (v: unknown) => void>()
  private mpvPath = 'mpv'

  private state: PlaybackState = {
    active: false,
    paused: false,
    position: 0,
    duration: 0,
    volume: 100
  }

  setBinary(path: string): void {
    this.mpvPath = path || 'mpv'
  }

  getState(): PlaybackState {
    return this.state
  }

  async play(path: string, title?: string): Promise<void> {
    if (this.proc) {
      // Already running — just load the new file.
      await this.command(['loadfile', path, 'replace'])
      this.state = { ...this.state, active: true, paused: false, title, path }
      this.emitState()
      return
    }

    this.proc = spawn(
      this.mpvPath,
      [
        '--fullscreen',
        '--force-window=yes',
        '--idle=once',
        '--ontop',
        '--no-terminal',
        // mpv defaults to software decoding unless told otherwise, unlike VLC which
        // auto-negotiates hardware decode — without this, higher-bitrate files can
        // out-pace the CPU and skip/judder even though the same file is smooth in VLC.
        // On hardware where hwaccel init fails (e.g. some Intel iGPU driver builds —
        // confirmed via verbose mpv logs, not just theory) it silently falls back to
        // software decode, so also drop to cheaper scaling/dithering (mpv's own "fast"
        // profile) to keep per-frame GPU cost down and avoid judder either way.
        '--hwdec=auto',
        '--profile=fast',
        `--input-ipc-server=${PIPE}`,
        path
      ],
      { stdio: 'ignore', windowsHide: false }
    )

    this.state = { ...this.state, active: true, paused: false, position: 0, duration: 0, title, path }
    this.emitState()

    this.proc.on('error', (err) => {
      console.error('[mpv] spawn error:', err)
      this.emit('error', `Could not launch mpv (${this.mpvPath}). Is it installed / on PATH?`)
      this.cleanup()
    })
    this.proc.on('exit', () => this.cleanup())

    // mpv needs a moment to create the pipe.
    await this.connectWithRetry()
  }

  private async connectWithRetry(attempts = 25): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.connect()
        this.observeProperties()
        return
      } catch {
        await new Promise((r) => setTimeout(r, 120))
      }
    }
    console.error('[mpv] failed to connect to IPC pipe')
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.connect(PIPE)
      sock.on('connect', () => {
        this.socket = sock
        resolve()
      })
      sock.on('error', reject)
      sock.on('data', (chunk) => this.onData(chunk))
      sock.on('close', () => {
        this.socket = null
      })
    })
  }

  private observeProperties(): void {
    void this.command(['observe_property', 1, 'pause'])
    void this.command(['observe_property', 2, 'time-pos'])
    void this.command(['observe_property', 3, 'duration'])
    void this.command(['observe_property', 4, 'volume'])
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf-8')
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      try {
        this.handleMessage(JSON.parse(line))
      } catch {
        // ignore malformed line
      }
    }
  }

  private handleMessage(msg: any): void {
    if (msg.event === 'property-change') {
      switch (msg.name) {
        case 'pause':
          this.state = { ...this.state, paused: Boolean(msg.data) }
          break
        case 'time-pos':
          this.state = { ...this.state, position: Number(msg.data) || 0 }
          break
        case 'duration':
          this.state = { ...this.state, duration: Number(msg.data) || 0 }
          break
        case 'volume':
          this.state = { ...this.state, volume: Number(msg.data) || 0 }
          break
      }
      this.emitState()
    } else if (typeof msg.request_id === 'number' && this.pending.has(msg.request_id)) {
      const resolver = this.pending.get(msg.request_id)!
      this.pending.delete(msg.request_id)
      resolver(msg.data)
    }
  }

  private command(cmd: unknown[]): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve(undefined)
        return
      }
      const request_id = this.nextId++
      this.pending.set(request_id, resolve)
      this.socket.write(JSON.stringify({ command: cmd, request_id }) + '\n')
      // Don't leak resolvers if mpv never answers.
      setTimeout(() => {
        if (this.pending.delete(request_id)) resolve(undefined)
      }, 2000)
    })
  }

  async playPause(): Promise<void> {
    await this.command(['cycle', 'pause'])
  }

  async seek(delta: number): Promise<void> {
    await this.command(['seek', delta, 'relative'])
  }

  async seekTo(pos: number): Promise<void> {
    await this.command(['seek', pos, 'absolute'])
  }

  async setVolume(delta: number): Promise<void> {
    const v = Math.max(0, Math.min(130, this.state.volume + delta))
    await this.command(['set_property', 'volume', v])
  }

  async stop(): Promise<void> {
    await this.command(['quit'])
    this.cleanup()
  }

  private emitState(): void {
    this.emit('state', this.state)
  }

  private cleanup(): void {
    this.socket?.destroy()
    this.socket = null
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill()
      } catch {
        /* ignore */
      }
    }
    this.proc = null
    this.pending.clear()
    this.buffer = ''
    this.state = { active: false, paused: false, position: 0, duration: 0, volume: this.state.volume }
    this.emitState()
  }
}

export const mpv = new MpvController()
