import fs from 'node:fs';
import path from 'node:path';

/**
 * 自动更新本地偏好（与 GitHub Releases 通道选择 / 上次检查时间）。
 *
 * 纯 I/O 函数，不依赖 electron：可在 vitest 中以临时目录直接验证。
 * 状态文件为 userData 目录下 updater-state.json（mode 0o600）。
 */
export type UpdateChannel = 'stable' | 'beta';

export interface UpdaterState {
  /** 更新通道：beta 对应 autoUpdater.allowPrerelease=true */
  channel: UpdateChannel;
  /** 上次检查时间（ISO 字符串）；未检查为 null */
  lastCheckAt: string | null;
}

export const DEFAULT_UPDATER_STATE: UpdaterState = {
  channel: 'stable',
  lastCheckAt: null,
};

export function isUpdateChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'beta';
}

/** 合法 ISO 时间字符串校验（lastCheckAt 不接受任意字符串） */
export function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(Date.parse(value));
}

/** 合并已读取的 JSON 与默认值；非法字段回落默认，绝不抛错 */
export function normalizeUpdaterState(raw: unknown): UpdaterState {
  const fallback = { ...DEFAULT_UPDATER_STATE };
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  if (isUpdateChannel(obj.channel)) fallback.channel = obj.channel;
  if (obj.lastCheckAt === null || isIsoTimestamp(obj.lastCheckAt)) {
    fallback.lastCheckAt = obj.lastCheckAt as string | null;
  }
  return fallback;
}

/** 读状态文件：不存在或损坏一律返回默认（首次启动等价于 stable + 未检查） */
export function readUpdaterState(filePath: string): UpdaterState {
  try {
    const buf = fs.readFileSync(filePath, 'utf8');
    return normalizeUpdaterState(JSON.parse(buf));
  } catch {
    return { ...DEFAULT_UPDATER_STATE };
  }
}

/** 原子写：先写 .tmp 再 rename，避免崩溃产生半截 JSON */
export function writeUpdaterState(filePath: string, state: UpdaterState): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/** 更新上次检查时间并落盘，返回新状态 */
export function bumpLastCheck(filePath: string, iso: string): UpdaterState {
  const next: UpdaterState = { ...readUpdaterState(filePath), lastCheckAt: iso };
  writeUpdaterState(filePath, next);
  return next;
}

/** 切换通道并落盘，返回新状态 */
export function setChannel(filePath: string, channel: UpdateChannel): UpdaterState {
  const next: UpdaterState = { ...readUpdaterState(filePath), channel };
  writeUpdaterState(filePath, next);
  return next;
}
