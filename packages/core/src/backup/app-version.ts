import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 读根 package.json 的 version 字段（备份 manifest / 分享水印需要）。
 *
 * 运行形态多样，模块文件位置不固定：
 * - vitest 源文件：packages/core/src/<module>/app-version.ts
 * - tsup 单文件 bundle：packages/core/dist/index.*
 * - Next 打包（dev/start）：模块可能被打进 apps/web/.next/server/… 深层目录
 * 因此从模块目录逐级向上查找 name === 'workbuddy-for-me' 的 package.json，
 * 最多向上 10 层；中途遇到的 apps/* 私有包不作为根版本。
 */
let cached: string | null = null;
const ROOT_PACKAGE_NAME = 'workbuddy-for-me';
const MAX_WALK_DEPTH = 10;

function getModuleDir(): string {
  // typeof 对未声明标识符不抛 ReferenceError（ESM 下 __dirname 不存在）
  const cjsDir = typeof __dirname !== 'undefined' ? __dirname : null;
  if (cjsDir) return cjsDir;
  return path.dirname(fileURLToPath(import.meta.url));
}

function findRootVersion(): string {
  let dir = getModuleDir();
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth += 1) {
    const pkgPath = path.join(dir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === ROOT_PACKAGE_NAME && pkg.version) return pkg.version;
    } catch {
      // 当前层没有 package.json（或不可读），继续向上
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'unknown';
}

export function getAppVersion(): string {
  if (cached === null) cached = findRootVersion();
  return cached;
}
