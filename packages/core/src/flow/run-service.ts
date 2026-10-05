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

export interface CreateRunParams {
  workflowId: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  conversationId?: string | null;
}

export interface FlowRunService {
  /**
   * 仅登记一条 queued 运行（校验图 + 建记录），不执行。
   * 供 POST /runs 使用；执行由随后的 startEvents（SSE 订阅）驱动。
   */
  createRun(params: CreateRunParams): string;
  /**
   * 按 runId 订阅并驱动执行：
   * - queued 且未活跃：启动事件流（生命周期随调用方迭代结束）；
   * - 活跃中：抛 409（同一运行只允许一个订阅）；
   * - 已终态：抛 409（终态回放由调用方从仓储读取，不经过本方法）。
   */
  startEvents(runId: string, clientSignal?: AbortSignal): StartedFlow;
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

  function createRun(params: CreateRunParams): string {
    const trigger = params.trigger ?? 'manual';
    const { version } = loadCompiledGraph(params.workflowId, trigger === 'chat');
    const run = runs.createRun({
      workflowId: params.workflowId,
      version,
      trigger,
      input: params.input ?? {},
      conversationId: params.conversationId ?? null,
    });
    return run.id;
  }

  /** 核心：为已登记的运行创建执行事件流（调用方迭代驱动执行） */
  function executeRun(
    runId: string,
    opts: {
      workflowId: string;
      version: number;
      input: Record<string, unknown>;
      trigger: FlowTrigger;
      interactive: boolean;
      clientSignal?: AbortSignal;
    },
  ): AsyncGenerator<FlowEventPayload> {
    const { compiled } = loadCompiledGraph(opts.workflowId, opts.trigger === 'chat');
    const abort = new AbortController();
    const signal = opts.clientSignal
      ? AbortSignal.any([opts.clientSignal, abort.signal])
      : abort.signal;
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
      workflowId: opts.workflowId,
      version: opts.version,
      runId,
      input: opts.input,
      trigger: opts.trigger,
      interactive: opts.interactive,
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
    return (async function* () {
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

  function startEvents(runId: string, clientSignal?: AbortSignal): StartedFlow {
    const run = runs.getRun(runId);
    if (!run) throw ApiError.notFound('工作流运行', runId);
    if (active.has(runId)) throw ApiError.conflict('运行事件流已被订阅，请勿重复打开');
    if (run.status !== 'queued') {
      throw ApiError.conflict(`运行已处于 ${run.status} 状态，请通过查询接口获取结果`);
    }
    const events = executeRun(runId, {
      workflowId: run.workflowId,
      version: run.version,
      input: run.input ?? {},
      trigger: run.trigger,
      // M2：试运行（manual）交互；chat 触发不经 SSE（invokeFromChat 内部直接执行）
      interactive: run.trigger === 'manual',
      clientSignal,
    });
    return { runId, events };
  }

  /** 对话触发执行（非交互）：登记后直接消费完整事件流，收敛为最终输出或错误 */
  async function invokeFromChat(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: true; output: unknown } | { ok: false; error: string }> {
    const trigger: FlowTrigger = 'chat';
    const { version } = loadCompiledGraph(workflowId, true);
    const runId = createRun({ workflowId, input, trigger });
    const events = executeRun(runId, {
      workflowId,
      version,
      input: input ?? {},
      trigger,
      interactive: false,
    });
    for await (const event of events) {
      if (event.type === 'run_succeeded') return { ok: true, output: event.output };
      if (event.type === 'run_failed') return { ok: false, error: event.message };
      if (event.type === 'run_cancelled') return { ok: false, error: '工作流执行被中断' };
    }
    return { ok: false, error: '工作流未产出结果（事件流意外结束）' };
  }

  return {
    createRun,
    startEvents,
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
