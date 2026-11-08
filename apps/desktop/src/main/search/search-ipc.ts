import { execFile } from 'node:child_process';
import net from 'node:net';
import type { SearxngDeployResult } from '@wbfm/shared/search';
import {
  defaultProbeEngine,
  ensureConfigDir,
  tuneEngines,
  waitReady,
  SEARXNG_CONTAINER,
  type CommandResult,
  type RunCommand,
} from './searxng-tuning';

export { SEARXNG_CONTAINER };
export type { CommandResult, RunCommand };

/**
 * 桌面端一键部署 SearXNG（v2.17 联网搜索的本地出口）。
 *
 * 设计取舍：
 * - 只用 Docker：SearXNG 需要上游引擎与反爬维护，自己实现等于重造搜索引擎；
 * - 容器名固定、幂等：已存在则复跑 `docker start`，地址取 `docker port` 实际映射；
 * - 端口从候选里挑空闲的，映射只绑 127.0.0.1，不对外暴露；
 * - 配置文件写在 userData 下，`formats` 必须显式含 json，否则应用拿不到结果。
 */

const IMAGE = 'searxng/searxng:latest';
const CONTAINER_PORT = 8080;
const CANDIDATE_PORTS = [8080, 8090, 8088, 8888];
const READY_TIMEOUT_MS = 120_000;
/** 首次 docker run 可能包含镜像拉取，给足预算 */
const RUN_TIMEOUT_MS = 600_000;

export interface SearxngDeployDeps {
  /** 配置目录（<userData>/searxng），映射到容器 /etc/searxng */
  dataDir: string;
  run?: RunCommand;
  /** 探活：GET /search?q=ping&format=json 是否返回 results 数组 */
  probe?: (endpoint: string) => Promise<boolean>;
  /** 单引擎探测：该引擎能否返回结果（被墙/超时/验证码一律视为不可用） */
  probeEngine?: (endpoint: string, engine: string) => Promise<boolean>;
  pickPort?: () => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const defaultRun: RunCommand = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const err = error as (NodeJS.ErrnoException & { code?: number | string }) | null;
        if (err && err.code === 'ENOENT') {
          resolve({ code: -1, stdout: '', stderr: 'ENOENT' });
          return;
        }
        resolve({
          code: typeof err?.code === 'number' ? err.code : err ? 1 : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 只认带 results 数组的 JSON：403/HTML 落地页都算未就绪 */
async function defaultProbe(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/search?q=ping&format=json`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { results?: unknown };
    return Array.isArray(payload.results);
  } catch {
    return false;
  }
}

/** 端口是否真的可用：能 bind 且没人 accept（Windows 上 0.0.0.0 被占时 bind 127.0.0.1 仍可能成功） */
async function portAvailable(port: number): Promise<boolean> {
  const bindable = await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
  if (!bindable) return false;
  return !(await acceptsConnection(port));
}

function acceptsConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(300);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** 在 127.0.0.1 上找一个真的空闲端口（候选都占用时让系统分配） */
async function defaultPickPort(): Promise<number> {
  for (const port of CANDIDATE_PORTS) {
    if (await portAvailable(port)) return port;
  }
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('无法分配端口'))));
    });
  });
}

export function manualDeployCommand(dataDir: string, port = CONTAINER_PORT): string {
  return [
    'docker run -d --name wbfm-searxng --restart unless-stopped',
    `-p 127.0.0.1:${port}:${CONTAINER_PORT}`,
    `-v "${dataDir}:/etc/searxng"`,
    `-e BASE_URL=http://127.0.0.1:${port}/`,
    IMAGE,
  ].join(' ');
}

function fail(
  reason: Extract<SearxngDeployResult, { ok: false }>['reason'],
  message: string,
  dataDir: string,
): SearxngDeployResult {
  return { ok: false, reason, message, manualCommand: manualDeployCommand(dataDir) };
}

/** 已存在容器时取实际映射端口；解析失败返回 null（不能用容器端口兜底，可能被别的进程占用） */
function parsePublishedPort(stdout: string): number | null {
  const match = /:(\d+)\s*$/.exec(stdout.trim());
  return match ? Number(match[1]) : null;
}

export async function deploySearxng(deps: SearxngDeployDeps): Promise<SearxngDeployResult> {
  const run = deps.run ?? defaultRun;
  const probe = deps.probe ?? defaultProbe;
  const pickPort = deps.pickPort ?? defaultPickPort;
  const sleep = deps.sleep ?? defaultSleep;
  const timeoutMs = deps.timeoutMs ?? READY_TIMEOUT_MS;
  const { dataDir } = deps;

  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return fail('unsupported', `当前平台不支持自动部署：${process.platform}`, dataDir);
  }

  let managed = false;
  try {
    ({ managed } = ensureConfigDir(dataDir));
  } catch (error) {
    return fail('start_failed', `无法写入配置目录：${(error as Error).message}`, dataDir);
  }

  // 1) Docker 是否可用：ENOENT=未安装；非零=守护进程未启动
  const version = await run('docker', ['version', '--format', '{{.Server.Version}}'], 20_000);
  if (version.code === -1) {
    return fail(
      'docker_missing',
      '未检测到 Docker。安装并启动 Docker Desktop 后可一键部署，也可按下方命令手工启动。',
      dataDir,
    );
  }
  if (version.code !== 0) {
    const detail = (version.stderr || version.stdout).trim().slice(0, 200);
    return fail('docker_daemon', `Docker 守护进程不可用：${detail || '请先启动 Docker Desktop'}`, dataDir);
  }

  // 2) 复用已有容器，或新建
  let port: number | null = null;
  const inspect = await run(
    'docker',
    ['inspect', '-f', '{{.State.Running}}', SEARXNG_CONTAINER],
    20_000,
  );
  if (inspect.code === 0) {
    let running = inspect.stdout.trim() === 'true';
    if (!running) {
      const started = await run('docker', ['start', SEARXNG_CONTAINER], 60_000);
      running = started.code === 0;
      // 残留容器（Created/Exited）且原端口已被别的进程占用：清掉后用新端口重建
      if (!running) await run('docker', ['rm', '-f', SEARXNG_CONTAINER], 30_000);
    }
    if (running) {
      const mapped = await run('docker', ['port', SEARXNG_CONTAINER, `${CONTAINER_PORT}/tcp`], 20_000);
      const published = mapped.code === 0 ? parsePublishedPort(mapped.stdout) : null;
      if (published === null) {
        return fail('start_failed', '已有容器没有可用的端口映射，请执行 docker rm -f wbfm-searxng 后重试', dataDir);
      }
      port = published;
    }
  }

  if (port === null) {
    const chosen = await pickPort();
    const created = await run(
      'docker',
      [
        'run',
        '-d',
        '--name',
        SEARXNG_CONTAINER,
        '--restart',
        'unless-stopped',
        '-p',
        `127.0.0.1:${chosen}:${CONTAINER_PORT}`,
        '-v',
        `${dataDir}:/etc/searxng`,
        '-e',
        `BASE_URL=http://127.0.0.1:${chosen}/`,
        IMAGE,
      ],
      RUN_TIMEOUT_MS,
    );
    if (created.code !== 0) {
      // 失败时 docker 可能留下 Created 空壳，清掉避免下次误复用
      await run('docker', ['rm', '-f', SEARXNG_CONTAINER], 30_000);
      return fail(
        'start_failed',
        `docker run 失败：${(created.stderr || created.stdout).trim().slice(0, 300) || `退出码 ${created.code}`}`,
        dataDir,
      );
    }
    port = chosen;
  }

  // 3) 等 JSON 接口可用（首次启动要等上游引擎初始化）
  const endpoint = `http://127.0.0.1:${port}`;
  if (!(await waitReady(endpoint, timeoutMs, probe, sleep))) {
    return fail(
      'timeout',
      `容器已启动但 ${endpoint} 在 ${Math.round(timeoutMs / 1000)}s 内未返回 JSON。请稍后点「测试连接」重试，或执行 docker logs ${SEARXNG_CONTAINER} 查看原因。`,
      dataDir,
    );
  }

  // 4) 动态引擎调优：按当前网络实测结果禁用拿不到结果的引擎（被墙/超时/验证码）
  let engines: string[] | undefined;
  if (managed) {
    try {
      engines = await tuneEngines({
        dataDir,
        endpoint,
        run,
        probe,
        probeEngine: deps.probeEngine ?? defaultProbeEngine,
        sleep,
      });
    } catch {
      engines = [];
    }
  }

  return {
    ok: true,
    endpoint,
    container: SEARXNG_CONTAINER,
    ...(engines ? { engines } : {}),
  };
}

export interface SearchIpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export function registerSearchIpc(
  ipc: SearchIpcMainLike,
  deps: SearxngDeployDeps,
): void {
  ipc.handle('search:deploy-searxng', () => deploySearxng(deps));
}
