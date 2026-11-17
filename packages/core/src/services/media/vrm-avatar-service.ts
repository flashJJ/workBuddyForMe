import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDataDir } from '@wbfm/config';
import { VRM_MAX_BYTES } from '@wbfm/shared/constants';
import { ApiError } from '@wbfm/shared/errors';
import type { VrmAvatar, VrmMeta } from '@wbfm/shared/schemas';
import type { Database } from 'better-sqlite3';
import { sniffVrm, extractVrmMeta } from './vrm-sniff';

/** VRM 形象记录（数据库行） */
interface VrmAvatarRow {
  id: string;
  name: string;
  file_ref: string;
  byte_length: number;
  meta_json: string;
  created_at: string;
  voice_sid: number | null;
}

function rowToAvatar(row: VrmAvatarRow): VrmAvatar {
  return {
    id: row.id,
    name: row.name,
    fileRef: row.file_ref,
    byteLength: row.byte_length,
    meta: JSON.parse(row.meta_json) as VrmMeta,
    voiceSid: row.voice_sid ?? null,
    createdAt: row.created_at,
  };
}

function assertVoiceSid(voiceSid: number | null): void {
  if (voiceSid !== null && (!Number.isInteger(voiceSid) || voiceSid < 0 || voiceSid > 102)) {
    throw ApiError.validation('声线 sid 必须在 0-102 之间');
  }
}

export function createVrmAvatarService(db: Database) {
  const dir = getDataDir('vrmAvatars');
  mkdirSync(dir, { recursive: true });

  const insertStmt = db.prepare(`
    INSERT INTO vrm_avatars (id, name, file_ref, byte_length, meta_json, voice_sid)
    VALUES (@id, @name, @file_ref, @byte_length, @meta_json, @voice_sid)
  `);
  const listStmt = db.prepare('SELECT * FROM vrm_avatars ORDER BY created_at DESC');
  const getStmt = db.prepare('SELECT * FROM vrm_avatars WHERE id = ?');
  const getByRefStmt = db.prepare('SELECT * FROM vrm_avatars WHERE file_ref = ?');
  const deleteStmt = db.prepare('DELETE FROM vrm_avatars WHERE id = ?');
  const updateVoiceStmt = db.prepare('UPDATE vrm_avatars SET voice_sid = ? WHERE id = ?');

  return {
    /** 上传导入：双校验 + 落盘 + 落库 */
    importAvatar(input: {
      filename: string;
      buffer: Uint8Array;
      name?: string;
      voiceSid?: number | null;
    }): VrmAvatar {
      const voiceSid = input.voiceSid ?? null;
      assertVoiceSid(voiceSid);
      if (!input.filename.toLowerCase().endsWith('.vrm')) {
        throw ApiError.validation('仅支持 .vrm 文件');
      }
      if (input.buffer.byteLength > VRM_MAX_BYTES) {
        throw ApiError.validation('文件超过 60MB 上限');
      }
      const sniff = sniffVrm(input.buffer.buffer as ArrayBuffer);
      if (!sniff.ok) {
        const msg =
          sniff.reason === 'not_glb'
            ? '不是合法的 glTF 二进制文件'
            : sniff.reason === 'not_vrm_extension'
              ? '缺少 VRM 扩展标记'
              : sniff.reason === 'broken_references'
                ? '模型文件不完整（内部 bufferView 引用越界），请重新导出后再导入'
                : '不是合法的 VRM 文件';
        throw ApiError.validation(msg);
      }
      const meta = extractVrmMeta(input.buffer.buffer as ArrayBuffer);
      const fileRef = `vrm-${randomUUID()}.vrm`;
      // 备份恢复等场景可能重建数据根，导入前确保目录存在，避免 ENOENT
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fileRef), input.buffer);
      const name = input.name?.trim() || meta.name || input.filename.replace(/\.vrm$/i, '');
      const id = randomUUID();
      insertStmt.run({
        id,
        name: name.slice(0, 80),
        file_ref: fileRef,
        byte_length: input.buffer.byteLength,
        meta_json: JSON.stringify(meta),
        voice_sid: voiceSid,
      });
      return {
        id,
        name: name.slice(0, 80),
        fileRef,
        byteLength: input.buffer.byteLength,
        meta,
        voiceSid,
        createdAt: new Date().toISOString(),
      };
    },

    list(): VrmAvatar[] {
      const rows = listStmt.all() as VrmAvatarRow[];
      return rows.map(rowToAvatar);
    },

    get(id: string): VrmAvatar | null {
      const row = getStmt.get(id) as VrmAvatarRow | undefined;
      return row ? rowToAvatar(row) : null;
    },

    getByFileRef(fileRef: string): VrmAvatar | null {
      const row = getByRefStmt.get(fileRef) as VrmAvatarRow | undefined;
      return row ? rowToAvatar(row) : null;
    },

    /** 绑定/解绑导入 VRM 的声线（null=跟随默认角色） */
    setVoiceSid(id: string, voiceSid: number | null): VrmAvatar {
      assertVoiceSid(voiceSid);
      const result = updateVoiceStmt.run(voiceSid, id);
      if (result.changes === 0) throw ApiError.notFound('VRM 形象', id);
      const avatar = this.get(id);
      if (!avatar) throw ApiError.notFound('VRM 形象', id);
      return avatar;
    },

    /** 删除记录并回收文件 */
    delete(id: string): void {
      const avatar = this.get(id);
      if (!avatar) throw ApiError.notFound('VRM 形象', id);
      deleteStmt.run(id);
      rmSync(join(dir, avatar.fileRef), { force: true });
    },

    /** 读取文件字节（供 API 流式返回） */
    readFile(fileRef: string): { buffer: Buffer; byteLength: number } {
      if (!/^vrm-[A-Za-z0-9_-]+\.vrm$/.test(fileRef)) {
        throw new ApiError('NOT_FOUND', 'VRM 文件不存在');
      }
      const buffer = readFileSync(join(dir, fileRef));
      return { buffer, byteLength: buffer.byteLength };
    },
  };
}

export type VrmAvatarService = ReturnType<typeof createVrmAvatarService>;
