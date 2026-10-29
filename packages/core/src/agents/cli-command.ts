import { statSync } from 'node:fs';
import { delimiter, isAbsolute, parse, resolve, sep } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';

/**
 * v2.11 外部代理命令解析与工作目录校验（纯本地，不联网）。
 * - 命令必须能解析为真实文件；不经 shell；
 * - cwd 必须显式存在且为目录；拒绝系统目录、应用数据目录与 UNC。
 */

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface ResolveCommandOptions {
  platform?: NodeJS.Platform;
  pathEnv?: string;
  pathExt?: string;
}

/** 解析命令：含分隔符按路径；否则遍历 PATH（Windows 追加 PATHEXT） */
export function resolveCommandPath(
  command: string,
  options: ResolveCommandOptions = {},
): string | null {
  const platform = options.platform ?? process.platform;
  const trimmed = command.trim();
  if (!trimmed) return null;
  const hasSeparator = trimmed.includes('/') || trimmed.includes('\\');
  if (hasSeparator) {
    const candidate = resolve(trimmed);
    if (platform === 'win32' && /\.(bat|cmd)$/i.test(candidate)) return null;
    return isFile(candidate) ? candidate : null;
  }
  const pathEnv = options.pathEnv ?? process.env.PATH ?? '';
  const extensions =
    platform === 'win32'
      ? (options.pathExt ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          // shell:false 下 Node 无法直接 spawn 批处理脚本；.bat/.cmd 视为不可用（fail-closed）
          .filter((extension) => !/^\.(bat|cmd)$/i.test(extension))
      : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = resolve(dir, `${trimmed}${extension}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

function isInside(target: string, root: string): boolean {
  const base = resolve(root);
  const normalized = resolve(target);
  if (normalized.toLowerCase() === base.toLowerCase()) return true;
  return normalized.toLowerCase().startsWith(`${base.toLowerCase()}${sep}`);
}

const UNIX_FORBIDDEN = new Set(['/', '/etc', '/usr']);
const WINDOWS_FORBIDDEN_SEGMENTS = new Set(['windows', 'system32']);

export interface ValidateCwdOptions {
  platform?: NodeJS.Platform;
  /** 应用数据根目录（不允许外部代理在其中运行） */
  dataRoot?: string;
}

/** 校验工作目录；不合法抛 422（fail-closed） */
export function validateSubagentCwd(raw: string, options: ValidateCwdOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const trimmed = raw.trim();
  if (!trimmed) throw ApiError.validation('工作目录不能为空');
  if (trimmed.startsWith('\\\\')) throw ApiError.validation('不允许 UNC 路径');
  if (!isAbsolute(trimmed)) throw ApiError.validation('工作目录必须是绝对路径');

  const resolved = resolve(trimmed);
  if (!isDirectory(resolved)) throw ApiError.validation(`工作目录不存在或不是目录：${trimmed}`);

  const root = parse(resolved).root;
  if (resolved.toLowerCase() === root.toLowerCase()) {
    throw ApiError.validation('不允许在系统盘根目录运行外部代理');
  }
  if (platform === 'win32') {
    const segments = resolved
      .split(sep)
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());
    if (segments.some((segment) => WINDOWS_FORBIDDEN_SEGMENTS.has(segment))) {
      throw ApiError.validation('不允许在 Windows 系统目录运行外部代理');
    }
  } else if (UNIX_FORBIDDEN.has(resolved)) {
    throw ApiError.validation('不允许在系统目录运行外部代理');
  }
  if (options.dataRoot && isInside(resolved, options.dataRoot)) {
    throw ApiError.validation('不允许在应用数据目录运行外部代理');
  }
  return resolved;
}
