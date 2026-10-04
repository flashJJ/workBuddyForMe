import { ApiError, type FlowEventPayload, type FlowHumanSubmitInput, type FlowTrigger } from '@wbfm/shared';
import type { WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { Tool } from '../tools/types';
import { createRetrievalService } from '../retrieval/retrieval-service';
import { executeToolCall } from '../tools/tool-executor';
import { resolveChatTargetForModelId } from '../chat/model-resolver';
import { compileFlow } from './compiler';
import { runFlow } from './engine';
import { createFlowRunStore } from './run-store';
import { createFlowWaitRegistry, type FlowWaitRegistry } from './wait-registry';
import { buildFlowTool } from './flow-tool';
import type { FlowHumanDecision } from './types';

export interface StartFlowParams {
  workflowId: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  conversationId?: string | null;
  /** 试运行 true（挂起等待）；对话触发 false（人工/授权自动拒绝） */
  interactive?: boolean;
  clientSignal?: AbortSignal;
}

export interface StartedFlow {
  runId: string;
  events: AsyncGenerator<FlowEventPayload>;
}

interface ActiveEntry {
  abort: AbortController;
}

export interface FlowRunServiceDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  waiters?: FlowWaitRegistry;
}

export interface FlowRunService {
  start(params: StartFlowParams): StartedFlow;
  submitHuman(runId: string, nodeId: string, body: FlowHumanSubmitInput): boolean;
  submitToolConfirmation(runId: string, nodeId: string, allowed: boolean): boolean;
  cancel(runId: string): boolean;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  /** 第三工具来源：已发布流程 → flow:<id> 工具；未发布返回 null */
  resolveAsTool(workflowId: string): Tool | null;
}

const humanKey = (runId: string, nodeId: string) => `${runId}:human:${nodeId}`;
const toolKey = (runId: string, nodeId: string) => `${runId}:tool:${nodeId}`;

export function createFlowRunService(serviceDeps: FlowRunServiceDeps): FlowRunService {
  const { deps, runtime, workflows, runs } = serviceDeps;
  const waiters = serviceDeps.waiters ?? createFlowWaitRegistry();
  const retrieval = createRetrievalService(deps);
  const active = new Map<string, ActiveEntry>();

  function loadCompiledGraph(workflowId: string, requirePublished: boolean) {
    const wf = workflows.getWorkflow(workflowId);
    if (!wf) throw ApiError.notFound('工作流不存在');
    if (requirePublished && wf.status !== 'published') {
      throw ApiError.validation('工作流尚未发布');
    }
    const versionView = workflows.getCurrentVersion(workflowId);
    if (!versionView) throw ApiError.validation('工作流还没有已保存的版本');
    const result = compileFlow(versionView.graph);
    if (!result.compiled) {
      const detail = result.diagnostics.map((d) => `[${d.severity}] ${d.message}`).join('；');
      throw ApiError.validation(`工作流图校验未通过：${detail}`);
    }
    return { wf, version: versionView.version, compiled: result.compiled, graph: versionView.graph };
  }

  const start: FlowRunService['start'] = (params) => {
    const trigger = params.trigger ?? 'manual';
    const interactive = params.interactive ?? trigger === 'manual';
    const { version, compiled } = loadCompiledGraph(workflowIdOf(params), trigger === 'chat');

    const run = runs.createRun({
      workflowId: params.workflowId,
      version,
      trigger,
      input: params.input ?? {},
      conversationId: params.conversationId ?? null,
    });
    runs.startRun(run.id);

    const abort = new AbortController();
    const signal = params.clientSignal
      ? AbortSignal.any([params.clientSignal, abort.signal])
      : abort.signal;
    active.set(run.id, { abort });

    const toolContext = {
      signal,
      knowledgeBaseId: null as string | null,
      visionCapable: false,
      retrieve: (query: string, topK: number) =>
        retrieval.retrieve({ knowledgeBaseId: '', query, topK }),
    };

    const inner = runFlow(compiled, {
      workflowId: params.workflowId,
      version,
      runId: run.id,
      input: params.input ?? {},
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
          Boolean(deps.taskGrants?.isGranted(toolName, run.id)),
        requestToolConfirmation: (req) =>
          waiters
            .request(toolKey(run.id, req.nodeId), signal)
            .then((payload) => {
              const allowed = payload === true;
              if (allowed) deps.taskGrants?.grant(req.toolName, run.id);
              return allowed;
            }),
        requestHuman: (nodeId) =>
          waiters.request(humanKey(run.id, nodeId), signal).then((payload) =>
            coerceHumanDecision(payload),
          ),
      },
    });

    const store = createFlowRunStore(runs);
    const events = (async function* () {
      try {
        for await (const event of inner) {
          store.persist(event);
          yield event;
        }
      } finally {
        active.delete(run.id);
        deps.taskGrants?.clear(run.id);
      }
    })();

    return { runId: run.id, events };
  };

  /** 对话触发执行（非交互）：消费完整事件流，收敛为最终输出或错误 */
  async function invokeFromChat(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: true; output: unknown } | { ok: false; error: string }> {
    const { events } = start({ workflowId, input, trigger: 'chat', interactive: false });
    for await (const event of events) {
      if (event.type === 'run_succeeded') return { ok: true, output: event.output };
      if (event.type === 'run_failed') return { ok: false, error: event.message };
      if (event.type === 'run_cancelled') return { ok: false, error: '工作流执行被中断' };
    }
    return { ok: false, error: '工作流未产出结果（事件流意外结束）' };
  }

  return {
    start,
    submitHuman(runId, nodeId, body) {
      const decision: FlowHumanSubmitInput = {
        nodeId: body.nodeId ?? nodeId,
        approved: body.approved,
        values: body.values ?? {},
      };
      return waiters.resolve(humanKey(runId, nodeId), decision);
    },
    submitToolConfirmation(runId, nodeId, allowed) {
      return waiters.resolve(toolKey(runId, nodeId), allowed);
    },
    cancel(runId) {
      const entry = active.get(runId);
      if (!entry) return false;
      entry.abort.abort();
      return true;
    },
    isActive(runId) {
      return active.has(runId);
    },
    activeRunIds() {
      return [...active.keys()];
    },
    resolveAsTool(workflowId) {
      const wf = workflows.getWorkflow(workflowId);
      if (!wf || wf.status !== 'published') return null;
      const versionView = workflows.getCurrentVersion(workflowId);
      if (!versionView) return null;
      return buildFlowTool(wf, versionView.graph, {
        invokeFromChat: (id, input) => invokeFromChat(id, input),
      });
    },
  };
}

function workflowIdOf(params: StartFlowParams): string {
  return params.workflowId;
}

function coerceHumanDecision(payload: unknown): FlowHumanDecision {
  if (payload && typeof payload === 'object' && 'approved' in payload) {
    const record = payload as Record<string, unknown>;
    return {
      approved: record.approved === true,
      values:
        record.values && typeof record.values === 'object'
          ? (record.values as Record<string, unknown>)
          : {},
    };
  }
  // 断线/超时/无交互环境：按拒绝处理（流程可经后续 condition 分支走驳回路径）
  return { approved: false, values: {} };
}
