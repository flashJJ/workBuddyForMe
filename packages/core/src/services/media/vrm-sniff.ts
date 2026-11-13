/**
 * VRM 文件双校验（魔数 + VRM 扩展标记）
 * 与 spike 版同口径：仅收 glb 容器且必须含 VRM 扩展；不收裸 .gltf。
 */

import { isGlbContainer, readExtensionsUsed, readGlbJson } from './glb';

export interface VrmSniffResult {
  ok: boolean;
  reason?: 'not_glb' | 'not_vrm_extension' | 'parse_failed' | 'broken_references';
}

/**
 * 引用越界校验：部分导出器/精简工具会删掉 bufferView 却保留 image/accessor 引用，
 * GLTFLoader 会在加载纹理时抛 `Cannot read properties of undefined (reading 'extensions')`。
 * 这里在导入阶段就拒绝，避免把坏文件写进库。
 */
function hasDanglingReferences(json: Record<string, unknown>): boolean {
  const bufferViews = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  const images = Array.isArray(json.images) ? json.images : [];
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  const textures = Array.isArray(json.textures) ? json.textures : [];
  const invalid = (value: unknown, max: number) =>
    typeof value === 'number' && (value < 0 || value >= max);
  return (
    images.some((item) => invalid((item as { bufferView?: unknown }).bufferView, bufferViews.length)) ||
    accessors.some((item) => invalid((item as { bufferView?: unknown }).bufferView, bufferViews.length)) ||
    textures.some((item) => invalid((item as { source?: unknown }).source, images.length))
  );
}

export function sniffVrm(buffer: ArrayBuffer): VrmSniffResult {
  if (!isGlbContainer(buffer)) return { ok: false, reason: 'not_glb' };
  const json = readGlbJson(buffer);
  if (!json) return { ok: false, reason: 'parse_failed' };
  const exts = readExtensionsUsed(json);
  if (!exts.includes('VRMC_vrm') && !exts.includes('VRM')) {
    return { ok: false, reason: 'not_vrm_extension' };
  }
  if (hasDanglingReferences(json)) return { ok: false, reason: 'broken_references' };
  return { ok: true };
}

export interface VrmMeta {
  name?: string;
  author?: string;
  copyright?: string;
  licenseUrl?: string;
  avatarPermission?: string;
  commercialUsage?: string;
  violentUsage?: string;
  sexualUsage?: string;
  redistribution?: string;
  vrmVersion?: '0.x' | '1.0';
}

export function extractVrmMeta(buffer: ArrayBuffer): VrmMeta {
  const json = readGlbJson(buffer) ?? {};
  const extensions = (json.extensions ?? {}) as Record<string, { meta?: Record<string, unknown> }>;
  const meta = (extensions.VRMC_vrm?.meta ?? extensions.VRM?.meta ?? {}) as Record<string, unknown>;
  const isV10 = Boolean(extensions.VRMC_vrm);
  const str = (key: string): string | undefined => {
    const v = meta[key];
    return typeof v === 'string' ? v : undefined;
  };
  return {
    name: str('name'),
    author: str('author'),
    copyright: str('copyright'),
    licenseUrl: str('licenseUrl'),
    avatarPermission: str('avatarPermission'),
    commercialUsage: str('commercialUsage'),
    violentUsage: str('violentUsage'),
    sexualUsage: str('sexualUsage'),
    redistribution: str('redistribution'),
    vrmVersion: isV10 ? '1.0' : '0.x',
  };
}
