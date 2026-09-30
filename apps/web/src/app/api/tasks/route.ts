import { createTaskRunRepository } from '@wbfm/database';
import { taskCreateSchema, TASK_MAX_STEPS } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({ conversationId: z.string().min(1).optional() });

/** GET /api/tasks[?conversationId=xxx]：列出任务运行（按创建时间倒序）。
 * 不传 conversationId 时返回跨会话总览（任务面板首页用）。 */
export const GET = defineRoute(({ request, services }) => {
  const { conversationId } = parseSearch(listQuerySchema, new URL(request.url));
  const repo = createTaskRunRepository(services.db);
  return jsonOk(conversationId ? repo.listRunsByConversation(conversationId) : repo.listAllRuns());
});

/**
 * POST /api/tasks：创建任务运行（status=queued），不立即启动循环。
 * 前端拿到 runId 后开 EventSource 订阅 GET /api/tasks/:id/events 触发循环。
 * 不在 POST 内启动的原因：SSE 流断开（页面关闭）应能联动停止任务，
 * 让循环生命周期与 /events 请求生命周期对齐。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(taskCreateSchema, await readJsonBody(request));
  // 校验会话 + 助手存在（会话服务 notFound 自动抛 404）
  const conversation = services.conversations.get(input.conversationId);
  services.assistants.get(conversation.assistantId);
  const repo = createTaskRunRepository(services.db);
  const run = repo.createRun({
    conversationId: input.conversationId,
    assistantId: conversation.assistantId,
    goal: input.goal,
    maxSteps: input.maxSteps ?? TASK_MAX_STEPS,
  });
  return jsonOk(run, 201);
});
