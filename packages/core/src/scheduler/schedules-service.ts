/**
 * v1.7 角色化提醒服务：scheduled_tasks 仓储 + 时区纯函数接线。
 * 所有写操作经 zod 输入（路由层 parse）；过期 once 在仓储层抛 SCHEDULE_EXPIRED。
 */
import {
  createAssistantRepository,
  createConversationRepository,
  createScheduledTaskRepository,
  type ScheduledTaskRepository,
} from '@wbfm/database';
import {
  DEFAULT_AGENT_POLICY,
  isScheduledAgentTask,
  type ScheduledAgentTaskPayload,
  type ScheduledTaskCreateInput,
  type ScheduledTaskUpdateInput,
  type ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { ServiceDeps } from '../services/deps';
import { resolveChatTargetForModelId } from '../chat/model-resolver';
import { resolveWorkspacePath } from '../governance/workspace';
import { computeNextRunMs } from './next-run';
import { isSupportedTimezone } from './next-run';

export function createSchedulesService(deps: ServiceDeps) {
  const assistants = createAssistantRepository(deps.db);
  const conversations = createConversationRepository(deps.db);
  const repo: ScheduledTaskRepository = createScheduledTaskRepository(deps.db, {
    computeNextRunMs,
  });

  const requireAssistant = (assistantId: string): void => {
    if (!assistants.findById(assistantId)) {
      throw ApiError.notFound('助手', assistantId);
    }
  };

  /** v2.13 M4：agent_task 创建 / 更新前的无人值守校验 */
  const validateAgentPayload = (
    taskAssistantId: string,
    payload: ScheduledAgentTaskPayload,
  ): void => {
    const policy = deps.agentPolicy?.() ?? DEFAULT_AGENT_POLICY;
    if (
      payload.permissionMode === 'full_access' ||
      !policy.unattended.allowedModes.includes(payload.permissionMode)
    ) {
      throw ApiError.validation('该执行模式不允许无人值守运行', {
        code: 'UNATTENDED_MODE_NOT_ALLOWED',
      });
    }
    const assistantId = payload.assistantId ?? taskAssistantId;
    const assistant = assistants.findById(assistantId);
    if (!assistant) throw ApiError.notFound('助手', assistantId);
    if (!conversations.findById(payload.conversationId)) {
      throw ApiError.notFound('会话', payload.conversationId);
    }
    const target = resolveChatTargetForModelId(deps, assistant.modelId ?? null);
    if (!target.model.capabilities.includes('vision')) {
      throw ApiError.validation('定时 Agent 任务需要视觉模型（请给该助手绑定视觉模型）', {
        code: 'VISION_MODEL_REQUIRED',
      });
    }
    if (payload.workspacePath) resolveWorkspacePath(payload.workspacePath);
  };

  return {
    list(assistantId?: string): ScheduledTaskView[] {
      if (assistantId) requireAssistant(assistantId);
      return repo.list(assistantId);
    },

    get(id: string): ScheduledTaskView {
      const task = repo.findById(id);
      if (!task) throw ApiError.notFound('提醒', id);
      return task;
    },

    create(input: ScheduledTaskCreateInput): ScheduledTaskView {
      requireAssistant(input.assistantId);
      if (!isSupportedTimezone(input.timezone)) {
        // 本版固定 Asia/Shanghai；未知时区仓储会回落 +8，这里直接拒绝避免静默偏差
        throw ApiError.validation('暂仅支持 Asia/Shanghai 时区');
      }
      if (isScheduledAgentTask(input.payload)) {
        validateAgentPayload(input.assistantId, input.payload);
      }
      try {
        return repo.create(input);
      } catch (error) {
        if (error instanceof Error && error.message.includes('过期')) {
          throw ApiError.validation('提醒时间已过期，请选择未来的时间');
        }
        throw error;
      }
    },

    update(id: string, patch: ScheduledTaskUpdateInput): ScheduledTaskView {
      const existing = repo.findById(id);
      if (!existing) throw ApiError.notFound('提醒', id);
      if (patch.payload !== undefined) {
        const prevKind = existing.payload?.kind ?? null;
        const nextKind = patch.payload?.kind ?? null;
        if (prevKind !== nextKind) {
          throw ApiError.validation('定时任务类型切换需新建任务', {
            code: 'SCHEDULE_PAYLOAD_KIND_IMMUTABLE',
          });
        }
        if (isScheduledAgentTask(patch.payload)) {
          validateAgentPayload(existing.assistantId, patch.payload);
        }
      }
      try {
        const updated = repo.update(id, patch);
        if (!updated) throw ApiError.notFound('提醒', id);
        return updated;
      } catch (error) {
        if (error instanceof Error && error.message.includes('过期')) {
          throw ApiError.validation('提醒时间已过期，请选择未来的时间');
        }
        throw error;
      }
    },

    setEnabled(id: string, enabled: boolean): ScheduledTaskView {
      const updated = repo.setEnabled(id, enabled);
      if (!updated) throw ApiError.notFound('提醒', id);
      return updated;
    },

    delete(id: string): void {
      if (!repo.delete(id)) throw ApiError.notFound('提醒', id);
    },

    /** tick 用 */
    listDue(nowMs?: number): ScheduledTaskView[] {
      return repo.listDue(nowMs);
    },
    markFired(id: string, nowMs?: number): ScheduledTaskView | null {
      return repo.markFired(id, nowMs);
    },

    /** 备份恢复后统一重排启用行 */
    recomputeEnabled(fromMs?: number): number {
      return repo.recomputeEnabled(fromMs);
    },
  };
}

export type SchedulesService = ReturnType<typeof createSchedulesService>;
