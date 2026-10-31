import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { getDataRoot, getHomeDir } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';

/**
 * v2.13 M1：工作目录校验。
 * - 绝对路径、存在且是目录；
 * - realpath 解析后再校验（防符号链接逃逸）；
 * - 拒绝盘符根 / 系统目录 / 用户主目录根 / 应用数据根；
 * - Windows 路径比较不区分大小写，POSIX 区分。
 */

export interface WorkspaceValidationOptions {
  dataRoot?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

function pathApi(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function normalizeForCompare(value: string, platform: NodeJS.Platform): string {
  const api = pathApi(platform);
  const normalized = api.normalize(value);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** target 是否位于 root 内（含 root 自身） */
export function isPathInside(
  root: string,
  target: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const api = pathApi(platform);
  const base = normalizeForCompare(api.resolve(root), platform);
  const candidate = normalizeForCompare(api.resolve(target), platform);
  if (candidate === base) return true;
  if (base === (platform === 'win32' ? '\\' : '/')) return candidate.startsWith(base);
  const sep = platform === 'win32' ? '\\' : '/';
  return candidate.startsWith(`${base}${sep}`);
}

function systemRoots(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    return [
      process.env.SystemRoot || 'C:\\Windows',
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      process.env.ProgramData || 'C:\\ProgramData',
      'C:\\',
    ];
  }
  return ['/', '/usr', '/etc', '/var', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys'];
}

function invalidWorkspace(message: string): ApiError {
  return ApiError.validation(message, { code: 'WORKSPACE_INVALID' });
}

/**
 * 校验并返回 realpath 归一化后的工作目录。
 * 失败抛 422 WORKSPACE_INVALID（服务端最终裁决）。
 */
export function resolveWorkspacePath(
  input: string,
  options: WorkspaceValidationOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const api = pathApi(platform);
  const raw = input.trim();
  if (!raw) throw invalidWorkspace('工作目录不能为空');
  if (!api.isAbsolute(raw)) throw invalidWorkspace('工作目录必须是绝对路径');

  const normalized = api.normalize(raw);
  if (!api.isAbsolute(normalized)) throw invalidWorkspace('工作目录归一化后不是绝对路径');

  let real: string;
  try {
    if (!statSync(normalized).isDirectory()) throw invalidWorkspace('工作目录不是文件夹');
    real = realpathSync(normalized);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidWorkspace('工作目录不存在或不可读');
  }

  const resolved = {
    dataRoot: options.dataRoot ?? getDataRoot(),
    homeDir: options.homeDir ?? getHomeDir(),
    platform,
  };
  const same = (left: string, right: string) =>
    normalizeForCompare(api.resolve(left), platform) ===
    normalizeForCompare(api.resolve(right), platform);
  if (same(real, resolved.homeDir)) {
    throw invalidWorkspace('工作目录不能是用户主目录根');
  }
  if (isPathInside(resolved.dataRoot, real, platform)) {
    throw invalidWorkspace('工作目录不能位于应用数据目录');
  }
  for (const root of systemRoots(platform)) {
    const isFilesystemRoot = platform === 'win32' ? root === 'C:\\' : root === '/';
    if (isFilesystemRoot ? same(real, root) : isPathInside(root, real, platform)) {
      throw invalidWorkspace('工作目录不能是系统目录');
    }
  }
  return real;
}

/** 校验失败时抛 403 WORKSPACE_ESCAPE；返回归一化后的目标路径 */
export function assertPathInsideWorkspace(
  workspacePath: string,
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const api = pathApi(platform);
  const candidate = api.isAbsolute(targetPath)
    ? api.resolve(targetPath)
    : api.resolve(workspacePath, targetPath);
  if (!isPathInside(workspacePath, candidate, platform)) {
    throw new ApiError('FORBIDDEN', '目标路径不在工作目录内', { code: 'WORKSPACE_ESCAPE' });
  }
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
}

/** 敏感目录名（默认拒绝；工作目录内也不放行） */
export const DEFAULT_SENSITIVE_PATH_NAMES = ['.ssh', '.gnupg', '.aws', '.config/gcloud'] as const;

export function isSensitivePath(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, '/').toLowerCase();
  return DEFAULT_SENSITIVE_PATH_NAMES.some((name) => {
    const suffix = name.toLowerCase();
    return normalized.includes(`${suffix}/`) || normalized.endsWith(suffix);
  });
}
