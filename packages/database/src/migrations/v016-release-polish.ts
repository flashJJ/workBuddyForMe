import type { Database } from 'better-sqlite3';
import { nowIso } from '../utils/time';

/**
 * v1.2 正式发布打磨迁移（版本 16）。无表结构变更（主题/语言/引导状态均在
 * settings_kv 的 app-settings JSON 内，扩枚举由读取侧 zod 默认值兜底），
 * 唯一任务：**把老用户标记为已完成首启向导**，避免升级后弹出面向新装机的向导。
 *
 * 判定「老用户」：库里已有任何用户痕迹——settings_kv 有任意行，或 conversations
 * 有会话。全新建库（首次安装即跑到 v16 的空库）两者皆空，不写标记，
 * 读取默认 hasOnboarded=false → 首启正常弹向导。幂等：已带字段不重复写。
 */
const SETTINGS_KEY = 'app-settings';

export function migrateV016(db: Database): void {
  const settingCount = db.prepare(`SELECT COUNT(*) AS c FROM settings_kv`).get() as {
    c: number;
  };
  const conversationCount = db.prepare(`SELECT COUNT(*) AS c FROM conversations`).get() as {
    c: number;
  };
  if (settingCount.c === 0 && conversationCount.c === 0) return;

  const row = db.prepare(`SELECT value FROM settings_kv WHERE key = ?`).get(SETTINGS_KEY) as
    | { value: string }
    | undefined;

  let parsed: Record<string, unknown> = {};
  if (row) {
    try {
      const json = JSON.parse(row.value) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      // 损坏的 JSON 不强行覆盖（仓储读取本身有 fallback），老用户标记以默认合并方式在外层保证
      parsed = {};
    }
  }

  // 字段已显式存在（true/false 都是用户/先前迁移的合法态）则不覆盖
  if ('hasOnboarded' in parsed) return;
  parsed.hasOnboarded = true;

  db.prepare(
    `INSERT INTO settings_kv(key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(SETTINGS_KEY, JSON.stringify(parsed), nowIso());
}
