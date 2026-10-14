import { z } from 'zod';
import {
  CHARACTER_CARD_SOURCES,
  characterCardCreateSchema,
  type CharacterCardSource,
} from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  source: z.enum(CHARACTER_CARD_SOURCES).optional(),
});

export const GET = defineRoute(({ request, services }) => {
  const { source } = parseSearch(listQuerySchema, new URL(request.url));
  return jsonOk(services.characterCards.list(source as CharacterCardSource | undefined));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(characterCardCreateSchema, await readJsonBody(request));
  // 解析失败（含行号诊断）由统一错误处理为 422；告警不阻断，尽量让粘贴的卡可用
  return jsonOk(services.characterCards.create(input.rawMarkdown), 201);
});
