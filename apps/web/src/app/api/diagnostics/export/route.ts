import { ZipFile } from 'yazl';
import { ApiError } from '@wbfm/shared/errors';
import { APP_VERSION } from '@wbfm/shared/version';
import { collectDiagnostics } from '@wbfm/core/diagnostics';
import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ZIP_BYTES = 10 * 1024 * 1024;

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

/**
 * GET /api/diagnostics/export：本地生成脱敏诊断包（yazl，白名单组装，不上传）。
 * 超时由收集器抛出 DIAGNOSTICS_TIMEOUT(503)。
 */
export const GET = defineRoute(async ({ services }) => {
  const bundle = collectDiagnostics({
    db: services.db,
    settings: services.settings.get(),
    audit: services.audit,
    capabilities: services.capabilities,
    sessions: services.sessionLog,
  });

  const zip = new ZipFile();
  for (const file of bundle.files) {
    zip.addBuffer(Buffer.from(file.content, 'utf8'), file.path);
  }
  const buffer = await finishZip(zip);
  if (buffer.length > MAX_ZIP_BYTES) {
    throw new ApiError('INTERNAL_ERROR', '诊断包超过 10MB 上限');
  }

  const filename = `wbfm-diagnostics-${APP_VERSION}-${localStamp(new Date())}.zip`;
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
