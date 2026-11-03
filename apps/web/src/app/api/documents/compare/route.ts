import { buildDocumentComparison, COMPARISON_LABELS } from '@wbfm/core/reports';
import { ARTIFACT_TITLE_MAX } from '@wbfm/shared/constants';
import { documentCompareSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.19 M3：两份文档的章节/表格对比，生成 Markdown/HTML 产物（不调用模型） */
export const POST = defineRoute(async ({ request, services }) => {
  const body = parseBody(documentCompareSchema, await readJsonBody(request));
  const leftDoc = services.documents.get(body.leftDocumentId);
  const rightDoc = services.documents.get(body.rightDocumentId);
  const leftView = services.documents.getStructure(body.leftDocumentId);
  const rightView = services.documents.getStructure(body.rightDocumentId);

  const output = buildDocumentComparison(
    {
      documentId: leftDoc.id,
      name: leftDoc.filename,
      structureAvailable: leftView.structureAvailable,
      sections: leftView.sections,
      tables: leftView.tables,
      warnings: leftView.warnings,
    },
    {
      documentId: rightDoc.id,
      name: rightDoc.filename,
      structureAvailable: rightView.structureAvailable,
      sections: rightView.sections,
      tables: rightView.tables,
      warnings: rightView.warnings,
    },
    { format: body.format, locale: body.locale },
  );

  const artifact = services.attachments.saveArtifact({
    title: `${COMPARISON_LABELS[body.locale].title}：${leftDoc.filename} vs ${rightDoc.filename}`.slice(
      0,
      ARTIFACT_TITLE_MAX,
    ),
    filename: output.filename,
    format: body.format,
    content: output.content,
  });

  return jsonOk({
    artifact,
    content: output.content,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    summary: output.summary,
  });
});
