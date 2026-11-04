/**
 * v2.20 M2：RunGraph 快照服务。
 * 从现有会话/会议 + 运行表聚合事件，再交给纯函数投影；
 * 不新增表、不写事件、不做 UI 状态。
 */
import {
  createConversationBranchRepository,
  createSessionEventRepository,
  type SessionEventView,
} from '@wbfm/database';
import type { RunGraphScope, RunGraphSnapshot } from '@wbfm/shared/types';
import type { ServiceDeps } from '../services/base/deps';
import { projectRunGraph } from './graph/project';

export type ConversationGraphScope = Exclude<RunGraphScope, 'meeting'>;

export interface ConversationGraphOptions {
  limit?: number;
  scope?: ConversationGraphScope;
}

export interface MeetingGraphOptions {
  limit?: number;
}

export interface RunGraphService {
  conversationGraph(conversationId: string, options?: ConversationGraphOptions): RunGraphSnapshot;
  meetingGraph(meetingId: string, options?: MeetingGraphOptions): RunGraphSnapshot;
}

const MAX_RUNS = 20;
const EVENTS_PER_RUN = 200;
const CHAT_EVENTS_LIMIT = 1000;
const BRANCH_EVENTS_LIMIT = 200;

type RunTable = 'task_runs' | 'workflow_runs' | 'agent_runs';

export function createRunGraphService(deps: ServiceDeps): RunGraphService {
  const events = createSessionEventRepository(deps.db);
  const branches = createConversationBranchRepository(deps.db);

  function runIds(table: RunTable, conversationId: string): string[] {
    const rows = deps.db
      .prepare(`SELECT id FROM ${table} WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(conversationId, MAX_RUNS) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  function collectRunEvents(scope: 'task' | 'flow' | 'agent', conversationId: string) {
    const table: RunTable =
      scope === 'task' ? 'task_runs' : scope === 'flow' ? 'workflow_runs' : 'agent_runs';
    return runIds(table, conversationId).flatMap((runId) =>
      events.list(scope, runId, 0, EVENTS_PER_RUN),
    );
  }

  return {
    conversationGraph(conversationId, options = {}) {
      const scope = options.scope;
      const all: SessionEventView[] = [];
      if (!scope || scope === 'chat') {
        all.push(...events.list('chat', conversationId, 0, CHAT_EVENTS_LIMIT));
      }
      if (!scope || scope === 'task') all.push(...collectRunEvents('task', conversationId));
      if (!scope || scope === 'flow') all.push(...collectRunEvents('flow', conversationId));
      if (!scope || scope === 'agent') all.push(...collectRunEvents('agent', conversationId));
      if (!scope || scope === 'branch') {
        // v2.21：只收该会话的直接分支；嵌套分支事件留在子会话自己的图里
        for (const branch of branches.listByParent(conversationId, true)) {
          all.push(...events.list('branch', branch.id, 0, BRANCH_EVENTS_LIMIT));
        }
      }
      return projectRunGraph({
        rootKind: 'conversation',
        rootId: conversationId,
        events: all,
        limit: options.limit,
      });
    },

    meetingGraph(meetingId, options = {}) {
      const meetingEvents = events.list('meeting', meetingId, 0, 1000);
      return projectRunGraph({
        rootKind: 'meeting',
        rootId: meetingId,
        events: meetingEvents,
        limit: options.limit,
      });
    },
  };
}
