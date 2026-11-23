import type {
  FlowEventPayload,
  FlowTrigger,
  FlowUnattendedPolicy,
  PermissionLevel,
} from '@wbfm/shared/types';
import type { ServiceDeps } from '../../services/base/deps';
import type { ToolRuntime } from '../../tools/tool-runtime';
import type { RetrievalService } from '../../retrieval/retrieval-service';
import type { WorkflowRunRepository } from '@wbfm/database';
import { executeToolCall } from '../../tools/tool-executor';
import {
  createToolTurnBudget,
  recordToolBudgetUsage,
  toolBudgetExceeded,
} from '../../tools/budget/turn-budget';
import { resolveChatTargetForModelId } from '../../chat/context/model-resolver';
import { resolveEffectiveContextWindow } from '../../chat/context/window/effective-window';
import { createSettingsService } from '../../services/settings/settings-service';
import { DEFAULT_CONTEXT_TOKEN_BUDGET, RESEARCH_DEPTH_DEFAULT, type ResearchDepth } from '@wbfm/shared/constants';
import type { CachedWebPage } from '../../tools/types';
import type { AgentRunService } from '../../agents/index';
import type { CompiledFlow, FlowCheckpoint, FlowExecutionContext } from '../graph/types';
import { runFlow } from '../engine/engine';
import { createFlowRunStore } from './run-store';
import { evaluateUnattendedPolicy } from '../policy/policy-gate';
import { coerceHumanDecision, type FlowWaitRegistry } from './wait-registry';

export interface FlowExecutionParams {
  runId: string;
  workflowId: string;
  version: number;
  input: Record<string, unknown>;
  trigger: FlowTrigger;
  /** manual=true（可挂起等待内联授权）；chat/api/mcp=false */
  interactive: boolean;
  /** v0.9：api/mcp 触发时的端点策略快照（创建 run 时固化；manual/chat 不传） */
  unattendedPolicy?: FlowUnattendedPolicy;
  /** v0.9 重放：仅执行祖先闭包内节点 */
  onlyNodeIds?: ReadonlySet<string>;
  /** v0.9 节点重放目标（跑到该节点即收尾） */
  replayTargetId?: string;
  /** v4.23：续跑检查点（启动恢复时注入） */
  checkpoint?: FlowCheckpoint;
  /** v4.23：续跑原因（写入 run_started） */
  resumeReason?: string;
}

interface ActiveEntry {
  abort: AbortController;
}

export interface FlowExecutorDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  runs: WorkflowRunRepository;
  waiters: FlowWaitRegistry;
  retrieval: RetrievalService;
  active: Map<string, ActiveEntry>;
  /** v1.4：agent 节点协作运行服务 */
  agentRuns?: AgentRunService;
}

export interface FlowExecutor {
  /**
   * 执行一个已认领（claimQueued）或直接发起（chat）的 run，产出事件流。
   * 调用方负责迭代并把事件发布给观察者；本生成器只负责执行、落库与 active 收尾。
   */
  execute(compiled: CompiledFlow, params: FlowExecutionParams): AsyncGenerator<FlowEventPayload>;
}

const humanKey = (runId: string, nodeId: string) => `${runId}:human:${nodeId}`;
const toolKey = (runId: string, nodeId: string) => `${runId}:tool:${nodeId}`;

/** v4.11：流程内工具预算同样按默认对话模型的窗口与检索深度解析 */
function resolveFlowBudgetScope(deps: ServiceDeps): { contextWindow: number; depth: ResearchDepth } {
  let contextWindow = DEFAULT_CONTEXT_TOKEN_BUDGET;
  try {
    contextWindow = resolveEffectiveContextWindow(resolveChatTargetForModelId(deps, null).model).effective;
  } catch {
    // 未配置默认模型：用兜底窗口
  }
  let depth: ResearchDepth = RESEARCH_DEPTH_DEFAULT;
  try {
    depth = createSettingsService(deps).get().searchSettings?.researchDepth ?? RESEARCH_DEPTH_DEFAULT;
  } catch {
    // 设置不可读：标准档
  }
  return { contextWindow, depth };
}

export function createFlowExecutor(executorDeps: FlowExecutorDeps): FlowExecutor {
  const { deps, runtime, runs, waiters, retrieval, active, agentRuns } = executorDeps;

  function execute(
    compiled: CompiledFlow,
    params: FlowExecutionParams,
  ): AsyncGenerator<FlowEventPayload> {
    const { runId, workflowId, version, input, trigger, interactive, unattendedPolicy } = params;
    const abort = new AbortController();
    const signal = abort.signal;
    active.set(runId, { abort });
    runs.startRun(runId);

    let hasBaselineSnapshot = false;
    // v4.11：流程内工具同样受单次运行的联网预算约束（对话里常把整条流程当一个工具调用）
    const scope = resolveFlowBudgetScope(deps);
    const toolBudget = createToolTurnBudget(scope.contextWindow, scope.depth);
    const toolContext = {
      signal,
      knowledgeBaseIds: [] as string[],
      visionCapable: false,
      // v4.11：流程运行内共享网页缓存，read_fetched 可续读
      webCache: new Map<string, CachedWebPage>(),
      retrieve: (query: string, topK: number) =>
        retrieval.retrieveMany({ knowledgeBaseIds: [], query, topK }),
    };

    const inner = runFlow(compiled, {
      workflowId,
      version,
      runId,
      input,
      trigger,
      interactive,
      signal,
      onlyNodeIds: params.onlyNodeIds,
      replayTargetId: params.replayTargetId,
      ...(params.checkpoint ? { checkpoint: params.checkpoint } : {}),
      ...(params.resumeReason ? { resumeReason: params.resumeReason } : {}),
      context: {
        resolveChatTarget: ({ modelId }) => resolveChatTargetForModelId(deps, modelId ?? null),
        recordContextSnapshot: (payload) => {
          // v4.10：首条基线必写，之后仅在截断时追加，控制事件量
          if (hasBaselineSnapshot && !payload.truncated) return;
          hasBaselineSnapshot = true;
          deps.events?.record({
            scope: 'flow',
            scopeId: runId,
            type: 'context_scene_snapshot',
            payload,
          });
        },
        retrieve: (query, knowledgeBaseId, topK) =>
          retrieval.retrieve({ knowledgeBaseId, query, topK }),
        resolveTool: async (name) => runtime.resolveTool(name)?.tool ?? null,
        executeTool: (tool, args) => {
          const denial = toolBudgetExceeded(toolBudget, tool.name);
          if (denial) return Promise.resolve(denial);
          return executeToolCall(tool, args, toolContext).then((result) => {
            recordToolBudgetUsage(toolBudget, result.output);
            return result;
          });
        },
        // v0.9：api/mcp 用创建 run 时固化的端点策略快照裁决（纯函数，不读 DB/不挂起）
        ...(unattendedPolicy
          ? {
              evaluateUnattended: (toolName: string, permission: PermissionLevel) =>
                evaluateUnattendedPolicy(unattendedPolicy, toolName, permission),
            }
          : {}),
        auditToolDenied: (input) =>
          deps.audit?.safeAppend({
            kind: 'flow_agent_tool_denied',
            actor: 'system',
            runId,
            reasonCode: input.reason,
            outcome: JSON.stringify(input),
          }),
        checkToolAllowed: (toolName, permission) =>
          Boolean(deps.permissions?.isAllowed(toolName, permission, 'all')) ||
          Boolean(deps.taskGrants?.isGranted(toolName, runId)),
        requestToolConfirmation: (req) => {
          const key = toolKey(runId, req.nodeId);
          const pending = waiters.request(key, signal);
          const approval = deps.approvals?.register(
            {
              id: `flow:${runId}:tool:${req.nodeId}`,
              source: 'flow',
              title: `工具节点授权：${req.toolName}`,
              tool: req.toolName,
              permission: req.permission,
              argsSummary: req.argsSummary,
              runId,
              deepLink: `/flows/${params.workflowId}?run=${runId}`,
            },
            (decision) => {
              waiters.resolve(key, decision.action === 'allow');
            },
          );
          if (approval) void pending.finally(() => approval.remove());
          return pending.then((payload) => {
            const allowed = payload === true;
            if (allowed) deps.taskGrants?.grant(req.toolName, runId);
            return allowed;
          });
        },
        requestHuman: (nodeId) => {
          const key = humanKey(runId, nodeId);
          const pending = waiters.request(key, signal);
          const approval = deps.approvals?.register(
            {
              id: `flow:${runId}:human:${nodeId}`,
              source: 'flow',
              title: `人工审核：${nodeId}`,
              runId,
              deepLink: `/flows/${params.workflowId}?run=${runId}`,
            },
            (decision) => {
              waiters.resolve(key, {
                approved: decision.action === 'allow',
                values: decision.values ?? {},
              });
            },
          );
          if (approval) void pending.finally(() => approval.remove());
          return pending.then((payload) => coerceHumanDecision(payload));
        },
        // v1.4 agent 节点：协作随流程信号取消；节点 id 即 node_execution 关联键
        ...(agentRuns
          ? {
              startAgentCollab: (input: Parameters<NonNullable<FlowExecutionContext['startAgentCollab']>>[0]) =>
                agentRuns.startFlowNode({ ...input, signal }),
            }
          : {}),
      },
    });

    // 续跑：复用已落库的节点执行行，避免同一节点产生重复记录
    const initialNodeExecIds = params.checkpoint
      ? new Map(runs.listNodeExecutions(runId).map((node) => [node.nodeId, node.id]))
      : undefined;
    const store = createFlowRunStore(runs, initialNodeExecIds);
    return (async function* wrapped() {
      try {
        for await (const event of inner) {
          store.persist(event);
          yield event;
        }
      } finally {
        active.delete(runId);
        deps.taskGrants?.clear(runId);
      }
    })();
  }

  return { execute };
}
