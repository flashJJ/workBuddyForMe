import { randomUUID } from 'node:crypto';
import { zipSync } from 'fflate';
import {
  createCharacterCardRepository,
  createModInstallRepository,
  createStageSceneRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  WBFM_PACK_MAX_BYTES,
  PACK_BACKGROUND_MAX_BYTES,
  packExportRequestSchema,
  type PackExportRequest,
  type StageScenePayload,
} from '@wbfm/shared/schemas';
import type { StageSceneService } from './stage-scene-service';
import { inspectPackBuffer, type InspectContext } from './mod-pack/pack-inspect';
import { executeImport } from './mod-pack/pack-import';
import type { PackImportResult, PackPreview } from './mod-pack/pack-types';

export interface ModPackServiceDeps {
  db: DatabaseInstance;
  /** 复用舞台服务的背景落盘/读取（同一份 data/stage-backgrounds 目录与命名规则） */
  stageScenes: Pick<StageSceneService, 'saveBackground' | 'readBackground'>;
}

export interface ExportCandidate {
  cards: Array<{ id: string; name: string; description: string }>;
  scenes: Array<{ id: string; name: string }>;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * v2.0 M5 .wbfm-pack 服务：本地个性化成果的打包/预检/导入。
 * 红线（04 §1）：模型/音频二进制硬拒；builtin.* 不可覆盖；冲突只进副本。
 */
export function createModPackService({ db, stageScenes }: ModPackServiceDeps) {
  const cards = createCharacterCardRepository(db);
  const scenes = createStageSceneRepository(db);
  const installs = createModInstallRepository(db);

  const inspectContext = (): InspectContext => ({
    existingCardNames: new Set(cards.list().map((c) => c.name)),
    existingSceneNames: new Set(scenes.list().map((s) => s.name)),
  });

  return {
    /** 导出勾选清单：仅自建卡与非内置场景 */
    listExportCandidates(): ExportCandidate {
      return {
        cards: cards
          .list('custom')
          .map((c) => ({ id: c.id, name: c.name, description: c.description })),
        scenes: scenes
          .list()
          .filter((s) => !s.isBuiltin)
          .map((s) => ({ id: s.id, name: s.name })),
      };
    },

    inspect(buffer: Uint8Array): PackPreview {
      return inspectPackBuffer(buffer, inspectContext());
    },

    exportPack(rawInput: unknown): { archive: Uint8Array; filename: string } {
      const input: PackExportRequest = packExportRequestSchema.parse(rawInput);
      const exportCards = input.characterCardIds.map((id) => {
        const card = cards.findById(id);
        if (!card) throw ApiError.notFound('角色卡', id);
        if (card.source === 'builtin') {
          throw new ApiError('FORBIDDEN', '内置角色卡不属于可打包的自建内容');
        }
        return card;
      });
      const exportScenes = input.stageSceneIds.map((id) => {
        const scene = scenes.findById(id);
        if (!scene) throw ApiError.notFound('舞台场景', id);
        if (scene.isBuiltin) throw ApiError.validation('内置舞台场景不可导出');
        return scene;
      });

      // 场景引用的背景图去重收集（只带被引用的；2MB 单条目上限）
      const bgRefs: string[] = [];
      for (const scene of exportScenes) {
        const bg = scene.payload.background;
        if (bg.type === 'image' && bg.fileRef && !bgRefs.includes(bg.fileRef)) {
          bgRefs.push(bg.fileRef);
        }
      }
      const bgFiles = new Map<string, Buffer>();
      for (const ref of bgRefs) {
        const file = stageScenes.readBackground(ref);
        if (file.buffer.byteLength > PACK_BACKGROUND_MAX_BYTES) {
          throw new ApiError(
            'VALIDATION_ERROR',
            `背景图 ${ref} 超过 ${PACK_BACKGROUND_MAX_BYTES / 1024 / 1024}MB 单条目上限，请移除引用它的场景后重试`,
          );
        }
        bgFiles.set(ref, file.buffer);
      }

      const cardEntries = exportCards.map((card) => `cards/card-${card.id}.md`);
      const sceneEntries = exportScenes.map((scene) => `scenes/scene-${scene.id}.json`);
      const bgEntries = bgRefs.map((ref) => `backgrounds/${ref}`);
      const zipped: Record<string, Uint8Array> = {};
      for (const card of exportCards) {
        zipped[`cards/card-${card.id}.md`] = utf8(card.rawMarkdown);
      }
      for (const scene of exportScenes) {
        const payload: StageScenePayload =
          scene.payload.background.type === 'image' && scene.payload.background.fileRef
            ? {
                ...scene.payload,
                background: {
                  ...scene.payload.background,
                  fileRef: `backgrounds/${scene.payload.background.fileRef}`,
                },
              }
            : scene.payload;
        zipped[`scenes/scene-${scene.id}.json`] = utf8(
          JSON.stringify({ name: scene.name, payload }, null, 2),
        );
      }
      for (const [ref, buffer] of bgFiles) {
        zipped[`backgrounds/${ref}`] = new Uint8Array(buffer);
      }

      zipped['manifest.json'] = utf8(
        JSON.stringify(
          {
            format: 'wbfm-pack',
            schemaVersion: 1,
            pack: {
              id: `p_${randomUUID()}`,
              name: input.name,
              description: input.description,
              author: { name: input.authorName, url: input.authorUrl },
              createdAt: new Date().toISOString(),
              packVersion: input.packVersion,
            },
            contents: {
              characterCards: cardEntries,
              events: [],
              themes: [],
              personas: [],
              gestures: [],
              stageScenes: sceneEntries,
              stageBackgrounds: bgEntries,
            },
          },
          null,
          2,
        ),
      );

      const archive = zipSync(zipped, { level: 6 });
      if (archive.byteLength > WBFM_PACK_MAX_BYTES) {
        throw new ApiError(
          'VALIDATION_ERROR',
          `整包 ${(archive.byteLength / 1024 / 1024).toFixed(1)}MB 超过 ${WBFM_PACK_MAX_BYTES / 1024 / 1024}MB 上限，请减少内容后重试`,
        );
      }
      const safeName = input.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      return { archive, filename: `${safeName}.wbfm-pack` };
    },

    importPack(buffer: Uint8Array, selectedPaths: string[]): PackImportResult {
      const preview = inspectPackBuffer(buffer, inspectContext());
      if (preview.fatal) {
        throw ApiError.validation(preview.fatal.message);
      }
      return executeImport({
        db,
        buffer,
        preview,
        selectedPaths,
        cards,
        scenes,
        installs,
        stageScenes,
      });
    },

    listInstalls() {
      return installs.listAll();
    },
  };
}

export type ModPackService = ReturnType<typeof createModPackService>;
