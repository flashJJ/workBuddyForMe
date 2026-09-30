import { spawn } from 'node:child_process';
import type {
  AppLaunchArgs,
  WindowFocusArgs,
  WindowInfo,
  WindowListResponse,
} from '@wbfm/shared';
import { createPowerShellRunner, PS_PRELUDE, type PowerShellRunner } from './ps';

/**
 * 窗口管理桥：EnumWindows 枚举可见顶层窗口（标题/句柄/矩形/进程名/前台标记），
 * SetForegroundWindow + ShowWindow(SW_RESTORE) 激活目标窗口。
 * 坐标经 PS_PRELUDE 的 SetProcessDPIAware 统一为物理像素。
 */
const WINDOW_LIST_SCRIPT = `
${PS_PRELUDE}
$ErrorActionPreference = 'Stop'
$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WbfmWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
Add-Type -TypeDefinition $sig -ReferencedAssemblies @()
$fg = [WbfmWin]::GetForegroundWindow()
$rows = New-Object System.Collections.Generic.List[object]
$cb = [WbfmWin+EnumProc]{
  param([IntPtr]$h, [IntPtr]$l)
  if (-not [WbfmWin]::IsWindowVisible($h)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][WbfmWin]::GetWindowTextW($h, $sb, 512)
  $t = $sb.ToString()
  if ($t.Length -eq 0) { return $true }
  $r = New-Object WbfmWin+RECT
  if (-not [WbfmWin]::GetWindowRect($h, [ref]$r)) { return $true }
  $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
  if ($w -le 0 -or $hh -le 0) { return $true }
  $procId = [uint32]0
  [void][WbfmWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $pname = ''
  try { $pname = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { }
  $rows.Add([pscustomobject]@{
    handle = $h.ToInt64().ToString()
    title = $t
    processName = $pname
    rect = @{ x = $r.Left; y = $r.Top; width = $w; height = $hh }
    isForeground = ($h -eq $fg)
  })
  return $true
}
[void][WbfmWin]::EnumWindows($cb, [IntPtr]::Zero)
# PS5.1 怪癖：List[object] 经 @() 包装后 ConvertTo-Json 会炸（Argument types do not match），
# 直接管道输出则正常；单元素退化为对象由 TS 侧规整。
$rows | ConvertTo-Json -Compress -Depth 4
`.trim();

const WINDOW_FOCUS_SCRIPT = `
${PS_PRELUDE}
$ErrorActionPreference = 'Stop'
$sig = @'
using System;
using System.Runtime.InteropServices;
public class WbfmFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
'@
Add-Type -TypeDefinition $sig
$h = [IntPtr][int64]$args[0]
if ([WbfmFocus]::IsIconic($h)) { [void][WbfmFocus]::ShowWindow($h, 9) }
if (-not [WbfmFocus]::SetForegroundWindow($h)) { throw 'SetForegroundWindow 失败' }
'{"ok":true}'
`.trim();

export interface WindowBridgeOptions {
  runner?: PowerShellRunner;
  spawnImpl?: typeof spawn;
}

export async function listWindows(options: WindowBridgeOptions = {}): Promise<WindowListResponse> {
  const runner = options.runner ?? createPowerShellRunner();
  const stdout = await runner(WINDOW_LIST_SCRIPT);
  const trimmed = stdout.trim();
  if (!trimmed) return { windows: [] };
  const parsed = JSON.parse(trimmed) as WindowInfo[] | WindowInfo;
  return { windows: Array.isArray(parsed) ? parsed : [parsed] };
}

/** 激活窗口：按 handle 或标题子串（标题匹配先经 listWindows 解析成 handle） */
export async function focusWindow(
  args: WindowFocusArgs,
  options: WindowBridgeOptions = {},
): Promise<void> {
  const runner = options.runner ?? createPowerShellRunner();
  let handle = args.handle;
  if (!handle) {
    const { windows } = await listWindows(options);
    const needle = args.title!.toLowerCase();
    const hit = windows.find((w) => w.title.toLowerCase().includes(needle));
    if (!hit) throw new Error(`未找到标题包含 "${args.title}" 的窗口`);
    handle = hit.handle;
  }
  await runner(WINDOW_FOCUS_SCRIPT, [handle]);
}

/** 启动应用：CreateProcess 语义（shell:false，参数逐个传递，不经过 cmd 拼接） */
export async function launchApp(
  args: AppLaunchArgs,
  options: WindowBridgeOptions = {},
): Promise<void> {
  const spawnFn = options.spawnImpl ?? spawn;
  await new Promise<void>((resolve, reject) => {
    const child = spawnFn(args.target, args.args, { detached: true, stdio: 'ignore', shell: false });
    child.once('error', (e) => reject(new Error(`启动失败：${e.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
