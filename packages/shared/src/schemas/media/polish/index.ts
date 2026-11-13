import { z } from 'zod';

/** v2.25：PTT 识别文本润色（只纠错/断句，不改语义） */
export const voicePolishRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export type VoicePolishRequest = z.infer<typeof voicePolishRequestSchema>;

export const voicePolishResponseSchema = z.object({
  text: z.string(),
  /** false=沿用原文（无模型/超时/输出不合格） */
  polished: z.boolean(),
});
export type VoicePolishResponse = z.infer<typeof voicePolishResponseSchema>;
