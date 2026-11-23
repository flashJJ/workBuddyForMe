import {
  FLOW_RUN_RETENTION_DEFAULTS,
  flowRunRetentionSchema,
  type FlowRunRetentionParsed,
} from '@wbfm/shared/schemas';
import type {
  FlowRunCompensationRepository,
  SettingsRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import type { AuditService } from '../../governance/audit';

/**
 * v5.0 运行保留与清理：
 * - 成功/失败分保留天数，每流程终态上限；
 * - 只删终态，排除 pending/retrying 补偿引用的运行；
 * - 支持 dry-run、分批删除、审计。
 */

export type FlowRunRetentionPolicy = FlowRunRetentionParsed;

const KEYS = {
  enabled: 'flows.runRetention.enabled',
  successDays: 'flows.runRetention.successDays',
  failureDays: 'flows.runRetention.failureDays',
  maxPerWorkflow: 'flows.runRetention.maxPerWorkflow',
  lastCleanupAt: 'flows.runRetention.lastCleanupAt',
  removedTotal: 'flows.runRetention.removedTotal',
} as const;

export interface FlowRetentionDeps {
  runs: WorkflowRunRepository;
  workflows: WorkflowRepository;
  compensations: FlowRunCompensationRepository;
  settings: SettingsRepository;
  audit?: AuditService;
  now?: () => Date;
}

export interface FlowRetentionService {
  getPolicy(): FlowRunRetentionPolicy;
  setPolicy(policy: FlowRunRetentionPolicy): void;
  cleanup(options?: { dryRun?: boolean; now?: Date }): {
    removed: number;
    scanned: number;
    dryRun: boolean;
    byWorkflow: Record<string, number>;
  };
}

export function createFlowRetentionService(deps: FlowRetentionDeps): FlowRetentionService {
  const now = deps.now ?? (() => new Date());

  function getPolicy(): FlowRunRetentionPolicy {
    const parsed = flowRunRetentionSchema.safeParse({
      enabled: deps.settings.getJson(KEYS.enabled, FLOW_RUN_RETENTION_DEFAULTS.enabled),
      successDays: deps.settings.getJson(KEYS.successDays, FLOW_RUN_RETENTION_DEFAULTS.successDays),
      failureDays: deps.settings.getJson(KEYS.failureDays, FLOW_RUN_RETENTION_DEFAULTS.failureDays),
      maxPerWorkflow: deps.settings.getJson(
        KEYS.maxPerWorkflow,
        FLOW_RUN_RETENTION_DEFAULTS.maxPerWorkflow,
      ),
    });
    return parsed.success ? parsed.data : { ...FLOW_RUN_RETENTION_DEFAULTS };
  }

  function setPolicy(policy: FlowRunRetentionPolicy): void {
    const parsed = flowRunRetentionSchema.parse(policy);
    deps.settings.setJson(KEYS.enabled, parsed.enabled);
    deps.settings.setJson(KEYS.successDays, parsed.successDays);
    deps.settings.setJson(KEYS.failureDays, parsed.failureDays);
    deps.settings.setJson(KEYS.maxPerWorkflow, parsed.maxPerWorkflow);
  }

  function cleanup(options: { dryRun?: boolean; now?: Date } = {}) {
    const at = options.now ?? now();
    const policy = getPolicy();
    if (!policy.enabled) return { removed: 0, scanned: 0, dryRun: Boolean(options.dryRun), byWorkflow: {} };

    const successCutoff = new Date(at.getTime() - policy.successDays * 86_400_000).toISOString();
    const failureCutoff = new Date(at.getTime() - policy.failureDays * 86_400_000).toISOString();
    const scannedRuns = deps.runs.listTerminalBefore(successCutoff, 200);
    const candidates = new Map<string, { workflowId: string }>();
    for (const run of scannedRuns) {
      const expired = run.status === 'failed' ? run.createdAt < failureCutoff : true;
      if (expired) candidates.set(run.id, { workflowId: run.workflowId });
    }

    for (const workflow of deps.workflows.listWorkflows(200)) {
      for (const run of deps.runs.listTerminalBeyondPerWorkflow(workflow.id, policy.maxPerWorkflow)) {
        candidates.set(run.id, { workflowId: run.workflowId });
      }
    }

    for (const item of deps.compensations.listActive()) {
      candidates.delete(item.rootRunId);
      if (item.lastRunId) candidates.delete(item.lastRunId);
    }

    const ids = [...candidates.keys()];
    const byWorkflow: Record<string, number> = {};
    for (const run of candidates.values()) {
      byWorkflow[run.workflowId] = (byWorkflow[run.workflowId] ?? 0) + 1;
    }
    const dryRun = Boolean(options.dryRun);
    let removed = 0;
    if (!dryRun) {
      for (let i = 0; i < ids.length; i += 200) {
        removed += deps.runs.deleteRuns(ids.slice(i, i + 200));
      }
      deps.settings.setJson(KEYS.lastCleanupAt, at.toISOString());
      const total = deps.settings.getJson(KEYS.removedTotal, 0) as number;
      deps.settings.setJson(KEYS.removedTotal, total + removed);
      deps.audit?.safeAppend({
        kind: 'flow_retention_cleanup',
        actor: 'system',
        reasonCode: 'flow_retention_cleanup',
        outcome: JSON.stringify({
          removed,
          scanned: scannedRuns.length,
          byWorkflow,
          successCutoff,
          failureCutoff,
        }),
      });
    }
    return { removed: dryRun ? ids.length : removed, scanned: scannedRuns.length, dryRun, byWorkflow };
  }

  return { getPolicy, setPolicy, cleanup };
}
