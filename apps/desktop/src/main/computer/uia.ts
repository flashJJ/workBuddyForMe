import type { UiaElement, UiaListArgs, UiaListResponse } from '@wbfm/shared';
import { createPowerShellRunner, PS_PRELUDE, type PowerShellRunner } from './ps';

/**
 * UIA 控件树枚举（M2 确定性定位优先路径）：
 * PowerShell 加载 UIAutomationClient，从目标窗口（缺省前台窗口）向下
 * 走 ControlView 树，拍平为名称+类型+物理像素矩形的候选清单。
 * args: $args[0]=窗口标题子串（可为空串），$args[1]=maxNodes
 */
const UIA_LIST_SCRIPT = `
${PS_PRELUDE}
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$fgSig = '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();'
Add-Type -MemberDefinition $fgSig -Name Fg -Namespace WbfmPs

$title = [string]$args[0]
$maxNodes = [int]$args[1]

$root = $null
if ($title.Length -gt 0) {
  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $tops = $desktop.FindAll('Children', [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $tops) {
    if ($w.Current.Name -and $w.Current.Name.ToLower().Contains($title.ToLower())) { $root = $w; break }
  }
  if ($null -eq $root) { throw "未找到标题包含 '$title' 的窗口" }
} else {
  $hwnd = [WbfmPs.Fg]::GetForegroundWindow()
  if ($hwnd -eq [System.IntPtr]::Zero) { throw '无前台窗口' }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
}
if ($null -eq $root) { throw '目标窗口不可用' }

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$stack = New-Object System.Collections.Generic.Stack[System.Windows.Automation.AutomationElement]
$stack.Push($walker.GetFirstChild($root))
$list = New-Object System.Collections.Generic.List[object]
$total = 0
while ($stack.Count -gt 0 -and $list.Count -lt $maxNodes) {
  $el = $stack.Pop()
  $total++
  try {
    $c = $el.Current
    $r = $c.BoundingRectangle
    $offscreen = [bool]$c.IsOffscreen
    if (-not $offscreen -and $r.Width -gt 0 -and $r.Height -gt 0) {
      # PS5.1 解析怪癖：方法调用括号内的 hash 字面量里写 -replace 'a','b' 会炸
      # （Unexpected token ','），必须先赋值变量再 Add。
      $item = [pscustomobject]@{
        name = [string]$c.Name
        controlType = ([string]$c.ControlType.ProgrammaticName) -replace '^ControlType\\.',''
        automationId = [string]$c.AutomationId
        rect = @{ x = [int][Math]::Round($r.X); y = [int][Math]::Round($r.Y); width = [int][Math]::Round($r.Width); height = [int][Math]::Round($r.Height) }
        interactable = [bool]$c.IsEnabled
      }
      $list.Add($item)
    }
    $child = $walker.GetFirstChild($el)
    while ($null -ne $child) {
      $stack.Push($child)
      $child = $walker.GetNextSibling($child)
    }
  } catch { }
}
# elements 用 ToArray() 固定为数组形态（单元素时 List 直序列化可能退化为对象）
[pscustomobject]@{ windowTitle = [string]$root.Current.Name; elements = $list.ToArray(); totalNodes = $total } | ConvertTo-Json -Compress -Depth 5
`.trim();

export interface UiaBridgeOptions {
  runner?: PowerShellRunner;
}

/** 枚举目标窗口（缺省前台窗口）的 UIA 控件清单 */
export async function listUiaElements(
  args: UiaListArgs,
  options: UiaBridgeOptions = {},
): Promise<UiaListResponse> {
  const runner = options.runner ?? createPowerShellRunner();
  const stdout = await runner(UIA_LIST_SCRIPT, [args.windowTitle ?? '', String(args.maxNodes)]);
  const parsed = JSON.parse(stdout.trim()) as {
    windowTitle: string;
    elements: UiaElement[] | UiaElement;
    totalNodes: number;
  };
  // ConvertTo-Json 单元素时退化为对象而非数组，统一规整
  const elements = Array.isArray(parsed.elements) ? parsed.elements : [parsed.elements];
  return { windowTitle: parsed.windowTitle, elements, totalNodes: parsed.totalNodes };
}
