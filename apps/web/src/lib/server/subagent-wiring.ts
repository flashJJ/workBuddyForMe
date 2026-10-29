import { getDataRoot } from '@wbfm/config';
import { createSubagentRunService, type SubagentRunServiceDeps } from '@wbfm/core/agents';
import { createSettingsService, type ServiceDeps } from '@wbfm/core/services';

interface SubagentWiringInput {
  deps: ServiceDeps;
  providers: SubagentRunServiceDeps['providers'];
  approvals: SubagentRunServiceDeps['approvals'];
  workSignals: SubagentRunServiceDeps['workSignals'];
  sessionLog: SubagentRunServiceDeps['sessionLog'];
  completions: SubagentRunServiceDeps['completions'];
}

/**
 * v2.11：外部代理运行服务装配。
 * 设置实例按请求即时读取 settings_kv（与设置页同一数据源），不做进程内缓存。
 */
export function createSubagentRunsForApp(input: SubagentWiringInput) {
  return createSubagentRunService({
    db: input.deps.db,
    providers: input.providers,
    approvals: input.approvals,
    workSignals: input.workSignals,
    sessionLog: input.sessionLog,
    completions: input.completions,
    settings: createSettingsService(input.deps),
    dataRoot: getDataRoot(),
  });
}
