/** 敏感值在 settings 轨中的占位 */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * settings_kv 脱敏：任何形如 { encrypted: true, ciphertext: string } 的 JSON 值，
 * 用 '[REDACTED]' 替换 ciphertext。递归处理嵌套结构。
 */
export function sanitizeSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = deepSanitize(value);
  }
  return out;
}

function deepSanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (obj.encrypted === true && typeof obj.ciphertext === 'string') {
    return { ...obj, ciphertext: REDACTED_PLACEHOLDER };
  }
  if (Array.isArray(value)) return value.map(deepSanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = deepSanitize(v);
  return out;
}
