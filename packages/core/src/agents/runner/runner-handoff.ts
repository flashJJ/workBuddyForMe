import type {
  AgentHandoffPayload,
  AgentHandoffView,
  AgentRole,
} from '@wbfm/shared/schemas';
import type { AgentRunRepository } from '@wbfm/database';
import type { RoleModelUsage } from './runner-types';

/**
 * v4.7 P2：交接写入器——把本角色本次调用的 token 用量并入 payload。
 * 旧记录无 usage 字段（可选），前端按缺省不展示。
 */
export function createHandoffRecorder(repo: AgentRunRepository, runId: string) {
  return (
    round: number,
    fromRole: AgentRole,
    toRole: AgentRole | 'user',
    payload: AgentHandoffPayload,
    usage?: RoleModelUsage,
  ): AgentHandoffView =>
    repo.addHandoff({
      runId,
      roundNo: round,
      fromRole,
      toRole,
      payload: { ...payload, ...(usage ? { usage } : {}) },
    });
}
