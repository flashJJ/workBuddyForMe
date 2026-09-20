import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 全局数据根解析 —— 整个仓库唯一允许决定数据存放位置的模块（ADR：集中式路径事实源）。
 *
 * 优先级：
 *   1. 测试注入 setDataRootForTest()（仅测试使用）
 *   2. 环境变量 WBFM_DATA_ROOT（Electron 主进程注入 userData）
 *   3. 默认 ~/.workbuddy-for-me
 */
export const DATA_DIR_NAME = '.workbuddy-for-me';
export const DATA_ROOT_ENV = 'WBFM_DATA_ROOT';

let testOverrideRoot: string | null = null;

/** 仅供测试：将数据根重定向到临时目录 */
export function setDataRootForTest(root: string): void {
  testOverrideRoot = root;
}

/** 仅供测试：清除测试覆盖，恢复环境/默认解析 */
export function resetDataRootForTest(): void {
  testOverrideRoot = null;
}

/** 获取数据根目录（不保证目录已创建） */
export function getDataRoot(): string {
  if (testOverrideRoot) return testOverrideRoot;
  const fromEnv = process.env[DATA_ROOT_ENV];
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return join(homedir(), DATA_DIR_NAME);
}

/** 拼接数据根内的相对路径 */
export function resolveDataPath(...segments: string[]): string {
  return join(getDataRoot(), ...segments);
}
