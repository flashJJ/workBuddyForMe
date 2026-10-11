import { createTaskRunRepository } from '@wbfm/database';
import type { AgentRunView, SubtaskSpec } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TaskPlanner } from '../agent/types';
import { runTaskLoop } from '../agent/task-loop';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createRetrievalService } from '../retrieval/retrieval-service';
import { buildExecutorOutcome } from './executor-outcome';
import type { ExecutorClient } from './runner-types';

/**
 * v1.4 M2 Executor 适配器：把子任务单交给执行通道并收敛为 ExecutorOutcome。
 * 观察模式由子任务单一次性声明（不中途切换）：
 * - toolScopes 含 'desktop' → screen（截图+SOM 循环，要求视觉模型）；
 * - 其余 → tool（无截图，观察内容=工具结果与检索片段）。
 */

export type ObserveMode = 'screen' | 'tool';

/** 桌面内置能力白名单（与 web task-launcher 同清单；本文件为唯一真源） */
export const DESKTOP_BUILTIN_TOOLS = [
  'screen_snapshot',
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
  'window_list',
  'window_focus',
  'app_launch',
  'uia_list',
] as const;

export interface ExecutorPlannerResolution {
  planner: TaskPlanner;
  /** planner 实现每次 decide 后累计写入（适配器结束时读账） */
  usage: { promptTokens: number; completionTokens: number };
  /** screen 模式必须为 true（视觉门控在生产侧解析模型能力） */
  visionCapable: boolean;
}

export interface CreateExecutorAdapterParams {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  run: Pick<AgentRunView, 'id' | 'conversationId' | 'assistantId' | 'budget' | 'goal'>;
  /** 助手绑定知识库（子任务未显式指定 knowledgeBaseId 时回落） */
  assistantKnowledgeBaseId: string | null;
  /** 按观察模式取得决策器（生产侧完成角色模型三级回落；测试注入脚本） */
  resolvePlanner: (mode: ObserveMode) => ExecutorPlannerResolution;
}

/**
 * 工具域 → 可执行工具白名单：
 * desktop=全部内置桌面能力；knowledge=knowledge_search；
 * mcp:<服务器>=该服已连接的全部限定名工具；其余（flow:<id>/具体限定名）原样透传。
 * 白名单外的工具在 task-loop 内被拒——提示词注入无法越权。
 */
export function resolveAllowedTools(scopes: string[] | undefined, deps: ServiceDeps): string[] {
  if (!scopes || scopes.length === 0) return [];
  const tools = new Set<string>();
  const mcpTools = deps.mcp?.getTools() ?? [];
  for (const scope of scopes) {
    if (scope === 'desktop') {
      for (const name of DESKTOP_BUILTIN_TOOLS) tools.add(name);
    } else if (scope === 'knowledge') {
      tools.add('knowledge_search');
    } else if (scope.startsWith('mcp:')) {
      const server = scope.slice(4);
      for (const info of mcpTools) {
        if (info.serverName === server) tools.add(info.qualifiedName);
      }
    } else {
      tools.add(scope);
    }
  }
  return [...tools];
}

function modeFor(subtask: SubtaskSpec): ObserveMode {
  return subtask.toolScopes?.includes('desktop') ? 'screen' : 'tool';
}

const TERMINAL_NOTE: Partial<Record<TaskRunView['status'], string>> = {
  stopped: '执行被中断（用户急停/连接断开），未完成',
  failed: '执行以失败终态结束（连续失败/熔断/决策错误）',
};

export function createExecutorAdapter(params: CreateExecutorAdapterParams): ExecutorClient {
  const { deps, runtime } = params;
  const retrieval = createRetrievalService(deps);

  return {
    async run(input, signal) {
      const { subtask } = input;
      const mode = modeFor(subtask);
      const resolution = params.resolvePlanner(mode);
      if (mode === 'screen' && !resolution.visionCapable) {
        throw new Error('屏幕（screen）观察模式要求视觉模型，当前 executor 模型不具备视觉能力');
      }
      const knowledgeBaseId = subtask.knowledgeBaseId ?? params.assistantKnowledgeBaseId;
      const allowedTools = resolveAllowedTools(subtask.toolScopes, deps);
      const repo = createTaskRunRepository(deps.db);
      const taskRun = repo.createRun({
        // Flow/无会话入口 v020 起 task_runs.conversation_id 可空
        conversationId: params.run.conversationId,
        assistantId: params.run.assistantId,
        goal: `[${subtask.title}] ${params.run.goal}`.slice(0, 2000),
        maxSteps: params.run.budget.maxSteps,
        agentRunId: params.run.id,
      });

      const gen = runTaskLoop({
        deps,
        runtime,
        planner: resolution.planner,
        run: taskRun,
        allowedTools,
        visionCapable: resolution.visionCapable,
        signal,
        observeMode: mode,
        knowledgeBaseId,
        retrieve: async (query, topK, retrieveSignal) =>
          knowledgeBaseId
            ? retrieval.retrieve({ knowledgeBaseId, query, ...(topK ? { topK } : {}), signal: retrieveSignal })
            : [],
      });

      // M2 不转发子步事件（M3 Flow 泳道接线）；显式 next 以取生成器返回值
      let final: TaskRunView = taskRun;
      for (;;) {
        const step = await gen.next();
        if (step.done) {
          final = step.value;
          break;
        }
      }

      const steps = repo.listSteps(taskRun.id);
      const outcome = buildExecutorOutcome({
        run: final,
        steps,
        terminalNote: TERMINAL_NOTE[final.status],
      });
      return {
        outcome,
        usage: {
          promptTokens: resolution.usage.promptTokens,
          completionTokens: resolution.usage.completionTokens,
        },
        steps: steps.filter((s) => s.kind === 'action').length,
      };
    },
  };
}
