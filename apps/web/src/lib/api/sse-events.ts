import { SSE_EVENT, type SseEvent } from '@wbfm/shared/api';
import type { OrchestratorEventName } from '@wbfm/core/chat';
import type { RawSseEvent } from './sse-reader';

/**
 * web 侧线上事件联合（v1.1 M4）：全部从 SsePayloadMap 经 SseEvent<> 机械派生，
 * 不再手写 {event,data} 联合。
 */

/** /api/chat/stream 对话流：编排器 8 事件 + 语音桥追加 2 事件 */
export type WebChatEventName = OrchestratorEventName | 'voice_audio' | 'voice_state';
export type WebChatSseEvent = SseEvent<WebChatEventName>;

/** SSE 响应序列化层：对话流 + 任务循环（task）+ v1.3 编译进度（compile）；flow 走独立订阅不经此类型 */
export type WebStreamSseEvent = SseEvent<
  OrchestratorEventName | 'task' | 'voice_audio' | 'voice_state' | 'compile'
>;

/**
 * 对话流事件名运行时白名单（wire 边界唯一一次字符串判定）。
 * 值取 SSE_EVENT 常量；satisfies 保证都是合法对话流事件名，与 WebChatEventName 的
 * 等集关系由 sse-events 契约测试机械保证（漏事件测试红）。
 */
const CHAT_EVENT_NAMES = [
  SSE_EVENT.META,
  SSE_EVENT.DELTA,
  SSE_EVENT.CITATIONS,
  SSE_EVENT.MEMORIES,
  SSE_EVENT.TOOL,
  SSE_EVENT.TOOL_CONFIRMATION_REQUIRED,
  SSE_EVENT.VOICE_AUDIO,
  SSE_EVENT.VOICE_STATE,
  SSE_EVENT.DONE,
  SSE_EVENT.ERROR,
] as const satisfies readonly WebChatEventName[];

const CHAT_EVENT_NAME_SET: ReadonlySet<string> = new Set<string>(CHAT_EVENT_NAMES);

/**
 * wire 边界窄化：SseReader 产出的是 {event: string, data: unknown}，
 * 在此按事件名白名单收窄为 WebChatSseEvent（全仓唯一一处对 data 的边界断言）；
 * 非对话流事件（task/flow/未知帧）返回 null，由调用方忽略。
 */
export function narrowChatSseEvent(raw: RawSseEvent): WebChatSseEvent | null {
  return CHAT_EVENT_NAME_SET.has(raw.event as WebChatEventName)
    ? (raw as unknown as WebChatSseEvent)
    : null;
}

/** 编译期穷尽检查助手：switch 漏分支时 never 赋值报 tsc 错 */
export function assertNever(value: never): never {
  throw new Error(`未穷尽的 SSE 事件分支: ${JSON.stringify(value)}`);
}
