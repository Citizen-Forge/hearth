// electron-builder afterSign hook: VMP-signs the packaged app with castLabs' EVS
// service so the bundled Widevine CDM is trusted for real DRM playback (Netflix,
// Prime Video, Disney+ embeds). Without this, those still load but playback fails
// with a license/DRM error (Netflix: E100).
//
// Must run AFTER packaging (electron.exe has already been renamed to Hearth.exe by
// this point) and, per castLabs' docs, after any code-signing on Windows.
//
// Requires `python -m castlabs_evs.account reauth` to have already run earlier in
// the same CI job/shell (see .github/workflows/release.yml) so a session token is
// cached — this hook doesn't handle authentication itself.
const { execFileSync } = require('child_process')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return

  console.log('[vmp-sign] Signing', context.appOutDir)
  execFileSync('python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], {
    stdio: 'inherit'
  })
}
