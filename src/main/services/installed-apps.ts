import { spawn } from 'child_process'
import type { InstalledApp } from '../../shared/types'

// Combines Get-StartApps (covers both real UWP/Store apps and traditional desktop
// apps with a Start Menu entry) with real icon extraction via IShellItemImageFactory
// against shell:AppsFolder\<AppID> — this works uniformly for both app kinds, and
// both launch the same way via `explorer.exe shell:AppsFolder\<AppID>` ('uwp' kind).
const SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
[ComImport]
[Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItemImageFactory
{
    void GetImage(SIZE size, int flags, out IntPtr phbm);
}
[StructLayout(LayoutKind.Sequential)]
public struct SIZE { public int cx; public int cy; }
public class ShellIconHelper
{
    [DllImport("shell32.dll")]
    private static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, ref Guid riid, out IShellItemImageFactory ppv);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    public static byte[] GetIconPng(string appsFolderPath, int size)
    {
        Guid guid = typeof(IShellItemImageFactory).GUID;
        IShellItemImageFactory factory;
        int hr = SHCreateItemFromParsingName(appsFolderPath, IntPtr.Zero, ref guid, out factory);
        if (hr != 0 || factory == null) return null;
        IntPtr hBitmap;
        SIZE sz = new SIZE(); sz.cx = size; sz.cy = size;
        factory.GetImage(sz, 0x4, out hBitmap);
        if (hBitmap == IntPtr.Zero) return null;
        byte[] bytes;
        using (var bmp = System.Drawing.Image.FromHbitmap(hBitmap))
        using (var ms = new System.IO.MemoryStream())
        {
            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            bytes = ms.ToArray();
        }
        DeleteObject(hBitmap);
        return bytes;
    }
}
'@ -ReferencedAssemblies System.Drawing

$apps = Get-StartApps
$result = foreach ($app in $apps) {
  $iconB64 = $null
  try {
    $bytes = [ShellIconHelper]::GetIconPng("shell:AppsFolder\\$($app.AppID)", 64)
    if ($bytes) { $iconB64 = [Convert]::ToBase64String($bytes) }
  } catch {}
  [PSCustomObject]@{ Name = $app.Name; AppID = $app.AppID; Icon = $iconB64 }
}
$result | ConvertTo-Json -Compress -Depth 3
`

export function listInstalledApps(): Promise<InstalledApp[]> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
      windowsHide: true
    })
    let out = ''
    ps.stdout?.on('data', (d) => (out += d.toString()))
    ps.on('error', () => resolve([]))
    ps.on('exit', () => {
      try {
        const parsed: unknown = JSON.parse(out || '[]')
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        const apps = arr
          .filter(
            (a): a is { Name: unknown; AppID: unknown; Icon: unknown } =>
              typeof a === 'object' && a !== null && 'Name' in a && 'AppID' in a
          )
          .map((a) => ({
            name: String(a.Name),
            aumid: String(a.AppID),
            icon: a.Icon ? `data:image/png;base64,${String(a.Icon)}` : undefined
          }))
          .filter((a) => a.name && a.aumid && a.name !== 'Hearth')
        resolve(apps)
      } catch {
        resolve([])
      }
    })
  })
}
