import {
  CONTEXT_MESSAGES_MAX,
  CONTEXT_MESSAGES_MIN,
  DEFAULT_CONTEXT_MESSAGES,
  MEMORY_EVENT_RETENTION_DAYS,
  MEMORY_EVENT_RETENTION_DEFAULT_DAYS,
} from '@wbfm/shared/constants';

/** 服务端钳制上下文条数：settings_kv 可被手改/旧值污染，越界一律回落默认 */
export function resolveContextMessageCount(value: number | undefined | null): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= CONTEXT_MESSAGES_MIN &&
    value <= CONTEXT_MESSAGES_MAX
    ? value
    : DEFAULT_CONTEXT_MESSAGES;
}

/** v2.28：审计保留期只接受 30/90/180/0（永久），其余回落默认 90 天 */
export function resolveMemoryEventRetentionDays(value: number | undefined | null): number {
  return typeof value === 'number' &&
    (MEMORY_EVENT_RETENTION_DAYS as readonly number[]).includes(value)
    ? value
    : MEMORY_EVENT_RETENTION_DEFAULT_DAYS;
}
