import {
  createWorkflowEndpointRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
  type WorkflowEndpointRepository,
  type WorkflowRepository,
  type WorkflowRunRepository,
} from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import { createMcpRegistry, type McpRegistry } from '../mcp/registry';
import { createPermissionService } from '../services/permission-service';
import { createPendingConfirmations } from '../services/pending-confirmations';
import { createSkillService } from '../skills/skill-service';
import { createToolBreaker } from '../tools/tool-breaker';
import { createTaskGrantRegistry } from '../services/task-grants';
import { createToolRuntime, type ToolRuntime } from '../tools/tool-runtime';
import type { ServiceDeps } from '../services/deps';
import { createFlowRunService, type FlowRunService } from '../flow/run-service';
import { createEndpointService, type EndpointService } from './endpoint-service';

/**
 * v0.9 独立服务化装配：stdio MCP bin（脱离 Next 容器）用。
 * 与 web container.build 的 flow 相关装配保持同构：同一队列/总线/运行时语义，
 * 但不带对话/摄入/任务等非必需服务，启动更轻。
 */
export interface FlowServingStack {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  endpointRepo: WorkflowEndpointRepository;
  endpoints: EndpointService;
  flowRunner: FlowRunService;
  runtime: ToolRuntime;
  mcp: McpRegistry;
  /** 释放后台连接/定时器（进程退出时 best-effort） */
  dispose(): Promise<void>;
}

export interface FlowServingStackOptions {
  /** 是否对齐已登记的外部 MCP（流程内嵌 mcp:* 工具时需要；默认开） */
  reconcileMcp?: boolean;
}

export function createFlowServingStack(
  db: DatabaseInstance,
  cipher: SecretCipher,
  options: FlowServingStackOptions = {},
): FlowServingStack {
  const mcp = createMcpRegistry(db);
  const deps: ServiceDeps = {
    db,
    cipher,
    mcp,
    permissions: createPermissionService({ db, cipher }),
    confirmations: createPendingConfirmations(),
    skills: createSkillService({ db }),
    breakers: createToolBreaker(),
    taskGrants: createTaskGrantRegistry(),
  };
  const runtime = createToolRuntime(deps);
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const endpointRepo = createWorkflowEndpointRepository(db);
  const flowRunner = createFlowRunService({ deps, runtime, workflows, runs, endpoints: endpointRepo });
  const endpoints = createEndpointService({ endpoints: endpointRepo, workflows });
  deps.flowToolResolver = (workflowId) => flowRunner.resolveAsTool(workflowId);
  deps.flowToolLister = () => flowRunner.listPublishedTools();

  if (options.reconcileMcp !== false) {
    // 异步对齐不阻塞 stdio 握手；reconcile 为 fire-and-forget（void）
    try {
      mcp.reconcile();
    } catch {
      /* 对齐失败不影响 stdio 服务 */
    }
  }

  return {
    db,
    workflows,
    runs,
    endpointRepo,
    endpoints,
    flowRunner,
    runtime,
    mcp,
    async dispose() {
      await mcp.disconnectAll().catch(() => undefined);
    },
  };
}
