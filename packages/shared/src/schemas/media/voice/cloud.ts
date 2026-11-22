import { z } from 'zod';

/**
 * 在线 TTS 凭据契约（腾讯云）：write-only 更新 + 脱敏读视图。
 * v4.19 从 media/voice.ts 拆出，避免语音契约文件继续膨胀。
 */

export const voiceCloudCredentialsUpdateSchema = z
  .object({
    secretId: z.string().min(1).max(256).optional(),
    secretKey: z.string().min(1).max(512).optional(),
    region: z.string().min(1).max(64).optional(),
    /** 清除已保存凭据（优先于本次提交的字段） */
    clear: z.boolean().optional(),
  })
  .strict();
export type VoiceCloudCredentialsUpdateInput = z.infer<typeof voiceCloudCredentialsUpdateSchema>;

export const voiceCloudCredentialsViewSchema = z.object({
  hasCredentials: z.boolean(),
  maskedSecretId: z.string().nullable(),
  region: z.string(),
});
export type VoiceCloudCredentialsView = z.infer<typeof voiceCloudCredentialsViewSchema>;
