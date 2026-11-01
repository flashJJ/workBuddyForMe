import { z } from 'zod';

/** v2.14：诊断包 manifest 契约（本地生成，不上传；白名单组装） */

export const DIAGNOSTIC_FORMAT_VERSION = 1;

export const diagnosticEntrySchema = z.object({
  path: z.string(),
  size: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DiagnosticEntry = z.infer<typeof diagnosticEntrySchema>;

export const diagnosticManifestSchema = z.object({
  formatVersion: z.literal(DIAGNOSTIC_FORMAT_VERSION),
  appVersion: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  platform: z.string(),
  arch: z.string(),
  generatedAt: z.string(),
  entries: z.array(diagnosticEntrySchema),
});
export type DiagnosticManifest = z.infer<typeof diagnosticManifestSchema>;
