import { execFile } from 'node:child_process';

/**
 * PowerShell 桥：desktop 主进程借 PowerShell 5.1（系统自带）调用
 * UIAutomationClient / user32，免引入额外原生依赖（nut-js 之外）。
 * 脚本经 -EncodedCommand（UTF-16LE base64）传入，规避引号转义问题；
 * 脚本内须自行设置 [Console]::OutputEncoding=UTF8 保证中文输出不损坏。
 */
export type PowerShellRunner = (script: string, args?: string[]) => Promise<string>;

export interface PowerShellRunnerOptions {
  timeoutMs?: number;
  /** 测试注入：替换 execFile（断言脚本内容 / 返回夹具） */
  execFileImpl?: typeof execFile;
}

export function createPowerShellRunner(options: PowerShellRunnerOptions = {}): PowerShellRunner {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const exec = options.execFileImpl ?? execFile;
  return (script, args = []) =>
    new Promise((resolve, reject) => {
      // -EncodedCommand 之后不允许再跟位置参数（PS 5.1 直接报错），
      // 参数以 base64(JSON) 编入脚本首行，脚本内照旧用 $args[i]。
      // 注意必须 [object[]] 强转：@(...) 会把 ConvertFrom-Json 的数组再包一层
      // （$args[0] 变成整个数组 join 后的字符串）。
      const fullScript =
        args.length > 0
          ? `$args = [object[]]([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(
              JSON.stringify(args),
              'utf8',
            ).toString('base64')}')) | ConvertFrom-Json)\n${script}`
          : script;
      const encoded = Buffer.from(fullScript, 'utf16le').toString('base64');
      exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error) {
            const detail = typeof stderr === 'string' && stderr.trim() ? stderr.trim() : error.message;
            reject(new Error(`PowerShell 执行失败：${detail.slice(0, 300)}`));
            return;
          }
          resolve(typeof stdout === 'string' ? stdout : String(stdout));
        },
      );
    });
}

/**
 * 公共脚本头：UTF8 输出 + 进程声明 DPI 感知
 * （PowerShell 默认 DPI unaware，UIA/坐标 API 会返回缩放后的逻辑值，
 *  与本项目统一的物理像素坐标系冲突；SetProcessDPIAware 须在任何窗口操作前调用）。
 */
export const PS_PRELUDE = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dpiSig = '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
Add-Type -MemberDefinition $dpiSig -Name Dpi -Namespace WbfmPs
[WbfmPs.Dpi]::SetProcessDPIAware() | Out-Null
`.trim();
