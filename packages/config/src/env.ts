/**
 * 运行时环境变量契约。
 * - WBFM_DATA_ROOT：数据根（Electron 注入）
 * - WBFM_TOKEN：本地服务启动令牌（Electron 生产）
 * - WBFM_SERVER_MANAGED：由 Electron 主进程置 '1'，表示服务受托管（启用令牌校验）
 * - PORT / HOSTNAME：standalone server 监听配置
 */
export const ENV_KEYS = {
  dataRoot: 'WBFM_DATA_ROOT',
  token: 'WBFM_TOKEN',
  managed: 'WBFM_SERVER_MANAGED',
  port: 'PORT',
  hostname: 'HOSTNAME',
} as const;

export interface RuntimeEnv {
  nodeEnv: string;
  isProduction: boolean;
  isManagedServer: boolean;
  dataRoot?: string;
  token?: string;
  port?: number;
  hostname: string;
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** 读取并归一化当前进程环境 */
export function readEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const token = source[ENV_KEYS.token];
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isManagedServer: source[ENV_KEYS.managed] === '1',
    dataRoot: source[ENV_KEYS.dataRoot] || undefined,
    token: token || undefined,
    port: parsePort(source[ENV_KEYS.port]),
    hostname: source[ENV_KEYS.hostname] ?? '127.0.0.1',
  };
}

/** 受托管服务必须提供令牌；否则视为配置错误 */
export function assertManagedToken(env: RuntimeEnv = readEnv()): string {
  if (env.isManagedServer && !env.token) {
    throw new Error('受 Electron 托管的服务必须注入 WBFM_TOKEN');
  }
  return env.token ?? '';
}
