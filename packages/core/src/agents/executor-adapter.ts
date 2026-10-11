import { createKnowledgeRepository, createTaskRunRepository } from '@wbfm/database';
import type { AgentRunView, SubtaskSpec } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TaskPlanner } from '../agent/types';
import { runTaskLoop } from '../agent/task-loop';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createRetrievalService } from '../retrieval/retrieval-service';
import { sys } from '../i18n/system-text';
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
  /** 助手/节点绑定知识库集合（子任务未显式指定 knowledgeBaseId 时在全部库内检索） */
  assistantKnowledgeBaseIds: string[];
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

/**
 * v1.4 热修：终态说明按真实 stopReason 细分——
 * 旧文案统一写「连续失败/熔断/决策错误」，但模型一次零工具 fail（stopReason=error）
 * 也会显示成「连续失败」，误导排查。
 * lastFailure：最后一个失败步的错误文本（如模型通道 403，可能本身是系统消息标记），
 * 让真实原因直达审查与用户。
 */
function terminalNoteFor(
  status: TaskRunView['status'],
  stopReason: TaskRunView['stopReason'] | null,
  lastFailure?: string,
): string | undefined {
  if (status === 'completed') return undefined;
  if (status === 'failed') {
    if (stopReason === 'breaker') return sys('agentTrace.terminal.breaker');
    if (stopReason === 'max_failures') {
      // cause 截 100 字符，保证嵌套编码后整条不超过 unfinished 的 500 字符 schema 上限
      return lastFailure
        ? sys('agentTrace.terminal.maxFailuresCause', { cause: lastFailure.slice(0, 100) })
        : sys('agentTrace.terminal.maxFailures');
    }
    return sys('agentTrace.terminal.modelGaveUp');
  }
  if (status === 'stopped') {
    if (stopReason === 'max_steps') return sys('agentTrace.terminal.maxSteps');
    return sys('agentTrace.terminal.interrupted');
  }
  return undefined;
}

export function createExecutorAdapter(params: CreateExecutorAdapterParams): ExecutorClient {
  const { deps, runtime } = params;
  const retrieval = createRetrievalService(deps);

  return {
    async run(input, signal) {
      const { subtask } = input;
      const mode = modeFor(subtask);
      const resolution = params.resolvePlanner(mode);
      if (mode === 'screen' && !resolution.visionCapable) {
        throw new Error(sys('agentTrace.terminal.visionRequired'));
      }
      // 子任务显式指定单库时收敛到该库；否则继承助手/节点绑定的全部库
      const knowledgeBaseIds = subtask.knowledgeBaseId
        ? [subtask.knowledgeBaseId]
        : params.assistantKnowledgeBaseIds;
      // 库名注入决策提示词：模型需要知道授权库里装的是简历/项目等什么资料才会主动检索
      const knowledgeRepo = createKnowledgeRepository(deps.db);
      const knowledgeBaseNames = knowledgeBaseIds
        .map((id) => knowledgeRepo.findById(id)?.name ?? '')
        .filter(Boolean);
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
        knowledgeBaseIds,
        // v1.4 热修：把子任务完整要求/验收标准/授权库名下传决策器，消除零工具 fail
        subtaskBrief: subtask.brief,
        subtaskAcceptance: subtask.acceptance,
        knowledgeBaseNames,
        retrieve: async (query, topK, retrieveSignal) =>
          knowledgeBaseIds.length > 0
            ? retrieval.retrieveMany({
                knowledgeBaseIds,
                query,
                ...(topK ? { topK } : {}),
                signal: retrieveSignal,
              })
            : [],
      });

      // 子步事件不逐条上抬（泳道以 handoff/outcome 为粒度）；
      // M4：write/danger HITL 门控帧必须上抬给协作 SSE（用户决策回 /api/tools/confirm 按 callId 解决）
      let final: TaskRunView = taskRun;
      for (;;) {
        const step = await gen.next();
        if (step.done) {
          final = step.value;
          break;
        }
        const loopEvent = step.value;
        if (loopEvent.event === 'tool_confirmation_required') {
          input.emitGateConfirm?.({ ...loopEvent.data, taskScope: taskRun.id });
        }
      }

      const steps = repo.listSteps(taskRun.id);
      const lastFailure = [...steps].reverse().find((s) => s.status === 'failed')?.error ?? '';
      const outcome = buildExecutorOutcome({
        run: final,
        steps,
        terminalNote: terminalNoteFor(final.status, final.stopReason, lastFailure),
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
