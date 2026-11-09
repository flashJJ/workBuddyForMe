import { z } from 'zod';
import {
  ARTIFACT_BATCH_MAX_COUNT,
  exportArtifactsBatch,
} from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { readJsonBody, parseBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const exportRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(ARTIFACT_BATCH_MAX_COUNT),
});

function disposition(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** POST /api/artifacts/export — 产物多选打包为 tar.gz（含 manifest.json） */
export const POST = defineRoute(async ({ request, services }) => {
  const { ids } = parseBody(exportRequestSchema, await readJsonBody(request));
  const result = await exportArtifactsBatch(services.db, ids);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(result.archive), {
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': disposition(`wbfm-artifacts-${stamp}.tar.gz`),
      'content-length': String(result.archive.byteLength),
      'x-artifact-count': String(result.count),
      'x-artifact-bytes': String(result.totalBytes),
    },
  });
});
