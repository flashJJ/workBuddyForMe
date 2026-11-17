import fs from 'node:fs';
import path from 'node:path';
import { session } from 'electron';

/**
 * 打包态版本变更时清 Electron session，防止升级后旧 bundle 的 JS/CSS 缓存
 * 继续命中新托管服务（前端打旧版端点 / 后端 404）。
 * 清理完成后才写标记；失败则留旧标记，下次启动重试。
 * 返回值：是否为首次安装或版本升级（用于首启完整开场判定）。
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
