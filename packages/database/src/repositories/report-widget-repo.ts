import type { DatabaseInstance } from '../client';
import { nowIso } from './mappers';

export interface ReportWidgetView {
  id: string;
  packId: string;
  title: string;
  configJson: string;
  enabled: boolean;
  createdAt: string;
}

interface ReportWidgetRow {
  id: string;
  pack_id: string;
  title: string;
  config_json: string;
  enabled: number;
  created_at: string;
}

function mapRow(row: ReportWidgetRow): ReportWidgetView {
  return {
    id: row.id,
    packId: row.pack_id,
    title: row.title,
    configJson: row.config_json,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

/** v2.11：能力包声明式报告卡片（表由迁移 v040 建立） */
export function createReportWidgetRepository(db: DatabaseInstance) {
  return {
    create(input: { id: string; packId: string; title: string; configJson: string }): ReportWidgetView {
      db.prepare(
        `INSERT INTO report_widgets(id, pack_id, title, config_json, enabled, created_at)
         VALUES (@id, @packId, @title, @configJson, 1, @ts)`,
      ).run({ ...input, ts: nowIso() });
      return this.get(input.id)!;
    },

    get(id: string): ReportWidgetView | null {
      const row = db
        .prepare('SELECT * FROM report_widgets WHERE id = ?')
        .get(id) as ReportWidgetRow | undefined;
      return row ? mapRow(row) : null;
    },

    listEnabled(): ReportWidgetView[] {
      const rows = db
        .prepare('SELECT * FROM report_widgets WHERE enabled = 1 ORDER BY created_at ASC')
        .all() as ReportWidgetRow[];
      return rows.map(mapRow);
    },

    remove(id: string): void {
      db.prepare('DELETE FROM report_widgets WHERE id = ?').run(id);
    },
  };
}

export type ReportWidgetRepository = ReturnType<typeof createReportWidgetRepository>;
