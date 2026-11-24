import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import { workspaceRootsSchema } from '@wbfm/shared/schemas';
import type { SettingsRepository } from '@wbfm/database';

/**
 * v5.1 应用层文件边界：
 * - 默认根 <dataRoot>/workspace；用户可追加最多 8 个根；
 * - 盘根、系统目录、UNC 与数据根敏感目录始终拒绝；
 * - 先 resolve，再对最深已存在祖先 realpath，防止 `..`/符号链接逃逸；
 * - CLI/桌面控制不经过本守卫（见 v5.1 spec Non-Goals）。
 */

const ROOTS_KEY = 'workspace.allowedRoots';
const UNIX_SYSTEM_ROOTS = ['/etc', '/usr', '/bin', '/sbin', '/var'];

type DenyReason = 'system_directory' | 'data_root' | 'outside_workspace';

export interface FileGuardDeps {
  dataRoot: string;
  settings: SettingsRepository;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface FileGuard {
  readonly defaultRoot: string;
  listRoots(): string[];
  setRoots(roots: string[]): string[];
  assertAllowed(target: string): string;
  isAllowed(target: string): boolean;
}

export function createFileGuard(deps: FileGuardDeps): FileGuard {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const caseInsensitive = platform === 'win32';

  mkdirSync(deps.dataRoot, { recursive: true });
  const dataRoot = canonicalize(deps.dataRoot);
  const defaultRoot = join(dataRoot, 'workspace');
  mkdirSync(defaultRoot, { recursive: true });

  const systemRoots = (platform === 'win32'
    ? [env.WINDIR, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData]
    : UNIX_SYSTEM_ROOTS
  )
    .filter((item): item is string => typeof item === 'string' && isAbsolute(item))
    .map((item) => canonicalize(item));

  const same = (a: string, b: string) => (caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b);
  const isWithin = (child: string, root: string) => {
    const c = caseInsensitive ? child.toLowerCase() : child;
    const r = caseInsensitive ? root.toLowerCase() : root;
    return c === r || c.startsWith(r.endsWith(sep) ? r : `${r}${sep}`);
  };

  function deniedReason(target: string): DenyReason | null {
    if (isWithin(target, defaultRoot)) return null;
    if (same(target, parse(target).root)) return 'system_directory';
    if (systemRoots.some((root) => isWithin(target, root))) return 'system_directory';
    if (isWithin(target, dataRoot)) return 'data_root';
    return null;
  }

  function configuredRoots(): string[] {
    const raw = deps.settings.getJson<unknown>(ROOTS_KEY, []);
    const parsed = workspaceRootsSchema.safeParse({ roots: Array.isArray(raw) ? raw : [] });
    if (!parsed.success) return [];
    return parsed.data.roots
      .map((item) => {
        try {
          return canonicalize(item);
        } catch {
          return null;
        }
      })
      .filter((item): item is string => Boolean(item));
  }

  function listRoots(): string[] {
    const seen = new Set<string>();
    const roots: string[] = [];
    for (const root of [defaultRoot, ...configuredRoots()]) {
      const key = caseInsensitive ? root.toLowerCase() : root;
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(root);
    }
    return roots;
  }

  function setRoots(input: string[]): string[] {
    const parsed = workspaceRootsSchema.safeParse({ roots: input });
    if (!parsed.success) {
      throw ApiError.validation(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const raw of parsed.data.roots) {
      const target = normalize(raw);
      if (same(target, defaultRoot)) continue;
      if (deniedReason(target)) {
        throw ApiError.validation(`授权根不能是系统目录或数据根：[file/path-denied:system_directory]`);
      }
      let stats;
      try {
        stats = statSync(target);
      } catch {
        throw ApiError.validation(`授权根不存在：${raw}`);
      }
      if (!stats.isDirectory()) throw ApiError.validation(`授权根不是目录：${raw}`);
      const key = caseInsensitive ? target.toLowerCase() : target;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(target);
    }
    deps.settings.setJson(ROOTS_KEY, normalized);
    return listRoots();
  }

  function normalize(target: string): string {
    const trimmed = target.trim();
    if (!trimmed) throw invalid('路径不能为空');
    if (/^[\\/]{2}/.test(trimmed)) throw invalid('不支持 UNC/网络路径');
    if (!isAbsolute(trimmed)) throw invalid('必须是绝对路径');
    return canonicalize(trimmed);
  }

  function assertAllowed(target: string): string {
    const normalized = normalize(target);
    const reason = deniedReason(normalized);
    if (reason) throw denied(target, reason);
    if (!listRoots().some((root) => isWithin(normalized, root))) {
      throw denied(target, 'outside_workspace');
    }
    return normalized;
  }

  return {
    defaultRoot,
    listRoots,
    setRoots,
    assertAllowed,
    isAllowed: (target) => {
      try {
        assertAllowed(target);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function invalid(message: string): ApiError {
  return new ApiError('FILE_PATH_INVALID', `${message} [file/path-denied:invalid]`);
}

function denied(target: string, reason: DenyReason): ApiError {
  return new ApiError(
    'FILE_PATH_OUTSIDE_WORKSPACE',
    `路径不在授权工作区：${target} [file/path-denied:${reason}]`,
    { reason },
  );
}

/** 对最深已存在祖先做 realpath，再拼回不存在的尾段，防止符号链接逃逸 */
function canonicalize(target: string): string {
  let current = resolve(target);
  const tail: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    tail.unshift(basename(current));
    current = parent;
  }
  let real = current;
  try {
    real = realpathSync.native(current);
  } catch {
    real = current;
  }
  return tail.length > 0 ? join(real, ...tail) : real;
}
