import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SearXNG 托管配置与引擎动态调优（从 search-ipc 拆出，控制单文件行数）。
 * - 自动生成的配置带托管标记；带标记才允许改写，用户手改过的文件原样保留；
 * - 部署后逐个探测引擎在当前网络能否出结果，把不可用的写回 disabled。
 */

export const SEARXNG_CONTAINER = 'wbfm-searxng';
const POLL_INTERVAL_MS = 1_000;
/** 自动生成的配置带此标记；没有标记说明用户手改过，不再自动改写 */
const MANAGED_MARKER = '# managed-by: wbfm';
/**
 * 部署后动态探测的通用引擎：先全部启用，再按探测结果禁用拿不到结果的
 * （国内网络下 google / duckduckgo / brave / wikipedia 基本都会超时）。
 */
const CANDIDATE_ENGINES = [
  'sogou',
  '360search',
  'baidu',
  'bing',
  'google',
  'google cse',
  'duckduckgo',
  'brave',
  'wikipedia',
  'wikidata',
] as const;
const ENGINE_PROBE_QUERY = 'OpenAI';
const ENGINE_PROBE_TIMEOUT_MS = 8_000;
/** 重启后等 SearXNG 重新就绪的预算（比首次就绪短：镜像已在本地） */
const RESTART_READY_TIMEOUT_MS = 30_000;

export interface CommandResult {
  /** -1 表示可执行文件不存在（ENOENT） */
  code: number;
  stdout: string;
  stderr: string;
}

export type RunCommand = (
  file: string,
  args: string[],
  timeoutMs: number,
) => Promise<CommandResult>;

interface EngineOverride {
  name: string;
  disabled: boolean;
}

/** SearXNG 配置：必须显式开启 json，否则 /search 返回 403；带托管标记便于后续自动调优 */
function settingsYaml(engines: readonly EngineOverride[], secretKey: string): string {
  const lines = [
    MANAGED_MARKER,
    'use_default_settings: true',
    'server:',
    `  secret_key: "${secretKey}"`,
    '  limiter: false',
    '  image_proxy: false',
    'search:',
    '  safe_search: 0',
    '  formats:',
    '    - html',
    '    - json',
  ];
  if (engines.length > 0) {
    lines.push('engines:');
    for (const engine of engines) {
      lines.push(`  - name: ${JSON.stringify(engine.name)}`);
      lines.push(`    disabled: ${engine.disabled}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** 候选引擎的启用矩阵：enabled 里的启用，其余禁用 */
function engineOverrides(enabled: readonly string[]): EngineOverride[] {
  const set = new Set(enabled);
  return CANDIDATE_ENGINES.map((name) => ({ name, disabled: !set.has(name) }));
}

function configFile(dataDir: string): string {
  return path.join(dataDir, 'settings.yml');
}

/** 保留已有 secret_key，避免每次调优都让会话失效 */
function readSecretKey(file: string): string | null {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return /secret_key:\s*"([^"]+)"/.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

function writeManagedConfig(dataDir: string, engines: readonly EngineOverride[]): void {
  const file = configFile(dataDir);
  const secret = readSecretKey(file) ?? randomBytes(24).toString('hex');
  fs.writeFileSync(file, settingsYaml(engines, secret), 'utf8');
}

/**
 * 首次部署写入「候选引擎全部启用」的托管配置，等探测后再收窄；
 * 已存在且带托管标记才允许自动改写，用户手改过的文件原样保留。
 */
export function ensureConfigDir(dataDir: string): { managed: boolean } {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = configFile(dataDir);
  if (fs.existsSync(file)) {
    return { managed: fs.readFileSync(file, 'utf8').includes(MANAGED_MARKER) };
  }
  writeManagedConfig(dataDir, engineOverrides(CANDIDATE_ENGINES));
  return { managed: true };
}

/** 单引擎探测：带 engines 过滤请求一次，拿到 results 即视为可用 */
export async function defaultProbeEngine(endpoint: string, engine: string): Promise<boolean> {
  try {
    const url =
      `${endpoint}/search?q=${encodeURIComponent(ENGINE_PROBE_QUERY)}` +
      `&format=json&engines=${encodeURIComponent(engine)}`;
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(ENGINE_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { results?: unknown };
    return Array.isArray(payload.results) && payload.results.length > 0;
  } catch {
    return false;
  }
}

/** 轮询等 JSON 接口就绪 */
export async function waitReady(
  endpoint: string,
  timeoutMs: number,
  probe: (endpoint: string) => Promise<boolean>,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(endpoint)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

/**
 * 动态引擎调优：重启到「候选全开」的配置，逐个探测能否出结果，
 * 再把拿不到结果的引擎写回禁用（国内网络下的 google / ddg / brave 等）。
 * 返回最终启用的引擎列表；空数组表示全部不可用（保留候选全开，等网络恢复）。
 */
export async function tuneEngines(params: {
  dataDir: string;
  endpoint: string;
  run: RunCommand;
  probe: (endpoint: string) => Promise<boolean>;
  probeEngine: (endpoint: string, engine: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
}): Promise<string[]> {
  const { dataDir, endpoint, run, probe, probeEngine, sleep } = params;
  await run('docker', ['restart', SEARXNG_CONTAINER], 60_000);
  if (!(await waitReady(endpoint, RESTART_READY_TIMEOUT_MS, probe, sleep))) {
    return [];
  }
  const flags = await Promise.all(
    CANDIDATE_ENGINES.map((engine) => probeEngine(endpoint, engine)),
  );
  const enabled = CANDIDATE_ENGINES.filter((_, index) => flags[index]);
  if (enabled.length === 0) return [];
  if (enabled.length < CANDIDATE_ENGINES.length) {
    writeManagedConfig(dataDir, engineOverrides(enabled));
    await run('docker', ['restart', SEARXNG_CONTAINER], 60_000);
    await waitReady(endpoint, RESTART_READY_TIMEOUT_MS, probe, sleep);
  }
  return [...enabled];
}
