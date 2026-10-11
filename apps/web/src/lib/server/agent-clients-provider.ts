import type { AgentRunView } from '@wbfm/shared/schemas';
import { createLlmPlanner } from '@wbfm/core/agent';
import {
  createExecutorAdapter,
  createLlmPlannerClient,
  createLlmReviewerClient,
  DESKTOP_BUILTIN_TOOLS,
  resolveRoleTarget,
  targetHasVision,
  type AgentClients,
  type AgentClientsProvider,
  type AgentPlanContextResolver,
} from '@wbfm/core/agents';
import type { ServiceDeps } from '@wbfm/core/services';
import type { ToolRuntime } from '@wbfm/core/tools';
import type { AssistantsService, KnowledgeService } from '@wbfm/core/services';

/**
 * v1.4 M2 协作角色生产通道装配（web 容器使用）：
 * - 三角色模型经 resolveRoleTarget 三级回落（节点覆盖→助手角色覆盖→助手通用→系统默认）；
 * - Planner/Reviewer 走 M1 纯协议 LLM 客户端；
 * - Executor 走 task-loop 适配器（screen/tool 模式由子任务单声明，视觉仅 screen 门控）。
 */
export interface AgentClientsFactoryDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  assistants: AssistantsService;
  knowledgeBases: KnowledgeService;
}

const DESKTOP_TOOL_SET: ReadonlySet<string> = new Set(DESKTOP_BUILTIN_TOOLS);

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
    const assistant = factory.assistants.get(run.assistantId);
    const knowledgeBaseHint = assistant.knowledgeBaseId
      ? {
          id: assistant.knowledgeBaseId,
          name: factory.knowledgeBases.get(assistant.knowledgeBaseId)?.name ?? '已绑定知识库',
        }
      : null;
    return {
      availableToolScopes: deriveToolScopes(assistant.enabledTools),
      knowledgeBaseHint,
    };
  };
}

export function createAgentClientsProvider(factory: AgentClientsFactoryDeps): AgentClientsProvider {
  return ({ run }) => {
    const assistant = factory.assistants.get(run.assistantId);
    const { db, cipher } = factory.deps;
    const plannerTarget = resolveRoleTarget({ db, cipher }, assistant, 'planner');
    const reviewerTarget = resolveRoleTarget({ db, cipher }, assistant, 'reviewer');
    const executorTarget = resolveRoleTarget({ db, cipher }, assistant, 'executor');

    const executor = createExecutorAdapter({
      deps: factory.deps,
      runtime: factory.runtime,
      run,
      assistantKnowledgeBaseId: assistant.knowledgeBaseId,
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
      planner: createLlmPlannerClient(plannerTarget),
      executor,
      reviewer: createLlmReviewerClient(reviewerTarget),
    } satisfies AgentClients;
  };
}
