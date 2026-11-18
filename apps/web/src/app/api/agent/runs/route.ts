import { createAgentRunRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { agentRunCreateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({ conversationId: z.string().min(1).optional() });

/** GET /api/agent/runs[?conversationId=xxx]：协作运行列表（任务中心「协作任务」区段） */
export const GET = defineRoute(({ request, services }) => {
  const { conversationId } = parseSearch(listQuerySchema, new URL(request.url));
  const repo = createAgentRunRepository(services.db);
  return jsonOk(repo.list({ conversationId: conversationId ?? null }));
});

/**
 * POST /api/agent/runs：发起协作（建行 status=running，不立即驱动）。
 * 前端拿到 runId 后开 EventSource 订阅 GET /api/agent/runs/:id/events 启动协作，
 * 生命周期与 /events 请求对齐（断线联动 abort）——同 tasks 路由模式。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(agentRunCreateSchema, await readJsonBody(request));
  let assistantId = input.assistantId;
  if (input.conversationId) {
    const conversation = services.conversations.get(input.conversationId);
    if (conversation.assistantId !== input.assistantId) {
      throw ApiError.validation('助手与所选会话不匹配');
    }
    assistantId = conversation.assistantId;
  }
  services.assistants.get(assistantId);
  // v4.7：任务模式的用户消息落 messages 表（此前只在 live + agent_runs.goal），
  // 保证任务结束后会话历史完整；同一内容紧邻重发（重新生成）不重复落库。
  if (input.conversationId) {
    const last = services.conversations.recentMessages(input.conversationId, 1)[0];
    const duplicated = last?.role === 'user' && last.content.trim() === input.goal.trim();
    if (!duplicated) {
      services.conversations.appendMessage({
        conversationId: input.conversationId,
        role: 'user',
        content: input.goal,
      });
    }
  }
  const repo = createAgentRunRepository(services.db);
  const run = repo.create({
    assistantId,
    goal: input.goal,
    conversationId: input.conversationId ?? null,
    budget: input.budget,
  });
  return jsonOk(run, 201);
});
