import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 导出 .md 原文（分享/再编辑真源；文件名用卡名，UTF-8 编码兜底中文） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const card = services.characterCards.get(id);
  const filename = encodeURIComponent(`${card.name || 'character-card'}.md`);
  return new Response(card.rawMarkdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
});
