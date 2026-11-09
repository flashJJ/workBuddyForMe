import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  ARTIFACT_EXTENSION_BY_FORMAT,
  ARTIFACT_FILENAME_MAX,
  ARTIFACT_MAX_BYTES,
  ARTIFACT_MIME_BY_FORMAT,
  ARTIFACT_TITLE_MAX,
} from '@wbfm/shared/constants';
import { ApiError } from '@wbfm/shared/errors';
import { type ArtifactRef, type ArtifactWriteInput, type Attachment } from '@wbfm/shared/types';
import { getDataDir } from '@wbfm/config';
import {
  attachmentStorageName,
  createAttachmentRepository,
  mapAttachment,
  type AttachmentRow,
} from '@wbfm/database';
import { createHash } from 'node:crypto';
import type { ServiceDeps } from '../base/deps';

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

const ARTIFACT_MIME_SET = new Set(Object.values(ARTIFACT_MIME_BY_FORMAT));

/** 产物文件名：去路径/非法字符，强制格式扩展名 */
function artifactFilename(filename: string, format: ArtifactWriteInput['format']): string {
  const cleaned = filename
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ');
  if (!cleaned) throw ApiError.validation('产物文件名不能为空');
  const limited = cleaned.slice(0, ARTIFACT_FILENAME_MAX);
  const extension = ARTIFACT_EXTENSION_BY_FORMAT[format];
  return limited.toLowerCase().endsWith(`.${extension}`)
    ? limited
    : `${limited}.${extension}`;
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

    /** v2.18：保存 Agent 产物（html/svg/md），复用 attachments 表与目录；不做图片校验 */
    saveArtifact(input: ArtifactWriteInput): ArtifactRef {
      const title = input.title.trim();
      if (!title || title.length > ARTIFACT_TITLE_MAX) {
        throw ApiError.validation(`产物标题必须为 1–${ARTIFACT_TITLE_MAX} 字`);
      }
      const bytes = Buffer.from(input.content, 'utf8');
      if (bytes.byteLength === 0) throw ApiError.validation('产物内容为空');
      if (bytes.byteLength > ARTIFACT_MAX_BYTES) {
        throw ApiError.validation('产物超过 2MB 上限');
      }
      const filename = artifactFilename(input.filename, input.format);
      const mimeType = ARTIFACT_MIME_BY_FORMAT[input.format];
      const created = repo.create({
        filename,
        mimeType,
        byteSize: bytes.byteLength,
        contentHash: hashBuffer(bytes),
      });
      const filePath = join(dir, attachmentStorageName(created.id, mimeType));
      try {
        writeFileSync(filePath, bytes);
      } catch (error) {
        repo.remove(created.id);
        rmSync(filePath, { force: true });
        throw error;
      }
      return {
        attachmentId: created.id,
        title,
        filename,
        format: input.format,
        mimeType,
        byteSize: bytes.byteLength,
      };
    },

    /** v2.18：读取产物；只允许产物 MIME，图片仍走 read */
    readArtifact(id: string): { filename: string; mimeType: string; buffer: Buffer } {
      const row = repo.findRowById(id);
      if (!row) throw ApiError.notFound('产物', id);
      if (!ARTIFACT_MIME_SET.has(row.mime_type)) {
        throw ApiError.validation(`附件不是可预览产物：${id}`);
      }
      return {
        filename: row.filename,
        mimeType: row.mime_type,
        buffer: readFileSync(join(dir, row.storage_path)),
      };
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

    /** v2.32：产物清单（跨会话，最新在前；最多 200 条） */
    listArtifacts(limit = 200): Array<Omit<Attachment, 'contentHash'>> {
      return repo
        .list()
        .filter((row) => ARTIFACT_MIME_SET.has(row.mime_type))
        .slice(-limit)
        .reverse()
        .map((row) => {
          const { contentHash: _hash, ...rest } = mapAttachment(row);
          return rest;
        });
    },
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
