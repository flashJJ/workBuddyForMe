import { describe, expect, it } from 'vitest';
import { SSE_EVENT, type SseEventName } from '@wbfm/shared/api';
import {
  ORCHESTRATOR_EVENT_NAMES,
  type OrchestratorEvent,
  type OrchestratorEventName,
} from './types';

/**
 * v1.1 M4 编排器事件契约一致性：
 * 1. 编译期穷尽 switch：漏掉任一 OrchestratorEventName 分支，never 赋值报 tsc 错；
 * 2. 运行时：ORCHESTRATOR_EVENT_NAMES 是线上事件集合的真子集（每个都在 SSE_EVENT 注册），
 *    且恰好 8 个（编排器边界：task/flow/voice_audio/voice_state 不在其中）；
 * 3. wire 录制兜底：编排器实际 yield 的事件名只能是这 8 个（由 SseEvent<> 类型 +
 *    yield 点编译保证；此处再对常量集做运行时锁定）。
 */

function exhaustiveDispatch(event: OrchestratorEvent): string {
  switch (event.event) {
    case 'meta':
      return event.data.messageId;
    case 'delta':
      return event.data.content;
    case 'citations':
      return String(event.data.citations.length);
    case 'memories':
      return String(event.data.memories.length);
    case 'tool':
      return event.data.callId;
    case 'tool_confirmation_required':
      return event.data.callId;
    case 'done':
      return event.data.content;
    case 'error':
      return event.data.code;
    default: {
      // 漏分支时 event 不是 never，tsc 红
      const _exhaustive: never = event;
      throw new Error(String(_exhaustive));
    }
  }
}

// 编译期：编排器事件名必须全部是线上事件名（删 SsePayloadMap 键即红）
type NamesOnWire = OrchestratorEventName extends SseEventName ? true : false;
const _namesOnWire: NamesOnWire = true;
void _namesOnWire;

// 编译期：非编排器事件（task/flow/voice_*）不得混进 OrchestratorEvent
type TaskIsNotOrchestrator = 'task' extends OrchestratorEventName ? false : true;
const _taskExcluded: TaskIsNotOrchestrator = true;
void _taskExcluded;

describe('编排器事件契约', () => {
  it('ORCHESTRATOR_EVENT_NAMES 恰好 8 个且全部注册在 SSE_EVENT', () => {
    expect(ORCHESTRATOR_EVENT_NAMES).toHaveLength(8);
    for (const name of ORCHESTRATOR_EVENT_NAMES) {
      expect(Object.values(SSE_EVENT)).toContain(name);
    }
    expect(new Set(ORCHESTRATOR_EVENT_NAMES).size).toBe(ORCHESTRATOR_EVENT_NAMES.length);
  });

  it('task/flow/voice_audio/voice_state 不属于编排器事件', () => {
    const names = new Set<string>(ORCHESTRATOR_EVENT_NAMES);
    for (const augmented of ['task', 'flow', SSE_EVENT.VOICE_AUDIO, SSE_EVENT.VOICE_STATE]) {
      expect(names.has(augmented)).toBe(false);
    }
  });

  it('穷尽 switch 对各代表事件可分派（类型机械派生，data 形状跟随）', () => {
    expect(
      exhaustiveDispatch({ event: 'meta', data: { messageId: 'm', conversationId: 'c' } }),
    ).toBe('m');
    expect(exhaustiveDispatch({ event: 'delta', data: { content: '你好' } })).toBe('你好');
    expect(
      exhaustiveDispatch({ event: 'error', data: { code: 'E', message: 'x' } }),
    ).toBe('E');
  });
});
