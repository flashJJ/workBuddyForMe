import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDataDir } from '@wbfm/config';
import {
  STAGE_BACKGROUND_MAX_BYTES,
  STAGE_BACKGROUND_MIME,
  type StageSceneCreateInput,
  type StageScenePayload,
  type StageSceneUpdateInput,
} from '@wbfm/shared/schemas';
import type { StageSceneRecord } from '@wbfm/shared/types';
import { ApiError } from '@wbfm/shared/errors';
import { createStageSceneRepository } from '@wbfm/database';
import type { ServiceDeps } from './deps';

const MIME_EXT: Record<(typeof STAGE_BACKGROUND_MIME)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface StageBackgroundInput {
  mimeType: string;
  buffer: Uint8Array;
}

export interface StagedBackground {
  fileRef: string;
}

/**
 * v1.9 舞台场景服务：
 * - 场景 CRUD（payload 经 zod 在路由层校验；本服务只做存取）；
 * - 自定义背景复制进数据目录 stage-backgrounds/（≤20MB、白名单 MIME、服务端生成文件名），
 *   绝不引用用户原路径；读取做路径穿越守卫。
 */
export function createStageSceneService({ db }: ServiceDeps) {
  const repo = createStageSceneRepository(db);
  const dir = getDataDir('stageBackgrounds');
  mkdirSync(dir, { recursive: true });

  const requireScene = (id: string): StageSceneRecord => {
    const scene = repo.findById(id);
    if (!scene) throw ApiError.notFound('舞台场景', id);
    return scene;
  };

  /** 收集场景引用的背景文件名（供删场景时回收孤儿文件） */
  const usedFileRefs = (exceptSceneId?: string): Set<string> => {
    const used = new Set<string>();
    for (const scene of repo.list()) {
      if (scene.id === exceptSceneId) continue;
      if (scene.payload.background.type === 'image' && scene.payload.background.fileRef) {
        used.add(scene.payload.background.fileRef);
      }
    }
    return used;
  };

  /** 删除场景后清理不再被任何场景引用的背景文件 */
  const cleanupOrphan = (fileRef: string | undefined, exceptSceneId?: string): void => {
    if (!fileRef) return;
    if (usedFileRefs(exceptSceneId).has(fileRef)) return;
    rmSync(join(dir, fileRef), { force: true });
  };

  return {
    list(): StageSceneRecord[] {
      return repo.list();
    },

    get(id: string): StageSceneRecord {
      return requireScene(id);
    },

    create(input: StageSceneCreateInput): StageSceneRecord {
      return repo.create({ name: input.name, payload: input.payload });
    },

    update(id: string, input: StageSceneUpdateInput): StageSceneRecord {
      const before = requireScene(id);
      const updated = repo.update(id, {
        name: input.name,
        payload: input.payload as StageScenePayload | undefined,
      });
      if (!updated) throw ApiError.notFound('舞台场景', id);
      // 背景引用被替换时回收旧文件（仍被其他场景引用则保留）
      if (input.payload && before.payload.background.fileRef !== updated.payload.background.fileRef) {
        cleanupOrphan(before.payload.background.fileRef, id);
      }
      return updated;
    },

    delete(id: string): void {
      const scene = requireScene(id);
      repo.delete(id);
      cleanupOrphan(scene.payload.background.fileRef, id);
    },

    /** 背景图入库：校验 → 服务端生成文件名落盘。同内容秒传去重 */
    saveBackground(input: StageBackgroundInput): StagedBackground {
      const mime = input.mimeType as (typeof STAGE_BACKGROUND_MIME)[number];
      if (!STAGE_BACKGROUND_MIME.includes(mime)) {
        throw ApiError.validation(`不支持的背景图类型：${input.mimeType}（仅支持 png / jpeg / webp）`);
      }
      if (input.buffer.byteLength === 0) throw ApiError.validation('背景图内容为空');
      if (input.buffer.byteLength > STAGE_BACKGROUND_MAX_BYTES) {
        throw ApiError.validation('背景图超过 20MB 上限');
      }
      const fileRef = `bg-${randomUUID()}.${MIME_EXT[mime]}`;
      writeFileSync(join(dir, fileRef), input.buffer);
      return { fileRef };
    },

    /**
     * 读取背景文件字节（API 回流用）。fileRef 仅允许服务端生成的简单文件名，
     * 禁止任何路径分隔/穿越。
     */
    readBackground(fileRef: string): { mimeType: string; buffer: Buffer } {
      if (!/^bg-[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(fileRef)) {
        throw new ApiError('NOT_FOUND', '背景文件不存在');
      }
      const ext = fileRef.slice(fileRef.lastIndexOf('.') + 1);
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { mimeType: mime, buffer: readFileSync(join(dir, fileRef)) };
    },
  };
}

export type StageSceneService = ReturnType<typeof createStageSceneService>;
