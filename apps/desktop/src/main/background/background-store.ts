/**
 * v4.4 M2：背景文件存储（纯函数，便于单测）。
 *
 * 目录固定在 `<dataRoot>/backgrounds`，与托管服务的 `WBFM_DATA_ROOT` 一致，
 * 因此 Web 侧可以直接按 id 读取，不需要把真实路径传给渲染层。
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  BackgroundFileKind,
  WbfmBackgroundFile,
  WbfmBackgroundPickResult,
} from '@wbfm/shared/background';
import {
  BACKGROUND_FILE_KIND_BY_EXT,
  isBackgroundFileId,
} from '@wbfm/shared/background';

export const BACKGROUND_DIR_NAME = 'backgrounds';
export const BACKGROUND_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const BACKGROUND_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const EXT_KIND = BACKGROUND_FILE_KIND_BY_EXT;

export const isBackgroundId = isBackgroundFileId;

export function resolveBackgroundDir(dataRoot: string): string {
  return path.join(dataRoot, BACKGROUND_DIR_NAME);
}

/** 按内容头判定类型，扩展名不可信 */
export function sniffBackgroundKind(head: Buffer): BackgroundFileKind | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image';
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    return 'image';
  }
  if (head.length >= 8 && head.toString('ascii', 4, 8) === 'ftyp') return 'video';
  return null;
}

export interface BackgroundLimits {
  imageBytes?: number;
  videoBytes?: number;
}

function readHead(filePath: string, bytes = 12): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** 选择后复制；取消由调用方处理，这里只处理已选中的路径 */
export function copyBackground(
  dir: string,
  sourcePath: string,
  limits: BackgroundLimits = {},
): WbfmBackgroundPickResult {
  const ext = path.extname(sourcePath).slice(1).toLowerCase();
  const extKind = EXT_KIND[ext];
  if (!extKind) return { canceled: false, reason: 'unsupported' };

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    return { canceled: false, reason: 'copy-failed' };
  }
  if (!stat.isFile()) return { canceled: false, reason: 'unsupported' };

  const maxBytes =
    extKind === 'video'
      ? (limits.videoBytes ?? BACKGROUND_VIDEO_MAX_BYTES)
      : (limits.imageBytes ?? BACKGROUND_IMAGE_MAX_BYTES);
  if (stat.size > maxBytes) return { canceled: false, reason: 'too-large' };

  let kind: BackgroundFileKind | null = null;
  try {
    kind = sniffBackgroundKind(readHead(sourcePath));
  } catch {
    return { canceled: false, reason: 'copy-failed' };
  }
  if (kind !== extKind) return { canceled: false, reason: 'unsupported' };

  const id = `${randomUUID()}.${ext}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(dir, id));
  } catch {
    return { canceled: false, reason: 'copy-failed' };
  }
  return {
    canceled: false,
    file: { id, kind: extKind, name: path.basename(sourcePath), bytes: stat.size },
  };
}

/** 列出受控目录内的背景；非法文件名直接忽略 */
export function listBackgrounds(dir: string): WbfmBackgroundFile[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: WbfmBackgroundFile[] = [];
  for (const name of names.sort()) {
    if (!isBackgroundId(name)) continue;
    const ext = path.extname(name).slice(1).toLowerCase();
    const kind = EXT_KIND[ext];
    if (!kind) continue;
    try {
      const stat = fs.statSync(path.join(dir, name));
      if (!stat.isFile()) continue;
      out.push({ id: name, kind, name, bytes: stat.size });
    } catch {
      // 单文件读取失败不影响列表
    }
  }
  return out;
}

/** 删除副本；id 不合法或文件不存在返回 false */
export function removeBackground(dir: string, id: string): boolean {
  if (!isBackgroundId(id)) return false;
  try {
    fs.unlinkSync(path.join(dir, id));
    return true;
  } catch {
    return false;
  }
}
