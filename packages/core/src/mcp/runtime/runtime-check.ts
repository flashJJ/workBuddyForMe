import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpRuntimeProbe, McpRuntimeStatus } from '@wbfm/shared/types';

/** 探测命令超时：只读版本号，4 秒足够；不阻塞设置页 */
const PROBE_TIMEOUT_MS = 4_000;

function runVersion(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
        // Windows 上 npx/uvx 是 .cmd 包装，需要 shell 才能执行；命令与参数均为固定字面量
        shell: process.platform === 'win32',
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}

function parseMajor(version: string | null): number | null {
  if (!version) return null;
  const match = version.match(/(\d+)\./);
  return match ? Number(match[1]) : null;
}

function commandProbe(version: string | null): McpRuntimeProbe {
  return {
    available: version !== null && version !== '',
    version,
    major: parseMajor(version),
    path: null,
  };
}

/** 常见 Chrome 安装位置（Windows / macOS / Linux） */
export function findChromePath(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    for (const root of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) {
      if (root) candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

/**
 * v2.24：安装 MCP 服务器前的运行环境预检。
 * 只探测固定命令，不执行用户输入；失败一律降级为 available=false，不抛错。
 */
export async function checkMcpRuntime(): Promise<McpRuntimeStatus> {
  const [nodeVersion, npxVersion, uvxVersion] = await Promise.all([
    runVersion('node', ['--version']),
    runVersion('npx', ['--version']),
    runVersion('uvx', ['--version']),
  ]);
  const chromePath = findChromePath();
  return {
    platform: process.platform,
    node: commandProbe(nodeVersion),
    npx: commandProbe(npxVersion),
    uvx: commandProbe(uvxVersion),
    chrome: {
      available: chromePath !== null,
      version: null,
      major: null,
      path: chromePath,
    },
    checkedAt: new Date().toISOString(),
  };
}
