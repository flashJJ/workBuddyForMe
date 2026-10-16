/**
 * VRM 文件双校验（魔数 + VRM 扩展标记）
 * 与 spike 版同口径：仅收 glb 容器且必须含 VRM 扩展；不收裸 .gltf。
 */

export interface VrmSniffResult {
  ok: boolean;
  reason?: 'not_glb' | 'not_vrm_extension' | 'parse_failed';
}

export function sniffVrm(buffer: ArrayBuffer): VrmSniffResult {
  const dv = new DataView(buffer);
  if (dv.byteLength < 12) return { ok: false, reason: 'not_glb' };
  // GLB 规范：magic 是 uint32 LE 0x46546C67（ASCII 'glTF'）；chunk type 同理 LE 'JSON'
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) return { ok: false, reason: 'not_glb' }; // 'glTF'
  const version = dv.getUint32(4, true);
  if (version !== 2) return { ok: false, reason: 'not_glb' };

  const jsonLength = dv.getUint32(12, true);
  const jsonType = dv.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) return { ok: false, reason: 'parse_failed' }; // 'JSON'
  const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    extensionsUsed?: string[];
  };
  const exts = json.extensionsUsed ?? [];
  if (!exts.includes('VRMC_vrm') && !exts.includes('VRM')) {
    return { ok: false, reason: 'not_vrm_extension' };
  }
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
  const dv = new DataView(buffer);
  const jsonLength = dv.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    extensions?: Record<string, { meta?: Record<string, unknown> }>;
  };
  const meta = (json.extensions?.VRMC_vrm?.meta ?? json.extensions?.VRM?.meta ?? {}) as Record<string, unknown>;
  const isV10 = Boolean(json.extensions?.VRMC_vrm);
  return {
    name: (meta.name as string | undefined) ?? undefined,
    author: (meta.author as string | undefined) ?? undefined,
    copyright: (meta.copyright as string | undefined) ?? undefined,
    licenseUrl: (meta.licenseUrl as string | undefined) ?? undefined,
    avatarPermission: (meta.avatarPermission as string | undefined) ?? undefined,
    commercialUsage: (meta.commercialUsage as string | undefined) ?? undefined,
    violentUsage: (meta.violentUsage as string | undefined) ?? undefined,
    sexualUsage: (meta.sexualUsage as string | undefined) ?? undefined,
    redistribution: (meta.redistribution as string | undefined) ?? undefined,
    vrmVersion: isV10 ? '1.0' : '0.x',
  };
}
