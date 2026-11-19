import { readFileSync, statSync } from 'node:fs';
import type { MockScenarioFile } from '@wbfm/ai';

/**
 * v4.11 P0：从 `WBFM_MOCK_SCENARIO` 读取场景化 mock 剧本。
 * 仅测试/验收进程会设置该变量；生产未设置时零开销。
 * 按 path + mtime 缓存，便于本地改剧本后无需重启服务（mtime 变化即重载）。
 */
let cache: { path: string; mtimeMs: number; file: MockScenarioFile } | null = null;

export function loadMockScenarioFromEnv(): MockScenarioFile | undefined {
  const path = process.env.WBFM_MOCK_SCENARIO?.trim();
  if (!path) return undefined;
  const mtimeMs = statSync(path).mtimeMs;
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.file;
  const file = JSON.parse(readFileSync(path, 'utf-8')) as MockScenarioFile;
  cache = { path, mtimeMs, file };
  return file;
}
