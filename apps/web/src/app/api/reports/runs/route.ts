import { createRunEvidenceService } from '@wbfm/core/reports';
import { runEvidenceQuerySchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/runs?from=YYYY-MM-DD&to=YYYY-MM-DD&chain=all|task|flow|agent&format=json|markdown|csv
 * v2.6 M5：跨链路运行证据汇总；只读既有运行表，不新增表。
 */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(runEvidenceQuerySchema, new URL(request.url));
  const service = createRunEvidenceService({ db: services.db });
  if (query.format === 'json') return jsonOk(service.report(query));
  const exported = service.exportReport(query, query.format);
  return new Response(exported.content, {
    headers: {
      'content-type': exported.contentType,
      'content-disposition': `attachment; filename="${exported.filename}"`,
    },
  });
});
