/**
 * v2.0 M0 VRM 导入校验原型（工装版；M4 产品化时迁入 core/shared 并接 zod/错误码）。
 *
 * 两道硬校验（都在解包/解析层，不依赖文件扩展名与 manifest 自述）：
 * 1. GLB 魔数：前 4 字节必须为 ASCII "glTF"（0x67 0x6C 0x54 0x46）；
 * 2. VRM 扩展：JSON chunk 的 extensions 必须含 VRMC_vrm（1.0）或 VRM（0.x）。
 *
 * 普通 .glb/.gltf（无 VRM 扩展）一律拒绝——产品首期只收人形 VRM。
 */

export type VrmSniffReason =
  | 'too_small'
  | 'not_glb'
  | 'bad_glb_header'
  | 'json_chunk_missing'
  | 'not_vrm_extension';

export interface VrmSniffResult {
  ok: boolean;
  reason?: VrmSniffReason;
  vrmVersion?: '0.x' | '1.0';
  byteLength: number;
}

const GLB_MAGIC = 0x46546c67; // "glTF" 小端 uint32
const CHUNK_JSON = 0x4e4f534a; // "JSON"

function readUInt32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function sniffVrm(buffer: ArrayBuffer): VrmSniffResult {
  const byteLength = buffer.byteLength;
  // GLB 头部 12 字节：magic(0..3) + version(4..7) + totalLength(8..11)
  if (byteLength < 4) return { ok: false, reason: 'too_small', byteLength };

  const view = new DataView(buffer);
  if (readUInt32(view, 0) !== GLB_MAGIC) {
    return { ok: false, reason: 'not_glb', byteLength };
  }
  if (byteLength < 20) {
    return { ok: false, reason: 'bad_glb_header', byteLength };
  }
  const declaredLength = readUInt32(view, 8);
  if (declaredLength !== byteLength) {
    return { ok: false, reason: 'bad_glb_header', byteLength };
  }
  // 第一个 chunk 头：chunkLength@12 + chunkType@16（"JSON"），数据从 20 开始
  if (readUInt32(view, 16) !== CHUNK_JSON) {
    return { ok: false, reason: 'json_chunk_missing', byteLength };
  }
  const jsonLength = readUInt32(view, 12);
  const jsonBytes = new Uint8Array(buffer, 20, Math.min(jsonLength, byteLength - 20));
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    return { ok: false, reason: 'json_chunk_missing', byteLength };
  }
  const extensions =
    parsed && typeof parsed === 'object'
      ? (parsed as { extensions?: unknown }).extensions
      : undefined;
  if (!extensions || typeof extensions !== 'object') {
    return { ok: false, reason: 'not_vrm_extension', byteLength };
  }
  const ext = extensions as Record<string, unknown>;
  if (ext.VRMC_vrm) return { ok: true, vrmVersion: '1.0', byteLength };
  if (ext.VRM) return { ok: true, vrmVersion: '0.x', byteLength };
  return { ok: false, reason: 'not_vrm_extension', byteLength };
}

/** 负例样本（驱动脚本/工装页构造，不入库实体文件） */
export function buildSniffFixtures(validVrm: ArrayBuffer): Record<string, ArrayBuffer> {
  const enc = new TextEncoder();
  const toBuffer = (u8: Uint8Array): ArrayBuffer => u8.slice().buffer;
  const zip = enc.encode('PK\u0003\u0004 fake archive');
  const jsonGltf = enc.encode(JSON.stringify({ asset: { version: '2.0' } }));
  const text = enc.encode('this is plain text renamed to .vrm');
  const glbNoVrm = (() => {
    // 结构合法的最小 GLB（JSON chunk），但 extensions 里无 VRM 标记
    const json = enc.encode(JSON.stringify({ asset: { version: '2.0' } }));
    const pad = json.length % 4;
    const jsonPadded = pad === 0 ? json : new Uint8Array([...json, ...new Array(4 - pad).fill(0x20)]);
    const total = 12 + 8 + jsonPadded.length; // header + 单个 JSON chunk（JSON-only GLB 合法）
    const buf = new ArrayBuffer(total);
    const v = new DataView(buf);
    v.setUint32(0, GLB_MAGIC, true);
    v.setUint32(4, 2, true);
    v.setUint32(8, total, true);
    v.setUint32(12, jsonPadded.length, true);
    v.setUint32(16, CHUNK_JSON, true);
    new Uint8Array(buf, 20).set(jsonPadded);
    return buf;
  })();
  return {
    validVrm,
    textRenamed: toBuffer(text),
    zipRenamed: toBuffer(zip),
    textGltf: toBuffer(jsonGltf),
    glbWithoutVrm: glbNoVrm,
  };
}
