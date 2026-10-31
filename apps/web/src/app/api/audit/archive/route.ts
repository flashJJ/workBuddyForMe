import { ZipFile } from 'yazl';
import { ApiError } from '@wbfm/shared/errors';
import { AUDIT_ARCHIVE_LIMITS, auditArchiveQuerySchema } from '@wbfm/shared/schemas';
import { APP_VERSION } from '@wbfm/shared/version';
import { getSchemaVersion } from '@wbfm/database';
import { buildAuditArchive } from '@wbfm/core/governance';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function finishZip(zip: ZipFile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

function localStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** GET /api/audit/archive?from=&to=：区间归档 ZIP（events.jsonl + anchor.json），不写账本 */
export const GET = defineRoute(async ({ request, services }) => {
  const query = parseSearch(auditArchiveQuerySchema, new URL(request.url));
  const bundle = buildAuditArchive(
    {
      db: services.db,
      audit: services.audit,
      appVersion: APP_VERSION,
      schemaVersion: getSchemaVersion(services.db),
    },
    query,
  );

  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(bundle.eventsJsonl, 'utf8'), 'events.jsonl');
  zip.addBuffer(Buffer.from(JSON.stringify(bundle.anchor, null, 2), 'utf8'), 'anchor.json');
  const buffer = await finishZip(zip);
  if (buffer.length > AUDIT_ARCHIVE_LIMITS.maxZipBytes) {
    throw new ApiError('AUDIT_ARCHIVE_TOO_LARGE', '审计归档 ZIP 超过 20MB 上限');
  }

  const filename = `audit-archive-${localStamp(new Date())}.zip`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': String(buffer.length),
      'cache-control': 'no-store',
    },
  });
});
