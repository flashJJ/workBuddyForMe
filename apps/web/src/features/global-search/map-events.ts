import { SEARCH_LIMITS, type SearchDomain } from '@wbfm/shared/schemas';
import type { GlobalSearchGroup, GlobalSearchHit } from './types';

/** 事件日志四域（knowledge 在 M4 接文档表） */
export const GLOBAL_SEARCH_SCOPES = ['chat', 'task', 'flow', 'meeting'] as const;
export type GlobalSearchEventScope = (typeof GLOBAL_SEARCH_SCOPES)[number];

export interface RawSearchEvent {
  id: string;
  scopeId: string;
  type: string;
  payload?: unknown;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  message_started: '消息',
  message_completed: '消息',
  run_started: '运行开始',
  run_finished: '运行结束',
  run_succeeded: '运行完成',
  run_failed: '运行失败',
  run_paused: '运行暂停',
  run_resumed: '运行继续',
  step_started: '步骤开始',
  step_finished: '步骤结束',
  node_started: '节点开始',
  node_succeeded: '节点完成',
  node_failed: '节点失败',
  meeting_turn_start: '新一轮发言',
  meeting_message: '会议消息',
  meeting_status: '会议状态',
};

function oneLine(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function field(payload: unknown, key: string): unknown {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

function textField(payload: unknown, key: string): string {
  const value = field(payload, key);
  return typeof value === 'string' ? value : '';
}

function toChatHit(event: RawSearchEvent): GlobalSearchHit | null {
  if (event.type !== 'message_started' && event.type !== 'message_completed') return null;
  const messageId = textField(event.payload, 'messageId');
  const content = textField(event.payload, 'content');
  if (!messageId || !content.trim()) return null;
  const title = oneLine(content, 80);
  return {
    domain: 'chat',
    id: messageId,
    title,
    snippet: oneLine(content, 160),
    timestamp: event.createdAt,
    deepLink: `/chat?conversation=${encodeURIComponent(event.scopeId)}&message=${encodeURIComponent(messageId)}`,
    action: 'open',
  };
}

function toTaskHit(event: RawSearchEvent): GlobalSearchHit | null {
  const runId = textField(event.payload, 'runId') || event.scopeId;
  if (!runId) return null;
  const run = field(event.payload, 'run');
  const goal = run && typeof run === 'object' ? String((run as { goal?: unknown }).goal ?? '') : '';
  return {
    domain: 'task',
    id: runId,
    title: oneLine(goal, 80) || runId.slice(0, 12),
    snippet: TYPE_LABELS[event.type] ?? event.type,
    timestamp: event.createdAt,
    deepLink: `/timeline?scope=task&id=${encodeURIComponent(runId)}`,
    action: 'open',
  };
}

function toFlowHit(event: RawSearchEvent): GlobalSearchHit | null {
  const runId = textField(event.payload, 'runId') || event.scopeId;
  if (!runId) return null;
  const workflowId = textField(event.payload, 'workflowId');
  return {
    domain: 'flow',
    id: runId,
    title: workflowId ? `${workflowId} · ${runId.slice(0, 8)}` : runId.slice(0, 12),
    snippet: TYPE_LABELS[event.type] ?? event.type,
    timestamp: event.createdAt,
    deepLink: workflowId
      ? `/flows/${encodeURIComponent(workflowId)}?run=${encodeURIComponent(runId)}`
      : `/timeline?scope=flow&id=${encodeURIComponent(runId)}`,
    action: 'open',
  };
}

function toMeetingHit(event: RawSearchEvent): GlobalSearchHit | null {
  const meetingId = event.scopeId;
  if (!meetingId) return null;
  return {
    domain: 'meeting',
    id: meetingId,
    title: meetingId.slice(0, 12),
    snippet: TYPE_LABELS[event.type] ?? event.type,
    timestamp: event.createdAt,
    deepLink: `/meetings/${encodeURIComponent(meetingId)}`,
    action: 'open',
  };
}

const MAPPERS: Record<
  GlobalSearchEventScope,
  (event: RawSearchEvent) => GlobalSearchHit | null
> = {
  chat: toChatHit,
  task: toTaskHit,
  flow: toFlowHit,
  meeting: toMeetingHit,
};

/** 纯函数：事件（已按时间倒序）→ 去重后的域内结果，单域最多 10 条 */
export function mapEventsToHits(
  domain: GlobalSearchEventScope,
  events: readonly RawSearchEvent[],
): GlobalSearchHit[] {
  const seen = new Set<string>();
  const hits: GlobalSearchHit[] = [];
  for (const event of events) {
    const hit = MAPPERS[domain](event);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    hits.push(hit);
    if (hits.length >= SEARCH_LIMITS.perDomain) break;
  }
  return hits;
}

export function isGlobalSearchScope(value: string): value is GlobalSearchEventScope {
  return (GLOBAL_SEARCH_SCOPES as readonly string[]).includes(value);
}

/** 纯函数：四域 settled 结果 → 分组 + 失败域（单域失败不影响其他域） */
export function assembleGroups(
  scopes: readonly GlobalSearchEventScope[],
  results: readonly PromiseSettledResult<GlobalSearchHit[]>[],
): { groups: GlobalSearchGroup[]; failedDomains: SearchDomain[] } {
  const groups: GlobalSearchGroup[] = [];
  const failedDomains: SearchDomain[] = [];
  results.forEach((result, index) => {
    const scope = scopes[index];
    if (!scope) return;
    if (result.status === 'fulfilled') {
      if (result.value.length > 0) groups.push({ domain: scope, hits: result.value });
    } else {
      failedDomains.push(scope);
    }
  });
  return { groups, failedDomains };
}

export type { SearchDomain };
