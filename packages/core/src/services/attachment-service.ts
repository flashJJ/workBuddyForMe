import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_IMAGE_MIME,
  ApiError,
  MAX_IMAGE_BYTES,
  type Attachment,
} from '@wbfm/shared';
import { getDataDir } from '@wbfm/config';
import {
  attachmentStorageName,
  createAttachmentRepository,
  mapAttachment,
  type AttachmentRow,
} from '@wbfm/database';
import { createHash } from 'node:crypto';
import type { ServiceDeps } from './deps';

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  buffer: Uint8Array;
}

export interface ResolvedImage {
  attachmentId: string;
  mimeType: string;
  dataBase64: string;
}

function hashBuffer(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 聊天图片附件服务：校验 → 落盘 attachments/<id>.<ext> → 元数据入库。
 * 与 v0.1 文档上传同一威胁模型：本机单用户、明文落盘、不外传。
 */
export function createAttachmentService(deps: ServiceDeps) {
  const repo = createAttachmentRepository(deps.db);
  const dir = getDataDir('attachments');
  // 服务自建即确保目录存在（ensureDataDirs 之外的幂等兜底，单测也依赖）
  mkdirSync(dir, { recursive: true });

  const validate = (input: AttachmentInput): void => {
    if (!ALLOWED_IMAGE_MIME.includes(input.mimeType as (typeof ALLOWED_IMAGE_MIME)[number])) {
      throw ApiError.validation(`不支持的图片类型：${input.mimeType}（仅支持 png / jpeg / webp）`);
    }
    if (input.buffer.byteLength === 0) throw ApiError.validation('图片内容为空');
    if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw ApiError.validation('图片超过 10MB 上限');
    }
  };

  return {
    /** 保存附件；同内容 hash 直接复用既有记录与文件（秒传去重） */
    save(input: AttachmentInput): Attachment {
      validate(input);
      const contentHash = hashBuffer(input.buffer);
      const existing = repo.findByHash(contentHash);
      if (existing) return mapAttachment(existing);

      const created = repo.create({
        filename: input.filename,
        mimeType: input.mimeType,
        byteSize: input.buffer.byteLength,
        contentHash,
      });
      writeFileSync(join(dir, attachmentStorageName(created.id, input.mimeType)), input.buffer);
      return mapAttachment(created);
    },

    requireRowsByIds(ids: string[]): AttachmentRow[] {
      const rows = repo.listRowsByIds(ids);
      if (rows.length !== ids.length) {
        const found = new Set(rows.map((row) => row.id));
        const missing = ids.find((id) => !found.has(id));
        throw ApiError.validation(`图片附件不存在或已被清理：${missing ?? ''}`);
      }
      return rows;
    },

    /** 读取文件并转 base64（编排器组装 vision wire 用） */
    loadImages(ids: string[]): ResolvedImage[] {
      return this.requireRowsByIds(ids).map((row) => ({
        attachmentId: row.id,
        mimeType: row.mime_type,
        dataBase64: Buffer.from(readFileSync(join(dir, row.storage_path))).toString('base64'),
      }));
    },

    /** 单张读取（附件回流 API 用）；不存在抛 404 */
    read(id: string): { attachment: Attachment; mimeType: string; buffer: Buffer } {
      const row = repo.findRowById(id);
      if (!row) throw ApiError.notFound('附件', id);
      return {
        attachment: mapAttachment(row),
        mimeType: row.mime_type,
        buffer: readFileSync(join(dir, row.storage_path)),
      };
    },
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
