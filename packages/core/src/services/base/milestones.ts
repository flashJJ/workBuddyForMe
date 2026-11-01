import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';

const SETTINGS_KEY = 'app-settings';

/** v2.4 M1 T7：本地 TTFV 里程碑字段（仅时间戳，不含任何对话内容） */
export type TtfvMilestone = 'firstLaunchAt' | 'firstModelReadyAt' | 'firstAnswerAt';

/**
 * 首写优先的里程碑记录：只记第一次，重复调用直接返回（幂等，可放心在热路径调用）。
 * 启动与首答两个时间戳齐备后顺带补算 ttfvMs（首次启动 → 首次回答）。
 * 直接写 settings JSON（只读一次判断，避免与 settings-service 的默认值合并相互干扰）。
 */
export function recordMilestone(db: DatabaseInstance, key: TtfvMilestone, at: number = Date.now()): void {
  const settings = createSettingsRepository(db);
  const current = settings.getJson<Record<string, unknown>>(SETTINGS_KEY, {});
  if (typeof current[key] === 'number') return;
  const next: Record<string, unknown> = { ...current, [key]: at };
  const launchAt = next.firstLaunchAt;
  const answerAt = next.firstAnswerAt;
  if (typeof launchAt === 'number' && typeof answerAt === 'number') {
    next.ttfvMs = answerAt - launchAt;
  }
  settings.setJson(SETTINGS_KEY, next);
}
