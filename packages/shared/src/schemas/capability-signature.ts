import type { CapabilityManifest } from './capability';
import { canonicalJson } from './canonical-json';

/**
 * v2.12 能力包清单规范化签名输入（纯函数，shared 可被服务端与签名工具共用）。
 *
 * 约束：输入必须是 `capabilityManifestSchema.parse` 后的清单（默认值已应用）；
 * 签名与验签端都调用本函数，禁止各自实现第二套 canonical 逻辑。
 */

export const CAPABILITY_SIGNATURE_DOMAIN = 'capability-manifest-v1';

/** 去掉 signature 字段后的稳定 JSON（键递归排序、数组保序、缺省字段保持 schema 结果） */
export function canonicalizeCapabilityManifest(manifest: CapabilityManifest): string {
  const rest: Record<string, unknown> = { ...manifest };
  delete rest.signature;
  return canonicalJson(rest);
}

/** 实际签名/验签的字节串：域前缀 + canonical JSON */
export function capabilitySignaturePayload(manifest: CapabilityManifest): string {
  return `${CAPABILITY_SIGNATURE_DOMAIN}\n${canonicalizeCapabilityManifest(manifest)}`;
}
