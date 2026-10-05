import type { FlowEventPayload, FlowTrigger } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { RetrievalService } from '../retrieval/retrieval-service';
import type { WorkflowRunRepository } from '@wbfm/database';
import { executeToolCall } from '../tools/tool-executor';
import { resolveChatTargetForModelId } from '../chat/model-resolver';
import type { CompiledFlow } from './types';
import { runFlow } from './engine';
import { createFlowRunStore } from './run-store';
import { coerceHumanDecision, type FlowWaitRegistry } from './wait-registry';

export interface FlowExecutionParams {
  runId: string;
  workflowId: string;
  version: number;
  input: Record<string, unknown>;
  trigger: FlowTrigger;
  /** manual=true（可挂起等待内联授权）；chat/api/mcp=false */
  interactive: boolean;
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
  const { deps, runtime, runs, waiters, retrieval, active } = executorDeps;

  function execute(
    compiled: CompiledFlow,
    params: FlowExecutionParams,
  ): AsyncGenerator<FlowEventPayload> {
    const { runId, workflowId, version, input, trigger, interactive } = params;
    const abort = new AbortController();
    const signal = abort.signal;
    active.set(runId, { abort });
    runs.startRun(runId);

    const toolContext = {
      signal,
      knowledgeBaseId: null as string | null,
      visionCapable: false,
      retrieve: (query: string, topK: number) =>
        retrieval.retrieve({ knowledgeBaseId: '', query, topK }),
    };

    const inner = runFlow(compiled, {
      workflowId,
      version,
      runId,
      input,
      trigger,
      interactive,
      signal,
      context: {
        resolveChatTarget: ({ modelId }) => resolveChatTargetForModelId(deps, modelId ?? null),
        retrieve: (query, knowledgeBaseId, topK) =>
          retrieval.retrieve({ knowledgeBaseId, query, topK }),
        resolveTool: async (name) => runtime.resolveTool(name)?.tool ?? null,
        executeTool: (tool, args) => executeToolCall(tool, args, toolContext),
        checkToolAllowed: (toolName, permission) =>
          Boolean(deps.permissions?.isAllowed(toolName, permission, 'all')) ||
          Boolean(deps.taskGrants?.isGranted(toolName, runId)),
        requestToolConfirmation: (req) =>
          waiters
            .request(toolKey(runId, req.nodeId), signal)
            .then((payload) => {
              const allowed = payload === true;
              if (allowed) deps.taskGrants?.grant(req.toolName, runId);
              return allowed;
            }),
        requestHuman: (nodeId) =>
          waiters.request(humanKey(runId, nodeId), signal).then((payload) =>
            coerceHumanDecision(payload),
          ),
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
