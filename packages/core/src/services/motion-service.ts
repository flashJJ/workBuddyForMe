import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDataDir } from '@wbfm/config';
import { MOTION_MAX_BYTES } from '@wbfm/shared/constants';
import { ApiError } from '@wbfm/shared/errors';
import type { MotionAsset } from '@wbfm/shared/schemas';
import type { Database } from 'better-sqlite3';
import { sniffVrma } from './motion-sniff';

/** 待机动作记录（数据库行） */
interface MotionAssetRow {
  id: string;
  name: string;
  file_ref: string;
  byte_length: number;
  source: string | null;
  note: string | null;
  created_at: string;
}

function rowToMotion(row: MotionAssetRow): MotionAsset {
  return {
    id: row.id,
    name: row.name,
    fileRef: row.file_ref,
    byteLength: row.byte_length,
    source: row.source ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export function createMotionService(db: Database) {
  const dir = getDataDir('motions');
  mkdirSync(dir, { recursive: true });

  const insertStmt = db.prepare(`
    INSERT INTO motion_assets (id, name, file_ref, byte_length, source, note)
    VALUES (@id, @name, @file_ref, @byte_length, @source, @note)
  `);
  const listStmt = db.prepare('SELECT * FROM motion_assets ORDER BY created_at DESC');
  const getStmt = db.prepare('SELECT * FROM motion_assets WHERE id = ?');
  const getByRefStmt = db.prepare('SELECT * FROM motion_assets WHERE file_ref = ?');
  const deleteStmt = db.prepare('DELETE FROM motion_assets WHERE id = ?');

  return {
    /** 上传导入：双校验 + 落盘 + 落库 */
    importMotion(input: {
      filename: string;
      buffer: Uint8Array;
      name?: string;
      source?: string;
      note?: string;
    }): MotionAsset {
      if (!input.filename.toLowerCase().endsWith('.vrma')) {
        throw ApiError.validation('仅支持 .vrma 文件');
      }
      if (input.buffer.byteLength > MOTION_MAX_BYTES) {
        throw ApiError.validation('文件超过 10MB 上限');
      }
      const sniff = sniffVrma(input.buffer.buffer as ArrayBuffer);
      if (!sniff.ok) {
        const msg =
          sniff.reason === 'not_glb'
            ? '不是合法的 glTF 二进制文件'
            : sniff.reason === 'not_vrma_extension'
              ? '缺少 VRMC_vrm_animation 扩展标记'
              : '不是合法的 VRMA 文件';
        throw ApiError.validation(msg);
      }
      const fileRef = `motion-${randomUUID()}.vrma`;
      writeFileSync(join(dir, fileRef), input.buffer);
      const name = input.name?.trim() || input.filename.replace(/\.vrma$/i, '');
      const source = input.source?.trim() ? input.source.trim().slice(0, 200) : null;
      const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null;
      const id = randomUUID();
      insertStmt.run({
        id,
        name: name.slice(0, 80),
        file_ref: fileRef,
        byte_length: input.buffer.byteLength,
        source,
        note,
      });
      return {
        id,
        name: name.slice(0, 80),
        fileRef,
        byteLength: input.buffer.byteLength,
        source: source ?? undefined,
        note: note ?? undefined,
        createdAt: new Date().toISOString(),
      };
    },

    list(): MotionAsset[] {
      const rows = listStmt.all() as MotionAssetRow[];
      return rows.map(rowToMotion);
    },

    get(id: string): MotionAsset | null {
      const row = getStmt.get(id) as MotionAssetRow | undefined;
      return row ? rowToMotion(row) : null;
    },

    getByFileRef(fileRef: string): MotionAsset | null {
      const row = getByRefStmt.get(fileRef) as MotionAssetRow | undefined;
      return row ? rowToMotion(row) : null;
    },

    /** 删除记录并回收文件 */
    delete(id: string): void {
      const motion = this.get(id);
      if (!motion) throw ApiError.notFound('待机动作', id);
      deleteStmt.run(id);
      rmSync(join(dir, motion.fileRef), { force: true });
    },

    /** 读取文件字节（供 API 流式返回） */
    readFile(fileRef: string): { buffer: Buffer; byteLength: number } {
      if (!/^motion-[A-Za-z0-9_-]+\.vrma$/.test(fileRef)) {
        throw new ApiError('NOT_FOUND', '待机动作文件不存在');
      }
      const buffer = readFileSync(join(dir, fileRef));
      return { buffer, byteLength: buffer.byteLength };
    },
  };
}

export type MotionService = ReturnType<typeof createMotionService>;
