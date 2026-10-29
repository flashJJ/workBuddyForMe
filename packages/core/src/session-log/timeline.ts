import type { SessionEventView } from '@wbfm/database';

/** v2.9：事件 → 统一时间线条目（UI / 导出共用，不维护第二套状态） */
export interface TimelineItem {
  id: string;
  seq: number;
  scope: SessionEventView['scope'];
  scopeId: string;
  type: string;
  label: string;
  detail: string;
  at: string;
  payload: unknown;
}

const DETAIL_MAX = 200;

function compact(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > DETAIL_MAX ? `${oneLine.slice(0, DETAIL_MAX)}…` : oneLine;
}

function field(payload: unknown, key: string): unknown {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined;
}

function labelFor(event: SessionEventView): string {
  const payload = event.payload;
  switch (event.type) {
    case 'message_started':
      return `${field(payload, 'role') === 'user' ? '用户' : '助手'}消息开始`;
    case 'message_completed':
      return '助手回答完成';
    case 'message_error':
      return `回答失败：${String(field(payload, 'code') ?? '')}`;
    case 'message_stopped':
      return '回答已停止';
    case 'tool_trace':
      return '工具调用轨迹';
    case 'run_started':
      return '运行开始';
    case 'run_paused':
      return '运行暂停';
    case 'run_resumed':
      return '运行继续';
    case 'run_finished':
      return `运行结束${field(payload, 'run') ? `：${String(field(field(payload, 'run'), 'status') ?? '')}` : ''}`;
    case 'step_started':
      return '步骤开始';
    case 'step_finished':
      return '步骤结束';
    case 'node_started':
      return `节点开始：${String(field(payload, 'nodeId') ?? field(payload, 'nodeName') ?? '')}`;
    case 'node_finished':
      return '节点完成';
    case 'node_failed':
      return '节点失败';
    case 'agent_handoff':
      return '角色交接';
    case 'done':
      return '协作完成';
    case 'error':
      return '协作失败';
    case 'budget_exceeded':
      return '协作预算耗尽';
    default:
      return event.type;
  }
}

function detailFor(event: SessionEventView): string {
  const payload = event.payload;
  if (event.type === 'message_completed' || event.type === 'message_started') {
    return compact(field(payload, 'content'));
  }
  if (event.type === 'message_error') {
    return compact(field(payload, 'message'));
  }
  if (event.type === 'step_started' || event.type === 'step_finished') {
    const step = field(payload, 'step') ?? payload;
    return compact(
      `${String(field(step, 'kind') ?? '')} ${String(field(step, 'toolName') ?? '')} ${String(field(step, 'reason') ?? '')}`.trim(),
    );
  }
  if (event.type === 'agent_handoff') {
    const handoff = field(payload, 'handoff') ?? payload;
    return compact(`${String(field(handoff, 'fromRole') ?? '')} → ${String(field(handoff, 'toRole') ?? '')}`);
  }
  return compact(payload);
}

/** 事件列表 → 时间线（按 seq 已排序；纯函数） */
export function projectTimeline(events: SessionEventView[]): TimelineItem[] {
  return events.map((event) => ({
    id: event.id,
    seq: event.seq,
    scope: event.scope,
    scopeId: event.scopeId,
    type: event.type,
    label: labelFor(event),
    detail: detailFor(event),
    at: event.createdAt,
    payload: event.payload,
  }));
}
