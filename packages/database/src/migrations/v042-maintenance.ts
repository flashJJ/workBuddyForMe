import type { Database } from 'better-sqlite3';

/**
 * v2.14 可维护底座（版本 42，纯加法）：
 * - skill_versions：技能版本快照元数据（目录内容存数据根 skill-versions/）；
 * - skills_state.active_version：当前磁盘内容对应的快照版本；
 * - workflows.published_version：生产运行版本（与 current_version 分离），按历史发布回填。
 */
export function migrateV042(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_versions (
      id TEXT PRIMARY KEY,
      skill_state_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      checksum TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (skill_state_id, version)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_skill_versions_state
      ON skill_versions(skill_state_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_skill_versions_name
      ON skill_versions(name, created_at DESC);
  `);

  const skillColumns = db.prepare('PRAGMA table_info(skills_state)').all() as Array<{ name: string }>;
  if (skillColumns.length > 0 && !skillColumns.some((column) => column.name === 'active_version')) {
    db.exec('ALTER TABLE skills_state ADD COLUMN active_version TEXT');
  }

  const workflowColumns = db.prepare('PRAGMA table_info(workflows)').all() as Array<{
    name: string;
  }>;
  if (
    workflowColumns.length > 0 &&
    !workflowColumns.some((column) => column.name === 'published_version')
  ) {
    db.exec('ALTER TABLE workflows ADD COLUMN published_version INTEGER');
    db.exec(`
      UPDATE workflows SET published_version = (
        SELECT MAX(version) FROM workflow_versions
        WHERE workflow_id = workflows.id AND published_at IS NOT NULL
      )
      WHERE published_version IS NULL
    `);
  }
}
