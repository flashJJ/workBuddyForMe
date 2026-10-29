import type { CapabilityManifest } from './capability';

/**
 * v2.12 能力包清单规范化签名输入（纯函数，shared 可被服务端与签名工具共用）。
 *
 * 约束：输入必须是 `capabilityManifestSchema.parse` 后的清单（默认值已应用）；
 * 签名与验签端都调用本函数，禁止各自实现第二套 canonical 逻辑。
 */

export const CAPABILITY_SIGNATURE_DOMAIN = 'capability-manifest-v1';

function canonicalValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical 不支持非有限数字');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(',');
    return `{${body}}`;
  }
  throw new Error(`canonical 不支持的值类型：${typeof value}`);
}

/** 去掉 signature 字段后的稳定 JSON（键递归排序、数组保序、缺省字段保持 schema 结果） */
export function canonicalizeCapabilityManifest(manifest: CapabilityManifest): string {
  const rest: Record<string, unknown> = { ...manifest };
  delete rest.signature;
  return canonicalValue(rest);
}

/** 实际签名/验签的字节串：域前缀 + canonical JSON */
export function capabilitySignaturePayload(manifest: CapabilityManifest): string {
  return `${CAPABILITY_SIGNATURE_DOMAIN}\n${canonicalizeCapabilityManifest(manifest)}`;
}
