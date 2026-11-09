/**
 * v2.32 M3：产物批量打包。
 * 接收产物 id 列表，读取 attachments 行与落盘文件，打包为 tar.gz（含 manifest.json）。
 * 上限 100 条 / 200MB；超限在读取文件前拒绝，不产生半份归档。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createAttachmentRepository, type AttachmentRow } from '@wbfm/database';
import type { DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { ARTIFACT_MIME_BY_FORMAT } from '@wbfm/shared/constants';
import { packEntries } from '../export-archive';

export const ARTIFACT_BATCH_MAX_COUNT = 100;
export const ARTIFACT_BATCH_MAX_BYTES = 200 * 1024 * 1024;

export interface ArtifactBatchEntry {
  id: string;
  title: string;
  format: string;
  bytes: number;
  conversationId: string | null;
  createdAt: string;
  archivePath: string;
}

export interface ArtifactBatchManifest {
  formatVersion: number;
  exportedAt: string;
  count: number;
  totalBytes: number;
  entries: ArtifactBatchEntry[];
}

export interface ArtifactBatchResult {
  archive: Buffer;
  manifest: ArtifactBatchManifest;
  count: number;
  totalBytes: number;
}

const FORMAT_BY_MIME = new Map<string, string>(
  Object.entries(ARTIFACT_MIME_BY_FORMAT).map(([format, mime]) => [mime, format]),
);

/** 归档内文件名：去路径分隔符与控制字符，加序号避免同名覆盖 */
function archiveName(index: number, filename: string, mimeType: string): string {
  const cleaned = Array.from(filename)
    .map((ch) => {
      if (ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(ch)) return '-';
      return ch;
    })
    .join('')
    .replace(/^\.+/, '')
    .trim();
  const safe = cleaned || `artifact.${mimeType.split('/')[1] ?? 'bin'}`;
  return `artifacts/${String(index + 1).padStart(3, '0')}-${safe}`;
}

/** 归属会话：最佳努力从消息多模态片段中反查（产物表本身不存会话 id） */
function findConversationId(db: DatabaseInstance, attachmentId: string): string | null {
  const row = db
    .prepare(`SELECT conversation_id FROM messages WHERE content_parts LIKE ? LIMIT 1`)
    .get(`%${attachmentId}%`) as { conversation_id: string } | undefined;
  return row?.conversation_id ?? null;
}

/**
 * 批量导出产物。所有校验在读取文件前完成：数量、类型、总字节。
 */
export async function exportArtifactsBatch(
  db: DatabaseInstance,
  ids: string[],
): Promise<ArtifactBatchResult> {
  if (ids.length === 0) throw ApiError.validation('请至少选择一个产物');
  if (ids.length > ARTIFACT_BATCH_MAX_COUNT) {
    throw ApiError.validation(`单次最多打包 ${ARTIFACT_BATCH_MAX_COUNT} 个产物，当前 ${ids.length} 个`);
  }

  const repo = createAttachmentRepository(db);
  const rows: AttachmentRow[] = ids.map((id) => {
    const row = repo.findRowById(id);
    if (!row) throw ApiError.validation(`产物不存在或已被删除：${id}`);
    if (!FORMAT_BY_MIME.has(row.mime_type)) {
      throw ApiError.validation(`附件不是可打包产物：${id}`);
    }
    return row;
  });

  const totalBytes = rows.reduce((sum, row) => sum + row.byte_size, 0);
  if (totalBytes > ARTIFACT_BATCH_MAX_BYTES) {
    const mb = (totalBytes / 1024 / 1024).toFixed(1);
    throw ApiError.validation(`单次打包不能超过 200MB，当前约 ${mb}MB`);
  }

  const dir = getDataDir('attachments');
  const entries: ArtifactBatchEntry[] = [];
  const payloads: Array<{ name: string; data: Buffer }> = [];
  rows.forEach((row, index) => {
    const filePath = path.join(dir, row.storage_path);
    if (!fs.existsSync(filePath)) {
      throw ApiError.validation(`产物文件缺失：${row.filename}`);
    }
    const name = archiveName(index, row.filename, row.mime_type);
    payloads.push({ name, data: fs.readFileSync(filePath) });
    entries.push({
      id: row.id,
      title: row.filename,
      format: FORMAT_BY_MIME.get(row.mime_type)!,
      bytes: row.byte_size,
      conversationId: findConversationId(db, row.id),
      createdAt: row.created_at,
      archivePath: name,
    });
  });

  const manifest: ArtifactBatchManifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    count: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
  };

  const archive = await packEntries([
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    ...payloads,
  ]);
  return { archive, manifest, count: entries.length, totalBytes: manifest.totalBytes };
}
