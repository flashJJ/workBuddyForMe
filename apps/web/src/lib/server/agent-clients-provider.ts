import type { AgentRunView } from '@wbfm/shared/schemas';
import type { Assistant } from '@wbfm/shared/types';
import { createLlmPlanner } from '@wbfm/core/agent';
import { resolveChatTargetForModelId } from '@wbfm/core/chat';
import {
  createExecutorAdapter,
  createLlmPlannerClient,
  createLlmReviewerClient,
  DESKTOP_BUILTIN_TOOLS,
  targetHasVision,
  type AgentClients,
  type AgentClientsProvider,
  type AgentPlanContextResolver,
  type AgentRoleKey,
} from '@wbfm/core/agents';
import type { ServiceDeps } from '@wbfm/core/services';
import type { ToolRuntime } from '@wbfm/core/tools';
import type { AssistantsService, KnowledgeService } from '@wbfm/core/services';

/**
 * v1.4 协作角色生产通道装配（web 容器使用）：
 * - 三角色模型回落顺序：节点覆盖（Flow agent）→ 助手角色覆盖 → 助手通用 → 系统默认；
 * - Planner/Reviewer 走 M1 纯协议 LLM 客户端；
 * - Executor 走 task-loop 适配器（screen/tool 模式由子任务单声明，视觉仅 screen 门控）；
 * - 无助手的 Flow 节点（assistantId 为空）仅用节点显式模型/知识库与系统默认。
 */
export interface AgentClientsFactoryDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  assistants: AssistantsService;
  knowledgeBases: KnowledgeService;
}

const DESKTOP_TOOL_SET: ReadonlySet<string> = new Set(DESKTOP_BUILTIN_TOOLS);
const ROLE_KEYS = ['planner', 'executor', 'reviewer'] as const;
const ROLE_FIELD: Record<AgentRoleKey, 'plannerModelId' | 'executorModelId' | 'reviewerModelId'> = {
  planner: 'plannerModelId',
  executor: 'executorModelId',
  reviewer: 'reviewerModelId',
};

/** enabledTools → planner 可见工具域（knowledge/desktop/mcp:<服务器>/具体限定名） */
function deriveToolScopes(enabledTools: readonly string[]): string[] {
  const scopes = new Set<string>();
  for (const tool of enabledTools) {
    if (tool === 'knowledge_search') {
      scopes.add('knowledge');
    } else if (DESKTOP_TOOL_SET.has(tool)) {
      scopes.add('desktop');
    } else if (tool.startsWith('mcp:')) {
      scopes.add(tool.split(':').slice(0, 2).join(':'));
    } else {
      scopes.add(tool); // flow:<id> 等具体限定名原样透传
    }
  }
  return [...scopes];
}

/** 规划上下文：工具域 + 绑定知识库名提示（planner 回填 knowledgeBaseId 用） */
export function createAgentPlanContextResolver(
  factory: AgentClientsFactoryDeps,
): AgentPlanContextResolver {
  return (run: AgentRunView) => {
    const assistant = run.assistantId ? factory.assistants.get(run.assistantId) : null;
    const knowledgeBaseHints = (assistant?.knowledgeBaseIds ?? [])
      .map((id) => ({
        id,
        name: factory.knowledgeBases.get(id)?.name ?? '已绑定知识库',
      }));
    return {
      availableToolScopes: assistant ? deriveToolScopes(assistant.enabledTools) : [],
      knowledgeBaseHints,
    };
  };
}

export function createAgentClientsProvider(factory: AgentClientsFactoryDeps): AgentClientsProvider {
  return ({ run, overrides }) => {
    const assistant: Assistant | null = run.assistantId
      ? factory.assistants.get(run.assistantId)
      : null;
    const { db, cipher } = factory.deps;

    const resolveTarget = (role: (typeof ROLE_KEYS)[number]) =>
      resolveChatTargetForModelId(
        { db, cipher },
        overrides?.roleModelIds?.[role] ?? assistant?.[ROLE_FIELD[role]] ?? assistant?.modelId ?? null,
      );

    // 节点显式多库优先；未配置（空数组）回落助手绑定集合
    const knowledgeBaseIds =
      overrides && overrides.knowledgeBaseIds && overrides.knowledgeBaseIds.length > 0
        ? overrides.knowledgeBaseIds
        : assistant?.knowledgeBaseIds ?? [];
    const executorTarget = resolveTarget('executor');

    const executor = createExecutorAdapter({
      deps: factory.deps,
      runtime: factory.runtime,
      run,
      assistantKnowledgeBaseIds: knowledgeBaseIds,
      resolvePlanner: () => {
        // 用量对象由 planner onUsage 就地累计，适配器在本轮结束时读账
        const usage = { promptTokens: 0, completionTokens: 0 };
        const planner = createLlmPlanner(executorTarget, {
          onUsage: (u) => {
            usage.promptTokens = u.promptTokens;
            usage.completionTokens = u.completionTokens;
          },
        });
        return { planner, usage, visionCapable: targetHasVision(executorTarget) };
      },
    });

    return {
      planner: createLlmPlannerClient(resolveTarget('planner')),
      executor,
      reviewer: createLlmReviewerClient(resolveTarget('reviewer')),
    } satisfies AgentClients;
  };
}
