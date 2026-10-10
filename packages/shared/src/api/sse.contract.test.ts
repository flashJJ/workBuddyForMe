import { describe, expect, it } from 'vitest';
import {
  SSE_EVENT,
  type SseEvent,
  type SseEventName,
  type SsePayloadMap,
} from './sse';

/**
 * v1.1 M4 SSE 契约一致性（机械防漂移）：
 * 1. 编译期：所有 SseEventName 都必须在 SsePayloadMap 有映射（删任一 payload 键 tsc 红）；
 * 2. 运行时：SSE_EVENT 常量值集合 === SsePayloadMap 键集合（新增事件只改一处即漏，测试红）；
 * 3. 派生事件类型判别：SseEvent<K> 的 event/data 按名成对。
 */

// 编译期守卫①：SseEventName 是 SsePayloadMap 键的子集（且由 SSE_EVENT 派生）
type AllNamesHavePayload = SseEventName extends keyof SsePayloadMap ? true : false;
const _allNamesHavePayload: AllNamesHavePayload = true;
void _allNamesHavePayload;

// 编译期守卫③：派生出的事件 event 与 data 成对绑定（交换/错配无法通过赋值）
const sampleMeta: SseEvent<'meta'> = { event: 'meta', data: { messageId: 'm1', conversationId: 'c1' } };
const sampleDone: SseEvent<'done'> = {
  event: 'done',
  data: { content: '', usage: null },
};
void sampleMeta;
void sampleDone;

/** SsePayloadMap 键的运行时镜像：satisfies Record 强制每个线上事件都列出（增删键 tsc 红） */
const PAYLOAD_KEY_TABLE = {
  meta: 1,
  delta: 1,
  citations: 1,
  memories: 1,
  tool: 1,
  tool_confirmation_required: 1,
  task: 1,
  flow: 1,
  voice_audio: 1,
  voice_state: 1,
  compile: 1,
  done: 1,
  error: 1,
} as const satisfies Record<SseEventName, number>;

describe('SSE 契约一致性', () => {
  it('SSE_EVENT 常量值集合与 SsePayloadMap 键集合完全相等', () => {
    const wireNames = Object.values(SSE_EVENT).sort();
    const payloadKeys = Object.keys(PAYLOAD_KEY_TABLE).sort();
    expect(wireNames).toEqual(payloadKeys);
  });

  it('SSE_EVENT 值唯一且无空串', () => {
    const values = Object.values(SSE_EVENT);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('SseEvent<> 覆盖全部线上事件名（数量对账）', () => {
    // 与 PAYLOAD_KEY_TABLE/常量同源；显式数量锁住 13 个事件，新增必须显式更新
    expect(Object.keys(PAYLOAD_KEY_TABLE)).toHaveLength(13);
    expect(Object.values(SSE_EVENT)).toHaveLength(13);
  });
});
