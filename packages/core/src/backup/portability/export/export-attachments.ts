import fs from 'node:fs';
import path from 'node:path';
import {
  createAttachmentRefRepository,
  createAttachmentRepository,
  type DatabaseInstance,
} from '@wbfm/database';

export interface AttachmentsTrackPayload {
  files: Record<string, string>;
  binaries: Array<{ name: string; data: Buffer }>;
  /** 归档内实际存在的附件文件数 */
  entryCount: number;
  /** 附件行总数（进度分母，含文件缺失的行） */
  totalCount: number;
  totalBytes: number;
  /** v2.33：refs.json 引用条数 */
  refCount: number;
}

/**
 * v2.33：attachments 轨序列化（元数据 + refs.json + 已存在文件）。
 * v2.34：可选 since——增量只带该时间之后新建的附件行及其二进制与引用。
 * 引用文件为可选负载：旧归档缺 refs.json 时恢复端按启动回填补齐。
 */
export function serializeAttachmentsTrack(
  db: DatabaseInstance,
  dataRoot: string,
  since?: string,
): AttachmentsTrackPayload {
  const rows = createAttachmentRepository(db)
    .list()
    .filter((row) => !since || row.created_at > since);
  const keptIds = new Set(rows.map((row) => row.id));
  const refs = createAttachmentRefRepository(db)
    .list()
    .filter((ref) => keptIds.has(ref.attachmentId));
  const attDir = path.join(dataRoot, 'attachments');
  const files: Record<string, string> = {};
  const binaries: Array<{ name: string; data: Buffer }> = [];
  const serialized = [];
  let totalBytes = 0;

  for (const row of rows) {
    serialized.push({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      storagePath: row.storage_path,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    });
    const filePath = path.join(attDir, row.storage_path);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      binaries.push({ name: `attachments/${row.storage_path}`, data });
      totalBytes += data.length;
    }
  }

  files['attachments.json'] = JSON.stringify(serialized, null, 2);
  files['refs.json'] = JSON.stringify(refs, null, 2);

  return {
    files,
    binaries,
    entryCount: binaries.length,
    totalCount: rows.length,
    totalBytes,
    refCount: refs.length,
  };
}
