import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { canonicalJson } from '@wbfm/shared/schemas';

interface FileFingerprint {
  path: string;
  size: number;
  sha256: string;
}

interface DigestState {
  sizeBytes: number;
  maxBytes: number;
  tooLarge: boolean;
}

export interface DirectoryDigest {
  checksum: string;
  sizeBytes: number;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 版本号进入目录名前的净化；出现非法字符时追加短哈希避免碰撞 */
export function versionDirName(version: string): string {
  const safe = version.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (safe === version && safe !== '' && safe !== '.' && safe !== '..') return safe;
  return `${safe || 'v'}-${sha256(version).slice(0, 8)}`;
}

function walkDirectory(
  root: string,
  current: string,
  files: FileFingerprint[],
  state: DigestState,
): void {
  for (const dirent of readdirSync(current, { withFileTypes: true })) {
    if (state.tooLarge) return;
    const full = join(current, dirent.name);
    if (dirent.isDirectory()) {
      walkDirectory(root, full, files, state);
      continue;
    }
    if (!dirent.isFile()) continue;
    const size = statSync(full).size;
    state.sizeBytes += size;
    if (state.sizeBytes > state.maxBytes) {
      state.tooLarge = true;
      return;
    }
    const rel = relative(root, full).split(sep).join('/');
    files.push({ path: rel, size, sha256: sha256(readFileSync(full)) });
  }
}

/** 目录指纹：路径升序 + 单文件 sha256 + canonical JSON 再哈希；超限返回 null */
export function digestDirectory(root: string, maxBytes: number): DirectoryDigest | null {
  if (!existsSync(root)) return null;
  const files: FileFingerprint[] = [];
  const state: DigestState = { sizeBytes: 0, maxBytes, tooLarge: false };
  walkDirectory(root, root, files, state);
  if (state.tooLarge) return null;
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { checksum: sha256(canonicalJson({ files })), sizeBytes: state.sizeBytes };
}

export function directorySize(root: string): number {
  if (!existsSync(root)) return 0;
  let total = 0;
  for (const dirent of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, dirent.name);
    if (dirent.isDirectory()) total += directorySize(full);
    else if (dirent.isFile()) total += statSync(full).size;
  }
  return total;
}

/** 复制目录到目标（先写临时目录再换位，失败不破坏目标） */
export function copySnapshot(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${randomUUID()}`;
  rmSync(temp, { recursive: true, force: true });
  try {
    cpSync(source, temp, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}
