/**
 * v1.7 event_usage 的 HTTP 契约（渲染进程导演 → 服务端持久化）。
 */
import { z } from 'zod';
import {
  EVENT_RUN_OUTCOMES,
  type EventRunOutcome,
} from './event';

export const eventUsageAppendSchema = z.object({
  assistantId: z.string().trim().min(1),
  eventId: z
    .string()
    .min(3)
    .max(80)
    .regex(/^(ev|usr)\.[a-z0-9]+(?:\.[a-z0-9]+)*$/),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  playedAt: z.string().datetime(),
  outcome: z.enum(EVENT_RUN_OUTCOMES),
  reason: z.string().min(1).max(40).nullable().optional(),
  priority: z.number().int().min(1).max(3),
});
export type EventUsageAppendInput = z.infer<typeof eventUsageAppendSchema>;

export const eventUsageSnapshotQuerySchema = z.object({
  assistantId: z.string().trim().min(1),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface EventUsageSnapshotItem {
  eventId: string;
  lastPlayedAt: string | null;
  playedToday: number;
}

export const eventUsageStatsQuerySchema = z.object({
  assistantId: z.string().trim().min(1),
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});

export interface EventUsageStatsView {
  played: number;
  skipped: number;
  interrupted: number;
  suppressed: number;
  /** 接受率 = played/(played+skipped)，无数据 null */
  acceptRate: number | null;
  /** 打断率 = interrupted/played（近似打扰率），无播放 null */
  interruptRate: number | null;
}
