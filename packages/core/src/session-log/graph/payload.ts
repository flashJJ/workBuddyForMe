/**
 * v2.20 RunGraph 投影辅助：只做 payload 读取、状态归一、产物收集。
 * 纯函数、无仓储/无 UI，供 graph.ts 与单测共用。
 */
import type { ArtifactRef, RunGraphNodeStatus, RunGraphScope, RunOutcome } from '@wbfm/shared/types';
import { RUN_OUTCOMES } from '@wbfm/shared/types';

export type Payload = Record<string, unknown>;

export function asRecord(value: unknown): Payload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Payload;
}

export function field(value: unknown, key: string): unknown {
  const record = asRecord(value);
  return record ? record[key] : undefined;
}

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function compact(value: unknown, max = 200): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJson(value);
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

const OUTCOME_SET = new Set<string>(RUN_OUTCOMES);

/** 把各业务状态/裁决归一为节点状态；无法识别返回 null。 */
export function normalizeStatus(value: unknown): RunGraphNodeStatus | null {
  if (typeof value !== 'string') return null;
  if (OUTCOME_SET.has(value)) return value as RunOutcome;
  switch (value) {
    case 'completed':
    case 'done':
    case 'finished':
    case 'succeeded':
    case 'ok':
    case 'approve':
      return 'succeeded';
    case 'running':
    case 'streaming':
    case 'executing':
    case 'planning':
    case 'reviewing':
      return 'running';
    case 'paused':
    case 'waiting':
    case 'waiting_human':
    case 'revise':
      return 'waiting';
    case 'failed':
    case 'error':
    case 'reject':
    case 'rejected':
      return 'failed';
    case 'cancelled':
    case 'stopped':
    case 'aborted':
      return 'cancelled';
    case 'skipped':
      return 'skipped';
    case 'budget_exceeded':
      return 'budget_exceeded';
    default:
      return null;
  }
}

/** 事件类型 + 载荷状态 → 节点状态。 */
export function eventStatus(type: string, payload: unknown): RunGraphNodeStatus {
  const explicit =
    normalizeStatus(field(payload, 'status')) ??
    normalizeStatus(field(field(payload, 'run'), 'status')) ??
    normalizeStatus(field(field(payload, 'step'), 'status')) ??
    normalizeStatus(field(field(payload, 'review'), 'verdict')) ??
    normalizeStatus(field(payload, 'verdict')) ??
    normalizeStatus(field(payload, 'phase'));
  if (explicit) return explicit;

  switch (type) {
    case 'message_started':
    case 'run_started':
    case 'run_resumed':
    case 'step_started':
    case 'node_started':
    case 'agent_phase':
    case 'meeting_turn_start':
      return 'running';
    case 'message_completed':
    case 'step_finished':
    case 'node_succeeded':
    case 'node_finished':
    case 'run_succeeded':
    case 'agent_handoff':
    case 'meeting_message':
    case 'done':
      return 'succeeded';
    case 'message_error':
    case 'node_failed':
    case 'run_failed':
    case 'error':
      return 'failed';
    case 'message_stopped':
    case 'run_cancelled':
      return 'cancelled';
    case 'run_paused':
    case 'node_waiting_human':
      return 'waiting';
    case 'node_skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}

export function scopeColorToken(scope: RunGraphScope): string {
  switch (scope) {
    case 'task':
      return 'info';
    case 'flow':
      return 'success';
    case 'agent':
      return 'warning';
    case 'meeting':
      return 'accent';
    default:
      return 'primary';
  }
}

/** 只认 v2.18 产物引用的最小形状，避免把任意对象当产物。 */
export function isArtifactRef(value: unknown): value is ArtifactRef {
  const record = asRecord(value);
  if (!record) return false;
  return (
    typeof record.attachmentId === 'string' &&
    record.attachmentId.trim().length > 0 &&
    typeof record.title === 'string' &&
    typeof record.filename === 'string' &&
    typeof record.format === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.byteSize === 'number'
  );
}

/**
 * 在 payload 中递归找 ArtifactRef（工具 trace / step / handoff 都可能携带）。
 * 深度与数组长度设上限，避免异常大载荷拖慢投影。
 */
export function findArtifacts(value: unknown, depth = 0): ArtifactRef[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const found: ArtifactRef[] = [];
    for (const item of value.slice(0, 50)) found.push(...findArtifacts(item, depth + 1));
    return dedupeArtifacts(found);
  }
  if (isArtifactRef(value)) return [value];
  const record = asRecord(value);
  if (!record) return [];
  const found: ArtifactRef[] = [];
  const keys = Object.keys(record).slice(0, 30);
  for (const key of keys) found.push(...findArtifacts(record[key], depth + 1));
  return dedupeArtifacts(found);
}

export function dedupeArtifacts(items: readonly ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  const out: ArtifactRef[] = [];
  for (const item of items) {
    if (seen.has(item.attachmentId)) continue;
    seen.add(item.attachmentId);
    out.push(item);
  }
  return out;
}
