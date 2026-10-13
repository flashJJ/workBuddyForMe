/**
 * v1.7 远程演出用量闸门（M4）：event_usage 表的渲染进程快照写穿实现。
 *
 * 导演 trigger 是同步判定，不能每事件打 HTTP，故：
 * - 挂载时按当前助手+本地日界拉一次快照，冷却/每日计数从内存 Map 读；
 * - record() 同步乐观更新本地 Map（闸门立即生效），异步 POST 持久化，
 *   失败只告警不重试不阻断（流水是统计/闸门辅助，永不阻断主回复红线）；
 * - 跨午夜后 countPlayedToday 自然读到新 dateKey 的空计数。
 */
import type { EventRunOutcome } from '@wbfm/shared/schemas';
import type { EventUsageStore } from '@wbfm/core/event-client';
import { apiGet, apiPost } from '@/lib/api/client';

/** 本版固定 Asia/Shanghai（UTC+8 无 DST）日界，与 core computeNextRunMs 同口径 */
export function shanghaiDateKey(nowMs: number): string {
  return new Date(nowMs + 8 * 3600_000).toISOString().slice(0, 10);
}

interface SnapshotResponse {
  assistantId: string;
  dateKey: string;
  items: Array<{ eventId: string; lastPlayedAt: string | null; playedToday: number }>;
}

export class RemoteEventUsageStore implements EventUsageStore {
  private lastPlayed = new Map<string, number>();
  private playedByDate = new Map<string, number>();
  private hydrating: Promise<void> | null = null;

  constructor(
    private readonly assistantId: string,
    private readonly toDateKey: (nowMs: number) => string = shanghaiDateKey,
  ) {}

  /** 拉取当日快照（重复调用复用同一 Promise；失败回落空闸门，不抛出） */
  hydrate(): Promise<void> {
    if (!this.hydrating) {
      const dateKey = this.toDateKey(Date.now());
      this.hydrating = apiGet<SnapshotResponse>(
        `/api/events/usage?assistantId=${encodeURIComponent(this.assistantId)}&dateKey=${dateKey}`,
      )
        .then((data) => {
          for (const item of data.items) {
            if (item.lastPlayedAt) {
              const ms = Date.parse(item.lastPlayedAt);
              if (Number.isFinite(ms)) this.lastPlayed.set(item.eventId, ms);
            }
            if (item.playedToday > 0) {
              this.playedByDate.set(`${dateKey}:${item.eventId}`, item.playedToday);
            }
          }
        })
        .catch((error: unknown) => {
          // 快照失败：本会话按空历史放行（可能多演一次，优于静默僵死）
          console.warn('[event-usage] 快照拉取失败，按空历史运行', error);
        });
    }
    return this.hydrating;
  }

  lastPlayedAt(eventId: string): number | null {
    return this.lastPlayed.get(eventId) ?? null;
  }

  countPlayedToday(eventId: string, dateKey: string): number {
    return this.playedByDate.get(`${dateKey}:${eventId}`) ?? 0;
  }

  record(entry: {
    eventId: string;
    playedAt: number;
    outcome: EventRunOutcome;
    reason?: string;
    priority: number;
  }): void {
    // 乐观本地更新：冷却只认 played；每日计数按本地日界
    if (entry.outcome === 'played') {
      const prev = this.lastPlayed.get(entry.eventId) ?? 0;
      if (entry.playedAt > prev) this.lastPlayed.set(entry.eventId, entry.playedAt);
      const key = `${this.toDateKey(entry.playedAt)}:${entry.eventId}`;
      this.playedByDate.set(key, (this.playedByDate.get(key) ?? 0) + 1);
    }
    void apiPost('/api/events/usage', {
      assistantId: this.assistantId,
      eventId: entry.eventId,
      dateKey: this.toDateKey(entry.playedAt),
      playedAt: new Date(entry.playedAt).toISOString(),
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      priority: entry.priority,
    }).catch((error: unknown) => {
      console.warn('[event-usage] 流水持久化失败（不影响演出）', error);
    });
  }
}
