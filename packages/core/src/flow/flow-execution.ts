import type {
  FlowEventPayload,
  FlowTrigger,
  FlowUnattendedPolicy,
  PermissionLevel,
} from '@wbfm/shared/types';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { RetrievalService } from '../retrieval/retrieval-service';
import type { WorkflowRunRepository } from '@wbfm/database';
import { executeToolCall } from '../tools/tool-executor';
import { resolveChatTargetForModelId } from '../chat/model-resolver';
import type { AgentRunService } from '../agents';
import type { CompiledFlow, FlowExecutionContext } from './types';
import { runFlow } from './engine';
import { createFlowRunStore } from './run-store';
import { evaluateUnattendedPolicy } from './policy-gate';
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

    const toolContext = {
      signal,
      knowledgeBaseIds: [] as string[],
      visionCapable: false,
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
      context: {
        resolveChatTarget: ({ modelId }) => resolveChatTargetForModelId(deps, modelId ?? null),
        retrieve: (query, knowledgeBaseId, topK) =>
          retrieval.retrieve({ knowledgeBaseId, query, topK }),
        resolveTool: async (name) => runtime.resolveTool(name)?.tool ?? null,
        executeTool: (tool, args) => executeToolCall(tool, args, toolContext),
        // v0.9：api/mcp 用创建 run 时固化的端点策略快照裁决（纯函数，不读 DB/不挂起）
        ...(unattendedPolicy
          ? {
              evaluateUnattended: (toolName: string, permission: PermissionLevel) =>
                evaluateUnattendedPolicy(unattendedPolicy, toolName, permission),
            }
          : {}),
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

    const store = createFlowRunStore(runs);
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
