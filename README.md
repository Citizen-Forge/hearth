# Hearth

A 10-foot TV / big-screen media & launcher interface for Windows. Built to run on a
PC wired to a 50" screen: browse and play local films/TV from a shared drive, launch
streaming apps (Netflix, Prime, GeForce Now, …), and search Sonarr/Radarr to add new
media — all navigable by remote, gamepad, keyboard, mouse, or your phone.

> Working name — rename freely (`package.json` `name`, the 🔥 logo/title).

## Stack

- **[castLabs' Widevine-enabled Electron fork](https://github.com/castlabs/electron-releases)** (main + preload) — window/kiosk, app launching, filesystem scan, Sonarr/Radarr proxy, mpv control, phone-remote server. Not vanilla Electron — see **DRM playback (Netflix/Prime/Disney+)** below.
- **React + TypeScript + Vite** (renderer) — the 10-foot UI
- **[electron-vite](https://electron-vite.org/)** — build/dev tooling
- **[norigin-spatial-navigation](https://github.com/NoriginMedia/Norigin-Spatial-Navigation)** — D-pad/arrow focus movement
- **mpv** — local playback (controlled over its JSON IPC named pipe)
- **express + ws** — the companion phone remote

## Prerequisites

- **Node.js** (installed on the host — an Electron GUI dev loop can't run in a container)
- **[mpv](https://mpv.io/installation/)** for local playback. Put `mpv.exe` on `PATH`, or set its
  full path in **Settings → Playback**. (Streaming apps and Sonarr/Radarr search work without mpv.)

## Getting started

```bash
npm install
node node_modules/electron/install.js   # see note below — required, `npm install` alone isn't enough
npm run dev      # launches Electron with HMR
```

> **Note:** this project depends on [castLabs' Widevine-enabled Electron fork](https://github.com/castlabs/electron-releases),
> not vanilla `electron` — that's what makes embedded Netflix/Prime/Disney+ playback possible
> (see below). Unlike vanilla Electron, this fork's npm package has **no `postinstall` hook**,
> so `npm install` alone won't download the actual binary — you must run
> `node node_modules/electron/install.js` yourself afterward, every time you reinstall.

Build / package:

```bash
npm run build    # bundles main, preload, renderer into ./out
npm run dist      # build + electron-builder NSIS installer
```

> **Note:** `npm run dist` needs Windows Developer Mode enabled (or an elevated shell) —
> electron-builder unpacks a macOS codesign helper archive that contains symlinks, and
> Windows blocks symlink creation for standard, non-elevated users otherwise. Real releases
> are built by CI (see **Releases & auto-update** below), which doesn't hit this.

### Dev on a desktop (not the TV)

- `set HEARTH_WINDOWED=1` (PowerShell: `$env:HEARTH_WINDOWED=1`) launches a normal window instead of fullscreen kiosk.
- `HEARTH_CAPTURE=path\to.png` snapshots the rendered UI to a PNG and exits — handy for CI/screenshots.

> **Gotcha:** if your shell has `ELECTRON_RUN_AS_NODE=1` set, Electron runs as plain Node and
> the app crashes with `Cannot read properties of undefined (reading 'whenReady')`. Clear it before launching.

## Configuration

Everything is editable in-app under **Admin** (gear icon), stored at
`%APPDATA%\hearth\hearth-config.json` (also logs to `%APPDATA%\hearth\hearth.log`).

- **Local playback (mpv)** — the Admin page detects whether mpv is installed and shows its
  version/path. If missing, **Install mpv** runs `winget install shinchiro.mpv` for you (a UAC
  prompt may appear), **Re-check** re-detects, and **Get mpv manually** opens mpv.io. A detected
  path is saved automatically so playback just works.
- **Media folders** — add each shared-drive folder and tag it **Films** or **TV**; the scanner
  never has to guess. Films: one subfolder per movie (or loose files), Radarr-style. TV: a
  folder per show, a subfolder per season (`Season 01`, …), episodes inside, Sonarr-style.
  The Library screen shows Films and TV as separate rows; shows open into a season/episode
  browser. Poster art is matched automatically from Sonarr/Radarr's own library (by folder
  name) when they're configured below — no extra API key needed.
- **Sonarr / Radarr** — base URL + API key (find the key in each app's *Settings → General*).
  Use **Test** to verify. Discover search hits both; pressing OK on a result adds it
  (uses the first root folder + quality profile on that service).
- **Tiles** — checkboxes to enable/disable each app tile (Netflix, Prime, GeForce Now, Minecraft…)
  on Home and the Apps screen.
- **Playback & remote** — mpv path override, phone-remote port, fullscreen on/off.

## Controls

| Input | Navigate | Select | Back | Home | Play/Pause | Seek |
|-------|----------|--------|------|------|-----------|------|
| Keyboard / IR remote | Arrows | Enter | Esc / Backspace | — | — | — |
| Gamepad | D-pad / L-stick | A | B | Y | X | LB / RB |
| Phone | on-screen D-pad | OK | Back | Home | ⏯ | «/» |
| Mouse | hover | click | — | — | on-screen | on-screen |

**Phone remote:** open the URL shown in **Settings** (e.g. `http://<pc-ip>:842`) on any
phone on the same network. It gives you a D-pad, playback controls, and a **text search box**
that jumps the TV to Discover — the easy way to type a title from the couch.

## Project layout

```
src/
  shared/types.ts        # types shared across processes
  main/
    index.ts             # app lifecycle, kiosk window, capture/boot logging
    ipc.ts               # all IPC handlers
    config.ts            # zod-validated config store + default apps
    services/
      arr.ts             # Sonarr/Radarr v3 client (search + add + poster matching)
      library.ts         # shared-drive scanner (Films/TV, season/episode grouping)
      mpv.ts             # mpv launch + JSON-IPC control
      apps.ts            # launch exe / UWP / URL
      embed.ts           # embedded DRM player (Netflix/Prime/Disney+) inside Hearth's own window
      system.ts          # mpv detection + winget install
      remote-server.ts   # express + ws phone remote
      remote-page.ts     # the phone remote's HTML
  preload/index.ts       # contextBridge → window.api
  renderer/src/
    App.tsx              # routing, playback, remote/gamepad dispatch
    navigation/          # spatial-nav press bridge + gamepad hook
    components/          # Sidebar, Focusable, MediaCard, AppTile, PlaybackBar, Clock
    screens/             # Home, Apps, Library, Discover, Settings
```

## DRM playback (Netflix/Prime/Disney+)

Netflix, Prime Video, and Disney+ tiles use an `embed` app kind (see
`src/main/services/embed.ts`) that loads the service directly inside Hearth's own
window, instead of launching a separate native app or browser — which is what gets
you a genuinely title-bar-free player. This only works because of the castLabs
Electron fork mentioned above, which bundles Widevine CDM support that vanilla
Electron doesn't have.

**Getting a build that actually plays DRM content requires one extra step: VMP
signing.** Without it, the embed loads fine (you can browse, log in) but playback
fails with a license error (Netflix: `E100`). To fix that:

1. Create a free castLabs EVS account (entirely CLI-driven, no website form):
   ```bash
   pip install castlabs-evs
   python -m castlabs_evs.account signup
   ```
2. Sign the built app:
   ```bash
   python -m castlabs_evs.account reauth
   python -m castlabs_evs.vmp sign-pkg node_modules/electron/dist
   ```
   (For a full `npm run dist` / electron-builder package instead, sign
   `release/win-unpacked` after building — see `scripts/vmp-sign.js`, which does
   this automatically as an electron-builder `afterSign` hook.)

**Licensing note:** castLabs' free EVS tier is intended for personal/development use.
If you're building this for wider distribution, check castLabs' current terms for
your use case — the CDM itself isn't checked into this repo (each build downloads
and signs its own copy), but redistributing a signed build to other people is a
different situation than using one yourself.

**Don't want to deal with any of this?** The `AppShortcut.kind` system also
supports `'uwp'` (launch a real installed Store app) and `'webapp'` (Edge chromeless
`--app` mode) — both work with vanilla Electron, no Widevine fork or signing needed,
just with a visible title bar. Change the relevant tiles' `kind` in
`src/main/config.ts`'s `DEFAULT_APPS` (or edit an existing config's `apps` array) back
to `'uwp'`/`'webapp'` to opt out entirely.

## Releases & auto-update

Pushing a tag matching `v*.*.*` (e.g. `v0.2.0`) triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the NSIS
installer on a `windows-latest` runner, VMP-signs it (see **DRM playback** above) and
publishes it to [GitHub Releases](https://github.com/Citizen-Forge/hearth/releases) via
`electron-builder --publish always`.

This requires two repo secrets to be set (Settings → Secrets and variables → Actions)
for the VMP-signing step to work — without them, the release build will fail at the
"Authenticate with castLabs EVS" step:

- `EVS_ACCOUNT_NAME` — the account name (not email) from `castlabs_evs.account signup`
- `EVS_ACCOUNT_PASSWORD` — its password

Set them from your own terminal, not by pasting into anything else, so the values never
end up in shell history you don't control:
```bash
gh secret set EVS_ACCOUNT_NAME --repo <owner>/hearth
gh secret set EVS_ACCOUNT_PASSWORD --repo <owner>/hearth
```

The running app checks that same Releases feed on startup and every 4 hours
(`electron-updater`, wired in `src/main/index.ts`), downloads newer versions in the
background, and installs them on the next restart — no manual redistribution needed.
To cut a release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Bump the `version` in `package.json` to match before tagging.

## Roadmap / ideas

- Embed the mpv surface directly in the window via `--wid` (currently a controlled child window)
- "Continue watching" with resume positions
- Per-app kiosk browser (Edge `--kiosk`) instead of default browser for streaming
- Optional pairing/PIN on the phone remote

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, modify, and share for any
noncommercial purpose (personal use, hobby projects, etc.); commercial use isn't
permitted under this license.
