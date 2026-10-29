import { spawn, type ChildProcess } from 'node:child_process';
import type {
  SubagentProvider,
  SubagentProviderInput,
  SubagentProviderResult,
} from './subagent-provider';
import { resolveCommandPath } from './cli-command';
import {
  buildPermissionResultLine,
  buildRunLine,
  CLI_MAX_DIAGNOSTICS,
  CLI_MAX_STDERR_BYTES,
  isFatalParseFailure,
  parseCliLine,
} from './cli-protocol';

/**
 * v2.11 本地 CLI 外部代理：
 * - 严格 JSON Lines；`shell:false`，argv 数组直传；
 * - 超时 / 输出上限 / 协议错误 / 取消 → 杀进程树并收敛终态；
 * - permission 帧经宿主审批回调，缺省一律拒绝（fail-closed）。
 */

const MINIMAL_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
] as const;

export function minimalSubagentEnv(
  base: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const value = base[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface CliSubagentProviderOptions {
  id: string;
  label: string;
  command: string;
  args: readonly string[];
  timeoutMs: number;
  maxOutputBytes: number;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  pathEnv?: string;
  pathExt?: string;
}

function killProcessTree(child: ChildProcess, platform: NodeJS.Platform, exited: boolean): void {
  if (exited || !child.pid) return;
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => undefined);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* 进程已退出 */
    }
  }
}

function runCli(
  options: CliSubagentProviderOptions,
  input: SubagentProviderInput,
  signal?: AbortSignal,
): Promise<SubagentProviderResult> {
  const platform = options.platform ?? process.platform;
  const executable = resolveCommandPath(options.command, {
    platform,
    pathEnv: options.pathEnv,
    pathExt: options.pathExt,
  });
  if (!executable) {
    return Promise.resolve({
      status: 'failed',
      summary: '',
      error: `命令不可用：${options.command}`,
      errorCode: 'command_unavailable',
      outputBytes: 0,
    });
  }
  if (!input.cwd) {
    return Promise.resolve({
      status: 'failed',
      summary: '',
      error: '缺少工作目录',
      errorCode: 'cwd_missing',
      outputBytes: 0,
    });
  }

  let child: ChildProcess;
  try {
    child = spawn(executable, [...options.args], {
      cwd: input.cwd,
      env: minimalSubagentEnv(options.env) as NodeJS.ProcessEnv,
      shell: false,
      windowsHide: true,
      detached: platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    return Promise.resolve({
      status: 'failed',
      summary: '',
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'spawn_error',
      outputBytes: 0,
    });
  }

  return new Promise<SubagentProviderResult>((resolve) => {
    let settled = false;
    let exited = false;
    let outputBytes = 0;
    let stderr = '';
    let buffer = '';
    let permissionPending = false;
    const timers: { current?: NodeJS.Timeout } = {};
    const deltas: string[] = [];
    const diagnostics: string[] = [];
    const abort = new AbortController();

    const summaryOf = (): string => deltas.join('').trim();

    const failed = (errorCode: string, message?: string): SubagentProviderResult => ({
      status: 'failed',
      summary: summaryOf().slice(0, 200),
      error: message ?? (stderr.trim() ? stderr.trim().slice(-500) : errorCode),
      errorCode,
      outputBytes,
    });

    const finish = (result: SubagentProviderResult): void => {
      if (settled) return;
      settled = true;
      if (timers.current) clearTimeout(timers.current);
      signal?.removeEventListener('abort', onAbort);
      abort.abort();
      killProcessTree(child, platform, exited);
      resolve({ ...result, outputBytes });
    };

    function onAbort(): void {
      finish({ status: 'cancelled', summary: summaryOf(), error: '用户取消' });
    }

    async function respondPermission(frame: {
      id: string;
      title: string;
      detail?: string;
    }): Promise<void> {
      let allow = false;
      try {
        allow = input.requestPermission
          ? await input.requestPermission(
              { id: frame.id, title: frame.title, ...(frame.detail ? { detail: frame.detail } : {}) },
              abort.signal,
            )
          : false;
      } catch {
        allow = false;
      }
      permissionPending = false;
      if (settled) return;
      try {
        child.stdin?.write(`${buildPermissionResultLine(frame.id, allow)}\n`);
      } catch {
        finish(failed('permission_write', '无法回写审批结果'));
      }
    }

    function handleLine(raw: string): void {
      const parsed = parseCliLine(raw);
      if (parsed.kind === 'empty') return;
      if (parsed.kind === 'invalid') {
        if (diagnostics.length < CLI_MAX_DIAGNOSTICS) diagnostics.push(parsed.reason);
        if (isFatalParseFailure(parsed)) finish(failed('protocol', parsed.reason));
        return;
      }
      const frame = parsed.frame;
      if (frame.type === 'delta') {
        deltas.push(frame.text);
        return;
      }
      if (frame.type === 'permission') {
        if (permissionPending) {
          finish(failed('protocol', '重复的 permission 帧'));
          return;
        }
        permissionPending = true;
        void respondPermission(frame);
        return;
      }
      if (frame.type === 'done') {
        finish({ status: 'done', summary: frame.summary?.trim() || summaryOf(), outputBytes });
        return;
      }
      finish(failed(frame.code ?? 'error', frame.message));
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes) {
        finish(failed('output_limit', `输出超过上限（${options.maxOutputBytes} 字节）`));
        return;
      }
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\n');
      while (!settled && index >= 0) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length >= CLI_MAX_STDERR_BYTES) return;
      stderr += chunk.toString('utf8').slice(0, CLI_MAX_STDERR_BYTES - stderr.length);
    });
    child.on('error', (error) => {
      if (settled) return;
      finish(failed('spawn_error', error.message));
    });
    child.on('close', (code) => {
      exited = true;
      if (settled) return;
      if (buffer.trim()) handleLine(buffer);
      if (settled) return;
      finish(failed('exit', `子进程退出（code=${code ?? 'null'}）`));
    });

    timers.current = setTimeout(() => {
      finish(failed('timeout', `超时（${options.timeoutMs}ms）`));
    }, options.timeoutMs);
    timers.current.unref?.();

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      child.stdin?.write(`${buildRunLine(input)}\n`);
    } catch {
      finish(failed('spawn_error', '无法写入运行请求'));
    }
  });
}

export function createCliSubagentProvider(options: CliSubagentProviderOptions): SubagentProvider {
  return {
    id: options.id,
    label: options.label,
    available() {
      return resolveCommandPath(options.command, {
        platform: options.platform,
        pathEnv: options.pathEnv,
        pathExt: options.pathExt,
      }) !== null;
    },
    run(input, signal) {
      return runCli(options, input, signal);
    },
  };
}
