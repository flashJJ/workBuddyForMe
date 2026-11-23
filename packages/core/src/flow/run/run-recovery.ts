import type {
  WorkflowEndpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import type { Tool } from '../../tools/types';
import { recoverInterruptedRuns, type RecoveryResult } from '../queue/recovery-scanner';
import { decideResume } from '../queue/resume-policy';
import { loadCheckpoint } from '../queue/checkpoint';
import { compileGraph } from './run-graph-loader';
import { loadRunGraph } from '../reliability/run-snapshot';
import { resolveRunRuntimeOverrides, type RunRuntimeOverrides } from './run-options';

/**
 * v4.23/v5.0 启动恢复：queued 重新入队；在途运行按安全矩阵续跑或收敛 interrupted。
 * 拆出 run-service 以控行数；版本缺失/编译失败一律保持 interrupted，等人工重放。
 */
export interface FlowRecoveryWiring {
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  endpoints?: WorkflowEndpointRepository;
  startupActiveIds: ReadonlySet<string>;
  resolveTool: (name: string) => Tool | null;
  onResumed: (runId: string, overrides: RunRuntimeOverrides) => void;
}

export function recoverFlowRuns(params: FlowRecoveryWiring): RecoveryResult {
  return recoverInterruptedRuns(params.runs, params.startupActiveIds, (runId) => {
    try {
      const run = params.runs.getRun(runId);
      if (!run) return 'interrupt';
      const loaded = loadRunGraph({ run, workflows: params.workflows, runs: params.runs });
      const compiled = compileGraph(loaded.graph);
      const decision = decideResume({
        run,
        nodes: params.runs.listNodeExecutions(runId),
        compiled,
        compiledVersion: loaded.version,
        activeRunIds: params.startupActiveIds,
        resolveTool: params.resolveTool,
      });
      if (!decision.eligible) return 'interrupt';
      const checkpoint = loadCheckpoint(params.runs, runId);
      const overrides = resolveRunRuntimeOverrides({
        trigger: run.trigger,
        endpointId: run.endpointId,
        compiled,
        endpoints: params.endpoints,
      });
      params.onResumed(runId, {
        ...overrides,
        ...(checkpoint ? { checkpoint } : {}),
        resumeReason: decision.reason,
      });
      return 'resume';
    } catch (error) {
      console.warn('[flow] 续跑判定失败，保持 interrupted：', error);
      return 'interrupt';
    }
  });
}
