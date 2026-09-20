import type { DatabaseInstance } from '../client';
import { nowIso } from '../utils/time';

export function createSettingsRepository(db: DatabaseInstance) {
  return {
    getJson<T>(key: string, fallback: T): T {
      const row = db.prepare(`SELECT value FROM settings_kv WHERE key = ?`).get(key) as
        | { value: string }
        | undefined;
      if (!row) return fallback;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return fallback;
      }
    },

    setJson(key: string, value: unknown): void {
      db.prepare(
        `INSERT INTO settings_kv(key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, JSON.stringify(value), nowIso());
    },

    all(): Record<string, unknown> {
      const rows = db.prepare(`SELECT key, value FROM settings_kv`).all() as Array<{
        key: string;
        value: string;
      }>;
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      return result;
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
