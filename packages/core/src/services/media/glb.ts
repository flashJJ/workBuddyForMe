/**
 * GLB 容器解析（vrm-sniff 与 motion-sniff 共用）。
 *
 * VRM 与 VRMA 都是 glTF 二进制（.glb）容器，差别只在扩展标记，
 * 因此「魔数/版本校验 + 读 JSON chunk」这一步应该只有一份实现。
 */

/** GLB magic：uint32 LE 0x46546C67（ASCII 'glTF'） */
const GLB_MAGIC = 0x46546c67;
/** JSON chunk type：uint32 LE 0x4E4F534A（ASCII 'JSON'） */
const GLB_JSON_CHUNK = 0x4e4f534a;
/** GLB 头 + 首个 chunk 头固定 20 字节 */
const GLB_JSON_HEADER_BYTES = 20;

/** 是否为合法的 glTF 2.0 二进制容器（只校验魔数与版本，不看 chunk） */
export function isGlbContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const dv = new DataView(buffer);
  return dv.getUint32(0, true) === GLB_MAGIC && dv.getUint32(4, true) === 2;
}

/**
 * 读取 GLB 的 JSON chunk 并解析。
 * @returns 解析结果；非 glb 容器 / 首个 chunk 不是 JSON / JSON 解析失败 均返回 null
 */
export function readGlbJson(buffer: ArrayBuffer): Record<string, unknown> | null {
  if (!isGlbContainer(buffer)) return null;
  try {
    const dv = new DataView(buffer);
    const jsonLength = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== GLB_JSON_CHUNK) return null;
    const jsonBytes = new Uint8Array(buffer, GLB_JSON_HEADER_BYTES, jsonLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 读取 glTF 的 extensionsUsed（缺省空数组） */
export function readExtensionsUsed(json: Record<string, unknown> | null): string[] {
  const exts = json?.extensionsUsed;
  return Array.isArray(exts) ? (exts as string[]) : [];
}
