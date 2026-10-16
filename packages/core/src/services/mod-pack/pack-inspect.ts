import { unzipSync } from 'fflate';
import { parseCharacterCard } from '@wbfm/shared/character-card';
import {
  WBFM_PACK_MAX_BYTES,
  PACK_CARD_MAX_BYTES,
  PACK_SCENE_MAX_BYTES,
  PACK_BACKGROUND_MAX_BYTES,
  WBFM_PACK_FORMAT,
  WBFM_PACK_SCHEMA_VERSION,
  packManifestSchema,
  type WbfmPackManifest,
} from '@wbfm/shared/schemas';
import { readCentralDirectorySafely, ZipSafetyError } from './pack-zip-reader';
import { imageKindFromExt, sniffForbiddenPayload, sniffImage } from './pack-magic';
import {
  packSceneFileSchema,
  type PackFatalCode,
  type PackPreview,
  type PackPreviewEntry,
} from './pack-types';

export interface InspectContext {
  existingCardNames: Set<string>;
  existingSceneNames: Set<string>;
}

function fatal(code: PackFatalCode, message: string): PackPreview {
  return { fatal: { code, message }, pack: null, entries: [], importable: false };
}

function decodeUtf8NoBom(buf: Uint8Array, label: string): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new Error(`${label} 不允许 UTF-8 BOM`);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

function kindOf(path: string): PackPreviewEntry['kind'] | null {
  if (path.startsWith('cards/')) return 'characterCard';
  if (path.startsWith('scenes/')) return 'stageScene';
  if (path.startsWith('backgrounds/')) return 'stageBackground';
  return null;
}

/**
 * .wbfm-pack 预检（04 §6 步骤 1–3）：容器校验 → manifest 校验 → 逐条领域校验。
 * 纯读：不连库、不落盘；同名冲突由 ctx 传入。
 */
export function inspectPackBuffer(buf: Uint8Array, ctx: InspectContext): PackPreview {
  if (buf.byteLength > WBFM_PACK_MAX_BYTES) {
    return fatal('tooLarge', `包体积超过 ${WBFM_PACK_MAX_BYTES / 1024 / 1024}MB 上限`);
  }

  let central: ReturnType<typeof readCentralDirectorySafely>;
  try {
    central = readCentralDirectorySafely(buf);
  } catch (error) {
    const message = error instanceof ZipSafetyError ? error.message : 'ZIP 解析失败';
    return fatal(error instanceof ZipSafetyError ? 'unsafeZip' : 'notZip', message);
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, { filter: (f) => !f.name.endsWith('/') });
  } catch {
    return fatal('unsafeZip', 'ZIP 解压失败，包可能已损坏');
  }

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) return fatal('manifestMissing', '缺少必需根文件 manifest.json');

  let raw: unknown;
  try {
    raw = JSON.parse(decodeUtf8NoBom(manifestBytes, 'manifest.json'));
  } catch (error) {
    return fatal('manifestInvalid', `manifest.json 无法解析：${(error as Error).message}`);
  }
  const obj = raw as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') {
    return fatal('manifestInvalid', 'manifest.json 必须是 JSON 对象');
  }
  if (obj.format !== WBFM_PACK_FORMAT) {
    return fatal('manifestInvalid', 'format 不是 "wbfm-pack"');
  }
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > WBFM_PACK_SCHEMA_VERSION) {
    return fatal('unsupportedVersion', '包格式版本更高，请升级应用后再导入');
  }
  const parsed = packManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'manifest'}：${i.message}`)
      .join('；');
    return fatal('manifestInvalid', `manifest 校验失败：${detail}`);
  }
  const manifest: WbfmPackManifest = parsed.data;

  const declared = [
    ...manifest.contents.characterCards,
    ...manifest.contents.stageScenes,
    ...manifest.contents.stageBackgrounds,
  ];

  for (const path of declared) {
    if (!(path in files)) return fatal('entryMissing', `manifest 声明的条目缺失：${path}`);
  }
  for (const entry of central) {
    if (entry.name === 'manifest.json') continue;
    if (!declared.includes(entry.name)) {
      return fatal('undeclaredEntry', `存在未在 manifest 声明的条目：${entry.name}`);
    }
  }

  // 背景引用关系（场景 → backgrounds 路径）
  const sceneRefs = new Map<string, string>();
  const bgReferencedBy = new Map<string, string[]>();
  const parsedScenes = new Map<string, { name: string; bgPath: string | null }>();
  for (const path of manifest.contents.stageScenes) {
    const parsedScene = tryParseScene(files[path]!, path);
    if (parsedScene.ok) {
      parsedScenes.set(path, parsedScene);
      sceneRefs.set(path, parsedScene.bgPath ?? '');
      if (parsedScene.bgPath) {
        const list = bgReferencedBy.get(parsedScene.bgPath) ?? [];
        list.push(path);
        bgReferencedBy.set(parsedScene.bgPath, list);
      }
    }
  }

  const declaredBg = new Set(manifest.contents.stageBackgrounds);
  const entries: PackPreviewEntry[] = [];
  for (const path of manifest.contents.characterCards) {
    entries.push(validateCard(path, files[path]!, ctx));
  }
  for (const path of manifest.contents.stageScenes) {
    const parsedScene = parsedScenes.get(path);
    entries.push(
      validateScene(path, files[path]!, ctx, parsedScene ?? null, declaredBg),
    );
  }
  for (const path of manifest.contents.stageBackgrounds) {
    entries.push(validateBackground(path, files[path]!, bgReferencedBy.get(path) ?? []));
  }

  return {
    fatal: null,
    pack: {
      id: manifest.pack.id,
      name: manifest.pack.name,
      description: manifest.pack.description,
      authorName: manifest.pack.author.name,
      authorUrl: manifest.pack.author.url,
      packVersion: manifest.pack.packVersion,
      createdAt: manifest.pack.createdAt,
    },
    entries,
    importable: entries.every((e) => e.valid),
  };
}

function tryParseScene(
  buf: Uint8Array,
  path: string,
): { ok: true; name: string; bgPath: string | null } | { ok: false } {
  try {
    const json = JSON.parse(decodeUtf8NoBom(buf, path)) as unknown;
    const result = packSceneFileSchema.safeParse(json);
    if (!result.success) return { ok: false };
    const bg = result.data.payload.background;
    const bgPath = bg.type === 'image' && bg.fileRef ? bg.fileRef : null;
    return { ok: true, name: result.data.name, bgPath };
  } catch {
    return { ok: false };
  }
}

function validateCard(
  path: string,
  buf: Uint8Array,
  ctx: InspectContext,
): PackPreviewEntry {
  const errors: string[] = [];
  let name = path;
  if (buf.byteLength > PACK_CARD_MAX_BYTES) {
    errors.push(`卡片超过 ${PACK_CARD_MAX_BYTES / 1024}KB 上限`);
  }
  const forbidden = sniffForbiddenPayload(buf);
  if (forbidden) errors.push(`夹带${forbidden}二进制`);
  let raw = '';
  try {
    raw = decodeUtf8NoBom(buf, path);
    const result = parseCharacterCard(raw);
    if (!result.ok) {
      errors.push(...result.errors.map((d) => `行 ${d.line ?? '?'}：${d.message}`));
    } else {
      name = result.card.name;
    }
  } catch (error) {
    errors.push((error as Error).message);
  }
  const conflict = name !== path && ctx.existingCardNames.has(name);
  return {
    kind: 'characterCard',
    path,
    name,
    sizeBytes: buf.byteLength,
    valid: errors.length === 0,
    errors,
    conflict,
    referencedBy: [],
  };
}

function validateScene(
  path: string,
  buf: Uint8Array,
  ctx: InspectContext,
  parsedScene: { name: string; bgPath: string | null } | null,
  declaredBg: Set<string>,
): PackPreviewEntry {
  const errors: string[] = [];
  let name = path;
  if (buf.byteLength > PACK_SCENE_MAX_BYTES) {
    errors.push(`场景 JSON 超过 ${PACK_SCENE_MAX_BYTES / 1024}KB 上限`);
  }
  const forbidden = sniffForbiddenPayload(buf);
  if (forbidden) errors.push(`夹带${forbidden}二进制`);
  if (!parsedScene) {
    try {
      decodeUtf8NoBom(buf, path);
    } catch (error) {
      errors.push((error as Error).message);
    }
    errors.push('场景 JSON 不符合舞台场景契约（name + payload）');
  } else {
    name = parsedScene.name;
    if (parsedScene.bgPath && !declaredBg.has(parsedScene.bgPath)) {
      errors.push(`引用的背景图未包含在包内：${parsedScene.bgPath}`);
    }
  }
  const conflict = name !== path && ctx.existingSceneNames.has(name);
  return {
    kind: 'stageScene',
    path,
    name,
    sizeBytes: buf.byteLength,
    valid: errors.length === 0,
    errors,
    conflict,
    referencedBy: [],
  };
}

function validateBackground(
  path: string,
  buf: Uint8Array,
  referencedBy: string[],
): PackPreviewEntry {
  const errors: string[] = [];
  if (buf.byteLength > PACK_BACKGROUND_MAX_BYTES) {
    errors.push(`背景图超过 ${PACK_BACKGROUND_MAX_BYTES / 1024 / 1024}MB 单条目上限`);
  }
  const expectKind = imageKindFromExt(path);
  const realKind = sniffImage(buf);
  if (!realKind) {
    const forbidden = sniffForbiddenPayload(buf);
    errors.push(forbidden ? `伪装成图片的${forbidden}文件（以魔数为准）` : '不是真实图片（魔数校验失败）');
  } else if (expectKind && realKind !== expectKind) {
    errors.push(`扩展名与真实图片类型不符（实际为 ${realKind}）`);
  }
  return {
    kind: 'stageBackground',
    path,
    name: path.slice('backgrounds/'.length),
    sizeBytes: buf.byteLength,
    valid: errors.length === 0,
    errors,
    conflict: false,
    referencedBy,
  };
}
