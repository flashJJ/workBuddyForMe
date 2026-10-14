/**
 * v1.7 events 轨恢复（备份 schema v3；见 docs/plan/v1.7/03 §5）。
 * 负载三段：自定义助手机行 → scheduled_tasks → event_usage（恢复顺序不可换，后两者外键依赖助手）。
 * 全部 INSERT OR IGNORE 幂等；模型绑定强制 NULL（目标库模型行不一定存在，避外键失败）。
 */
import {
  EVENT_RUN_OUTCOMES,
  EVENT_SUPPRESS_REASONS,
  eventTriggerViewSchema,
  scheduledTaskViewSchema,
  type EventTriggerView,
  type ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { DatabaseInstance } from '@wbfm/database';

interface AssistantEntry {
  id: unknown;
  name: unknown;
  emoji?: unknown;
  color?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
  topP?: unknown;
  maxTokens?: unknown;
  knowledgeBaseIds?: unknown;
  enabledTools?: unknown;
  retrieveAlways?: unknown;
  memoryEnabled?: unknown;
  expressionEnabled?: unknown;
  personalityFrankness?: unknown;
  personalityTsundere?: unknown;
  personalityShy?: unknown;
  personalityTolerance?: unknown;
  /** v1.8：助手选用的角色卡 id（旧档缺省；无 FK，配合恢复后悬挂清理 */
  cardId?: unknown;
  sortOrder?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface UsageEntry {
  id: unknown;
  assistantId?: unknown;
  eventId: unknown;
  dateKey: unknown;
  playedAt: unknown;
  outcome: unknown;
  reason?: unknown;
  priority: unknown;
}

export interface EventsTrackPayload {
  assistants?: AssistantEntry[];
  schedules?: unknown[];
  usage?: UsageEntry[];
  triggers?: unknown[];
}

export interface EventsRestoreCounts {
  assistants: { imported: number; skipped: number };
  schedules: { imported: number; skipped: number };
  usage: { imported: number; skipped: number };
  triggers: { imported: number; skipped: number };
}

/** 解析 events.json（损坏归档给出与其他轨一致的校验错误） */
export function readEventsTrackPayload(buf: Buffer): EventsTrackPayload {
  try {
    return JSON.parse(buf.toString('utf-8')) as EventsTrackPayload;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'events.json 解析失败，归档可能已损坏');
  }
}

function num01(value: unknown): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 0.5;
}

function validUsage(entry: UsageEntry): boolean {
  if (typeof entry.id !== 'string' || typeof entry.eventId !== 'string') return false;
  if (typeof entry.assistantId !== 'string') return false;
  if (typeof entry.dateKey !== 'string' || typeof entry.playedAt !== 'string') return false;
  if (Number.isNaN(Date.parse(entry.playedAt))) return false;
  if (!(EVENT_RUN_OUTCOMES as readonly string[]).includes(entry.outcome as string)) return false;
  if (
    entry.outcome === 'suppressed' &&
    (typeof entry.reason !== 'string' ||
      !(EVENT_SUPPRESS_REASONS as readonly string[]).includes(entry.reason))
  ) {
    return false;
  }
  return typeof entry.priority === 'number';
}

/**
 * 恢复 events 轨（须在事务内调用；调用方已先 ensureSeedData）。
 * 自定义助手 → 提醒 → 流水；已存在的行一律忽略，不覆盖本机数据。
 */
export function restoreEventsTrack(db: DatabaseInstance, payload: EventsTrackPayload): EventsRestoreCounts {
  const counts: EventsRestoreCounts = {
    assistants: { imported: 0, skipped: 0 },
    schedules: { imported: 0, skipped: 0 },
    usage: { imported: 0, skipped: 0 },
    triggers: { imported: 0, skipped: 0 },
  };

  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const insertAssistant = db.prepare(
    `INSERT OR IGNORE INTO assistants(
       id, name, emoji, color, system_prompt, temperature, top_p, max_tokens,
       model_id, planner_model_id, executor_model_id, reviewer_model_id,
       knowledge_base_ids, enabled_tools, retrieve_always, memory_enabled, expression_enabled,
       personality_frankness, personality_tsundere, personality_shy, personality_tolerance,
       card_id, is_builtin, sort_order, created_at, updated_at)
     VALUES (
       @id, @name, @emoji, @color, @systemPrompt, @temperature, @topP, @maxTokens,
       NULL, NULL, NULL, NULL,
       @knowledgeBaseIds, @enabledTools, @retrieveAlways, @memoryEnabled, @expressionEnabled,
       @pFrank, @pTsun, @pShy, @pTol,
       @cardId, 0, @sortOrder, @createdAt, @updatedAt)`,
  );
  const insertSchedule = db.prepare(
    `INSERT OR IGNORE INTO scheduled_tasks(
       id, assistant_id, kind, hour, minute, weekday, at_date, timezone, text,
       enabled, next_run_at, last_fired_at, created_at, updated_at)
     VALUES (
       @id, @assistantId, @kind, @hour, @minute, @weekday, @atDate, @timezone, @text,
       @enabled, @nextRunAt, @lastFiredAt, @createdAt, @updatedAt)`,
  );
  const insertUsage = db.prepare(
    `INSERT OR IGNORE INTO event_usage(
       id, assistant_id, event_id, date_key, played_at, outcome, reason, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTrigger = db.prepare(
    `INSERT OR IGNORE INTO event_triggers(
       id, assistant_id, event_id, phrases_json, cooldown_ms, start_hour, end_hour,
       max_per_day, min_intimacy, enabled, created_at, updated_at)
     VALUES (
       @id, @assistantId, @eventId, @phrases, @cooldownMs, @startHour, @endHour,
       @maxPerDay, @minIntimacy, @enabled, @createdAt, @updatedAt)`,
  );

  // 1. 自定义助手（仅恢复非内置；id/name 必须合法）
  for (const entry of payload.assistants ?? []) {
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || !entry.name.trim()) {
      counts.assistants.skipped++;
      continue;
    }
    if (assistantExists.get(entry.id)) {
      counts.assistants.skipped++;
      continue;
    }
    const nowIso = new Date().toISOString();
    try {
      insertAssistant.run({
        id: entry.id,
        name: entry.name.slice(0, 60),
        emoji: typeof entry.emoji === 'string' ? entry.emoji : null,
        color: typeof entry.color === 'string' ? entry.color : null,
        systemPrompt: typeof entry.systemPrompt === 'string' ? entry.systemPrompt : '',
        temperature: typeof entry.temperature === 'number' ? entry.temperature : 1,
        topP: typeof entry.topP === 'number' ? entry.topP : 1,
        maxTokens: typeof entry.maxTokens === 'number' ? entry.maxTokens : null,
        knowledgeBaseIds: JSON.stringify(
          Array.isArray(entry.knowledgeBaseIds) ? entry.knowledgeBaseIds : [],
        ),
        enabledTools: JSON.stringify(
          Array.isArray(entry.enabledTools) ? entry.enabledTools : ['current_time'],
        ),
        retrieveAlways: entry.retrieveAlways === false ? 0 : 1,
        memoryEnabled: entry.memoryEnabled === false ? 0 : 1,
        expressionEnabled: entry.expressionEnabled === false ? 0 : 1,
        pFrank: num01(entry.personalityFrankness),
        pTsun: num01(entry.personalityTsundere),
        pShy: num01(entry.personalityShy),
        pTol: num01(entry.personalityTolerance),
        cardId: typeof entry.cardId === 'string' && entry.cardId ? entry.cardId : null,
        sortOrder: typeof entry.sortOrder === 'number' ? Math.trunc(entry.sortOrder) : 0,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : nowIso,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIso,
      });
      counts.assistants.imported++;
    } catch {
      counts.assistants.skipped++;
    }
  }

  // 2. 提醒（schema 全量校验；助手不存在由 FK 拒绝 → 跳过）
  for (const raw of payload.schedules ?? []) {
    const parsed = scheduledTaskViewSchema.safeParse(raw);
    if (!parsed.success) {
      counts.schedules.skipped++;
      continue;
    }
    const view: ScheduledTaskView = parsed.data;
    try {
      const result = insertSchedule.run({
        id: view.id,
        assistantId: view.assistantId,
        kind: view.kind,
        hour: view.hour,
        minute: view.minute,
        weekday: view.weekday,
        atDate: view.atDate,
        timezone: view.timezone,
        text: view.text,
        enabled: view.enabled ? 1 : 0,
        nextRunAt: view.nextRunAt,
        lastFiredAt: view.lastFiredAt,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      });
      if (result.changes > 0) counts.schedules.imported++;
      else counts.schedules.skipped++;
    } catch {
      counts.schedules.skipped++;
    }
  }

  // 3. 演出流水（宽容逐项校验；助手不存在由 FK 拒绝 → 跳过）
  for (const entry of payload.usage ?? []) {
    if (!validUsage(entry)) {
      counts.usage.skipped++;
      continue;
    }
    try {
      const result = insertUsage.run(
        entry.id,
        entry.assistantId,
        entry.eventId,
        entry.dateKey,
        entry.playedAt,
        entry.outcome,
        typeof entry.reason === 'string' ? entry.reason : null,
        entry.priority,
      );
      if (result.changes > 0) counts.usage.imported++;
      else counts.usage.skipped++;
    } catch {
      counts.usage.skipped++;
    }
  }

  // 4. 自定义触发器（schema 全量校验；助手不存在由 FK 拒绝 → 跳过）
  for (const raw of payload.triggers ?? []) {
    const parsed = eventTriggerViewSchema.safeParse(raw);
    if (!parsed.success) {
      counts.triggers.skipped++;
      continue;
    }
    const view: EventTriggerView = parsed.data;
    try {
      const result = insertTrigger.run({
        id: view.id,
        assistantId: view.assistantId,
        eventId: view.eventId,
        phrases: JSON.stringify(view.phrases),
        cooldownMs: view.cooldownMs,
        startHour: view.startHour,
        endHour: view.endHour,
        maxPerDay: view.maxPerDay,
        minIntimacy: view.minIntimacy,
        enabled: view.enabled ? 1 : 0,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      });
      if (result.changes > 0) counts.triggers.imported++;
      else counts.triggers.skipped++;
    } catch {
      counts.triggers.skipped++;
    }
  }

  return counts;
}
