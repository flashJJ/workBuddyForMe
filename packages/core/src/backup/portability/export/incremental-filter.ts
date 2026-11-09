/**
 * v2.34：增量归档筛选（tasks / emotion / events 轨）。
 * 规则：只保留 since 之后新创建的行；既有行的修改与删除不进入增量。
 * 无法解析的负载按原样保留（解密/损坏由恢复端统一报错）。
 */
import type { BackupManifest } from '@wbfm/shared/backup';
import type { TaskTrackEntry } from '../../export-tasks-track';
import type { EventsTrackManifest } from '../../export-events-track';
import type { AgentHandoffTrackEntry, AgentRunTrackEntry } from '../export-agent-runs';

type EventsManifest = NonNullable<BackupManifest['tracks']['events']>;

function isAfter(value: unknown, since: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return true;
  return value > since;
}

function parseArray<T>(raw: string | undefined): T[] | null {
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

interface EmotionRecord {
  updatedAt?: string;
  events?: Array<{ createdAt?: string }>;
}

/** tasks 轨：只保留 since 之后新建的运行/协作运行/交接 */
export function filterTasksFiles(
  files: Record<string, string>,
  counts: { entryCount: number; agentRunCount?: number; agentHandoffCount?: number },
  since: string,
): { entryCount: number; agentRunCount?: number; agentHandoffCount?: number } {
  const tasks = parseArray<TaskTrackEntry>(files['tasks.json']);
  if (tasks) {
    const kept = tasks.filter((entry) => isAfter(entry.run?.createdAt, since));
    files['tasks.json'] = JSON.stringify(kept, null, 2);
    counts.entryCount = kept.length;
  }
  const runs = parseArray<AgentRunTrackEntry>(files['agentRuns.json']);
  if (runs) {
    const kept = runs.filter((run) => isAfter(run.createdAt, since));
    files['agentRuns.json'] = JSON.stringify(kept, null, 2);
    counts.agentRunCount = kept.length;
  }
  const handoffs = parseArray<AgentHandoffTrackEntry>(files['agentHandoffs.json']);
  if (handoffs) {
    const kept = handoffs.filter((handoff) => isAfter(handoff.createdAt, since));
    files['agentHandoffs.json'] = JSON.stringify(kept, null, 2);
    counts.agentHandoffCount = kept.length;
  }
  return counts;
}

/** emotion 轨：只保留新状态与新事件；老状态作为事件壳保留 */
export function filterEmotionFile(
  files: Record<string, string>,
  since: string,
): number | null {
  const records = parseArray<EmotionRecord>(files['emotion.json']);
  if (!records) return null;
  const kept: EmotionRecord[] = [];
  for (const record of records) {
    const events = (record.events ?? []).filter((event) => isAfter(event.createdAt, since));
    const stateNew = isAfter(record.updatedAt, since);
    if (!stateNew && events.length === 0) continue;
    kept.push({ ...record, events });
  }
  files['emotion.json'] = JSON.stringify(kept, null, 2);
  return kept.length;
}

function filterList<T>(raw: string | undefined, since: string): T[] | null {
  const rows = parseArray<T>(raw);
  return rows ? rows.filter((row) => isAfter((row as { createdAt?: string }).createdAt, since)) : null;
}

/** events 轨：所有追加型文件按 createdAt 过滤，并重算 manifest 计数 */
export function filterEventsFiles(
  files: Record<string, string>,
  manifest: EventsManifest,
  since: string,
): void {
  const events = files['events.json'];
  if (events) {
    try {
      const parsed = JSON.parse(events) as {
        assistants?: Array<{ createdAt?: string }>;
        schedules?: Array<{ createdAt?: string }>;
        usage?: Array<{ createdAt?: string }>;
        triggers?: Array<{ createdAt?: string }>;
      };
      const assistants = (parsed.assistants ?? []).filter((row) => isAfter(row.createdAt, since));
      const schedules = (parsed.schedules ?? []).filter((row) => isAfter(row.createdAt, since));
      const usage = (parsed.usage ?? []).filter((row) => isAfter(row.createdAt, since));
      const triggers = (parsed.triggers ?? []).filter((row) => isAfter(row.createdAt, since));
      files['events.json'] = JSON.stringify({ assistants, schedules, usage, triggers }, null, 2);
      manifest.assistantCount = assistants.length;
      manifest.scheduleCount = schedules.length;
      manifest.usageCount = usage.length;
      manifest.triggerCount = triggers.length;
    } catch {
      /* 保留原负载 */
    }
  }

  const mappings: Array<[string, Exclude<keyof EventsManifest, 'files'>]> = [
    ['characterCards.json', 'cardCount'],
    ['stageScenes.json', 'stageSceneCount'],
    ['meetings.json', 'meetingCount'],
    ['meetingMessages.json', 'meetingMessageCount'],
    ['relationshipMilestones.json', 'relationshipMilestoneCount'],
    ['modInstalls.json', 'modInstallCount'],
    ['vrmAvatars.json', 'vrmAvatarCount'],
    ['memories.json', 'memoryCount'],
    ['meetingConclusions.json', 'meetingConclusionCount'],
    ['meetingActionItems.json', 'meetingActionItemCount'],
  ];
  for (const [name, key] of mappings) {
    const kept = filterList<{ createdAt?: string }>(files[name], since);
    if (!kept) continue;
    files[name] = JSON.stringify(kept, null, 2);
    manifest[key] = kept.length;
  }
}

/** 过滤后重算 events 轨总条数（用于报告与进度） */
export function eventsTotal(manifest: EventsManifest): number {
  return (
    manifest.assistantCount +
    manifest.scheduleCount +
    manifest.usageCount +
    (manifest.triggerCount ?? 0) +
    (manifest.cardCount ?? 0) +
    (manifest.stageSceneCount ?? 0) +
    (manifest.meetingCount ?? 0) +
    (manifest.meetingMessageCount ?? 0) +
    (manifest.relationshipMilestoneCount ?? 0) +
    (manifest.modInstallCount ?? 0) +
    (manifest.vrmAvatarCount ?? 0) +
    (manifest.memoryCount ?? 0) +
    (manifest.meetingConclusionCount ?? 0) +
    (manifest.meetingActionItemCount ?? 0)
  );
}

export type { EventsTrackManifest };
