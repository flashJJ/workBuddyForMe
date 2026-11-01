import { z } from 'zod';

/** v2.15 M3：Provider 凭证轮换结果；不包含任何明文、密文或完整密钥 */
export const secretRotationResultSchema = z.object({
  mode: z.enum(['web', 'desktop']),
  total: z.number().int().nonnegative(),
  rotated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** 无法解密或无法写回的 Provider id，供 UI 提示 */
  skippedProviders: z.array(z.string()),
  failedProviders: z.array(z.string()),
  /** Web 轮换后的新 active key id；Desktop 为 null */
  keyId: z.string().nullable(),
  /** Web 是否将新 active key 同步到旧 master.key；Desktop 为 null */
  legacyKeySynced: z.boolean().nullable(),
});
export type SecretRotationResult = z.infer<typeof secretRotationResultSchema>;
