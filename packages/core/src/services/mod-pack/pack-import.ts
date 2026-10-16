import { unzipSync } from 'fflate';
import type {
  CharacterCardRepository,
  DatabaseInstance,
  ModInstallRepository,
  StageSceneRepository,
} from '@wbfm/database';
import { parseCharacterCard } from '@wbfm/shared/character-card';
import { ApiError } from '@wbfm/shared/errors';
import {
  CARD_NAME_MAX_CHARS,
  STAGE_NAME_MAX,
  type ModInstallSummary,
  type StageScenePayload,
} from '@wbfm/shared/schemas';
import type { StageSceneService } from '../stage-scene-service';
import { packSceneFileSchema, type PackImportResult, type PackPreview } from './pack-types';
import { rewriteCardName, uniqueCopyName } from './pack-names';

interface ExecuteImportDeps {
  db: DatabaseInstance;
  buffer: Uint8Array;
  preview: PackPreview;
  selectedPaths: string[];
  cards: CharacterCardRepository;
  scenes: StageSceneRepository;
  installs: ModInstallRepository;
  stageScenes: Pick<StageSceneService, 'saveBackground'>;
}

function bgMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function parseSceneBytes(bytes: Uint8Array, path: string): { name: string; payload: StageScenePayload } {
  const parsed = packSceneFileSchema.safeParse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  if (!parsed.success) throw ApiError.validation(`场景条目不符合契约：${path}`);
  return parsed.data;
}

/** 解析单个场景的包内背景引用（用于勾选依赖校验；解析失败返回 null） */
function sceneBackgroundRef(buffer: Uint8Array, path: string): string | null {
  const files = unzipSync(buffer, { filter: (f) => f.name === path });
  const bytes = files[path];
  if (!bytes) return null;
  try {
    const parsed = packSceneFileSchema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (!parsed.success) return null;
    const bg = parsed.data.payload.background;
    return bg.type === 'image' && bg.fileRef ? bg.fileRef : null;
  } catch {
    return null;
  }
}

/**
 * 执行导入（04 §5 冲突策略 + §6 流程 4–5）：
 * 背景先落盘换发 bg-<uuid> → 卡（同名转副本）→ 场景（同名转副本、重写背景引用）
 * → 登记 mod_installs；全程单事务。
 */
export function executeImport(deps: ExecuteImportDeps): PackImportResult {
  const { db, buffer, preview, selectedPaths, cards, scenes, installs, stageScenes } = deps;
  if (!preview.pack) throw ApiError.validation('包预检失败');

  const byPath = new Map(preview.entries.map((e) => [e.path, e]));
  for (const path of selectedPaths) {
    const entry = byPath.get(path);
    if (!entry) throw ApiError.validation(`选择了包内不存在的条目：${path}`);
    if (!entry.valid) throw ApiError.validation(`条目未通过校验，不能导入：${path}`);
  }
  const selected = new Set(selectedPaths);
  for (const entry of preview.entries) {
    if (entry.kind === 'stageScene' && selected.has(entry.path)) {
      const ref = sceneBackgroundRef(buffer, entry.path);
      if (ref && !selected.has(ref)) {
        throw ApiError.validation(`场景「${entry.name}」依赖的背景图未勾选，请一并选择`);
      }
    }
  }

  return db.transaction(() => {
    const files = unzipSync(buffer, { filter: (f) => selected.has(f.name) });
    const bytesOf = (p: string): Uint8Array => {
      const b = files[p];
      if (!b) throw ApiError.validation(`包内条目缺失：${p}`);
      return b;
    };
    const summary: ModInstallSummary = {
      characterCardIds: [],
      stageSceneIds: [],
      stageBackgroundFileRefs: [],
    };
    const imported: PackImportResult['entries'] = [];
    const usedCardNames = new Set(cards.list().map((c) => c.name));
    const usedSceneNames = new Set(scenes.list().map((s) => s.name));
    const bgRefMap = new Map<string, string>();

    for (const path of selectedPaths) {
      if (!path.startsWith('backgrounds/')) continue;
      const staged = stageScenes.saveBackground({ mimeType: bgMimeFromPath(path), buffer: bytesOf(path) });
      bgRefMap.set(path, staged.fileRef);
      summary.stageBackgroundFileRefs.push(staged.fileRef);
      imported.push({ kind: 'stageBackground', path, name: path.slice(12), fileRef: staged.fileRef, copied: false });
    }
    for (const path of selectedPaths) {
      if (!path.startsWith('cards/')) continue;
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytesOf(path));
      const parsed = parseCharacterCard(raw);
      if (!parsed.ok) throw ApiError.validation(`角色卡解析失败：${path}`);
      let markdown = raw;
      let copied = false;
      if (usedCardNames.has(parsed.card.name)) {
        const copyName = uniqueCopyName(parsed.card.name, usedCardNames, CARD_NAME_MAX_CHARS);
        markdown = rewriteCardName(raw, copyName);
        copied = true;
      }
      const reparsed = parseCharacterCard(markdown);
      if (!reparsed.ok) throw ApiError.validation('副本改名后角色卡解析失败');
      const record = cards.create({ source: 'custom', rawMarkdown: markdown, parsed: reparsed.card });
      usedCardNames.add(record.name);
      summary.characterCardIds.push(record.id);
      imported.push({ kind: 'characterCard', path, name: record.name, localId: record.id, copied });
    }
    for (const path of selectedPaths) {
      if (!path.startsWith('scenes/')) continue;
      const sceneFile = parseSceneBytes(bytesOf(path), path);
      let name = sceneFile.name;
      let copied = false;
      if (usedSceneNames.has(name)) {
        name = uniqueCopyName(name, usedSceneNames, STAGE_NAME_MAX);
        copied = true;
      }
      const oldRef = sceneFile.payload.background.fileRef;
      const payload: StageScenePayload =
        oldRef && bgRefMap.has(oldRef)
          ? { ...sceneFile.payload, background: { ...sceneFile.payload.background, fileRef: bgRefMap.get(oldRef) } }
          : sceneFile.payload;
      const record = scenes.create({ name, payload });
      usedSceneNames.add(record.name);
      summary.stageSceneIds.push(record.id);
      imported.push({ kind: 'stageScene', path, name: record.name, localId: record.id, copied });
    }
    const installedAt = new Date().toISOString();
    installs.record({
      packId: preview.pack!.id,
      name: preview.pack!.name,
      packVersion: preview.pack!.packVersion,
      authorName: preview.pack!.authorName,
      importedAt: installedAt,
      summary,
    });
    return {
      packId: preview.pack!.id,
      packName: preview.pack!.name,
      installedAt,
      counts: {
        characterCards: summary.characterCardIds.length,
        stageScenes: summary.stageSceneIds.length,
        stageBackgrounds: summary.stageBackgroundFileRefs.length,
      },
      entries: imported,
    } satisfies PackImportResult;
  })();
}
