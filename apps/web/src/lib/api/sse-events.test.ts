import { describe, expect, it } from 'vitest';
import { SSE_EVENT } from '@wbfm/shared/api';
import { ORCHESTRATOR_EVENT_NAMES } from '@wbfm/core/chat';
import { SseReader } from './sse-reader';
import { assertNever, narrowChatSseEvent } from './sse-events';

/**
 * v1.1 M4 web SSE 桥接契约一致性：
 * 1. 编译期：窄化白名单与 WebChatEventName 等集（漏/多事件 tsc 红）；
 * 2. 运行时：wire 录制（parseSseChunks 等价解析）中每个对话流事件名都能窄化，
 *    task/flow 等非对话流帧被丢弃；
 * 3. 窄化后 switch 穷尽（assertNever 对 never 才可调）。
 */

// 数量锁定：8 个编排器事件 + 2 个语音事件（等集关系由窄化模块 satisfies 与
// CHAT_EVENT_NAMES 表共同保证；此处锁总数防静默增删）
const EXPECTED_CHAT_COUNT = ORCHESTRATOR_EVENT_NAMES.length + 2;

describe('web SSE 事件窄化契约', () => {
  it('全部对话流事件（8 编排器 + 2 语音）可窄化，task/flow/未知帧被丢弃', () => {
    // wire 录制：构造每个对话流事件的裸帧
    const wire = [
      ...ORCHESTRATOR_EVENT_NAMES.map((name) => `event: ${name}\ndata: {"$":"${name}"}`),
      `event: ${SSE_EVENT.VOICE_AUDIO}\ndata: {"final":true}`,
      `event: ${SSE_EVENT.VOICE_STATE}\ndata: {"state":"idle"}`,
      // 非对话流事件
      `event: ${SSE_EVENT.TASK}\ndata: {"type":"run_started"}`,
      `event: ${SSE_EVENT.FLOW}\ndata: {"type":"run_succeeded"}`,
      'event: future_unknown\ndata: {}',
    ].join('\n\n') + '\n\n';

    const raws = new SseReader().feed(wire);
    const accepted = raws
      .map(narrowChatSseEvent)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    expect(accepted).toHaveLength(EXPECTED_CHAT_COUNT);
    expect(accepted.map((e) => e.event).sort()).toEqual(
      [
        ...ORCHESTRATOR_EVENT_NAMES,
        SSE_EVENT.VOICE_AUDIO,
        SSE_EVENT.VOICE_STATE,
      ].sort(),
    );
    // 窄化判别：13 个录制帧中 task/flow/未知共 3 个被丢（类型层亦保证 accepted 不含之）
    expect(raws).toHaveLength(EXPECTED_CHAT_COUNT + 3);
    expect(new Set(raws.map((r) => r.event))).toEqual(
      new Set([
        ...ORCHESTRATOR_EVENT_NAMES,
        SSE_EVENT.VOICE_AUDIO,
        SSE_EVENT.VOICE_STATE,
        SSE_EVENT.TASK,
        SSE_EVENT.FLOW,
        'future_unknown',
      ]),
    );
  });

  it('窄化后 data 形态按事件名判别（voice_audio 终帧可直接读 final）', () => {
    const raws = new SseReader().feed(
      `event: ${SSE_EVENT.VOICE_AUDIO}\ndata: {"fragment":"","spoken":"","audio":null,"sampleRate":0,"final":true}\n\n`,
    );
    const event = narrowChatSseEvent(raws[0]!);
    expect(event?.event).toBe('voice_audio');
    if (event?.event === 'voice_audio') {
      expect(event.data.final).toBe(true);
      expect(event.data.audio).toBeNull();
    }
  });

  it('assertNever 只接受 never（穷尽 switch 编译期保证的运行时镜像）', () => {
    // @ts-expect-error 穷尽保护只接受 never，string 不得赋值
    expect(() => assertNever('oops')).toThrow(/未穷尽/);
  });
});
