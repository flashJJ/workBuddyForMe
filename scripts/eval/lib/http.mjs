/**
 * eval HTTP 底座（v1.1 M5 从 eval-memory 抽出）：
 * 统一 {success,data} 信封解包与错误归一，所有 eval 脚本共用。
 */

/**
 * JSON API 调用：成功返回 envelope.data；非 2xx 或 success=false 抛带错误码的 Error。
 * @param {string} baseUrl
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function api(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const detail = payload?.error ? `${payload.error.code}: ${payload.error.message}` : response.status;
    throw new Error(`${init.method ?? 'GET'} ${path} 失败（${detail}）`);
  }
  return payload.data;
}

/** 解析 --k=v / --flag 风格 CLI 参数（eval 脚本通用子集） */
export function parseArgs(argv, schema) {
  const args = { ...schema.defaults };
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      if (Object.hasOwn(schema.flags, arg)) args[schema.flags[arg]] = true;
    } else {
      const key = arg.slice(0, eq);
      const value = arg.slice(eq + 1);
      if (Object.hasOwn(schema.values, key)) args[schema.values[key]] = value;
    }
  }
  return args;
}
