import fs from 'node:fs';
import path from 'node:path';
import { session } from 'electron';

/**
 * 打包态版本变更时清 Electron session，防止升级后旧 bundle 的 JS/CSS 缓存
 * 继续命中新托管服务（前端打旧版端点 / 后端 404）。
 * 清理完成后才写 last-version；失败则留旧标记，下次启动重试。
 * 返回值：是否为首次安装或版本升级（用于日志与兼容旧行为）。
 */
export async function clearSessionIfVersionChanged(
  userDataDir: string,
  currentVersion: string,
): Promise<boolean> {
  const markerPath = path.join(userDataDir, 'last-version');
  let last: string | null = null;
  try {
    if (fs.existsSync(markerPath)) last = fs.readFileSync(markerPath, 'utf8').trim();
  } catch {
    last = null;
  }

  const upgraded = last !== currentVersion;
  if (last !== null && upgraded) {
    console.warn('[wbfm] 版本变更 detected:', last, '→', currentVersion, '，清理 session storage');
    try {
      await session.defaultSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache'],
      });
    } catch (err) {
      console.error('[wbfm] clearStorageData 失败（下次启动重试）:', err);
      return upgraded;
    }
  }

  try {
    fs.writeFileSync(markerPath, currentVersion, 'utf8');
  } catch {
    // userData 不可写时静默降级；下次启动会再试
  }
  return upgraded;
}

/**
 * 首启完整开场是否已真正展示过。
 * 与 last-version 分开：安装器自动拉起、窗口被安装器挡住或用户在画面出现前退出时，
 * last-version 可能已写入，但 intro-seen-version 不会写，下次启动仍会补播完整片。
 */
export function resolveIntroMode(
  userDataDir: string,
  currentVersion: string,
): 'full' | 'compact' {
  const markerPath = path.join(userDataDir, 'intro-seen-version');
  try {
    if (fs.existsSync(markerPath) && fs.readFileSync(markerPath, 'utf8').trim() === currentVersion) {
      return 'compact';
    }
  } catch {
    // 读不到标记按未看过处理
  }
  return 'full';
}

/** 启动画面真正 reveal 后调用；只写本地，失败静默降级 */
export function writeIntroSeen(userDataDir: string, currentVersion: string): void {
  try {
    fs.writeFileSync(path.join(userDataDir, 'intro-seen-version'), currentVersion, 'utf8');
  } catch {
    // userData 不可写时下次仍播完整片
  }
}
