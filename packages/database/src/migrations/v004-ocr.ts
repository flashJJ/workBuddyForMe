import type { Database } from 'better-sqlite3';

/**
 * v0.4 图片型 PDF OCR 迁移（版本 4）。只做加法：
 * - documents.ocr_status：null=非 OCR 来源；running/done/failed/skipped；
 * - documents.ocr_engine：vision（视觉模型）/ tesseract（WASM 兜底）。
 * 已存在的文档行两列均为 NULL，不影响原有索引与检索逻辑。
 */
export function migrateV004(db: Database): void {
  db.exec(`ALTER TABLE documents ADD COLUMN ocr_status TEXT`);
  db.exec(`ALTER TABLE documents ADD COLUMN ocr_engine TEXT`);
}
