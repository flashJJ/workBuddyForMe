import { describe, expect, it } from 'vitest';
import type { SessionEventView } from '@wbfm/database';
import type { SessionLogService } from '../../../session-log/session-log-service';
import { resolvePreflightTrigger } from './preflight-trigger';

function service(events: Array<Pick<SessionEventView, 'type' | 'payload'>>): SessionLogService {
  return {
    listAll: () => events.map((event, index) => ({ ...event, id: `e${index}` })),
  } as unknown as SessionLogService;
}

describe('resolvePreflightTrigger（v4.8 压缩触发归因）', () => {
  it('最近窗口大于当前窗口 → model_change', () => {
    const events = service([
      { type: 'turn_intent', payload: {} },
      { type: 'context_snapshot', payload: { contextWindow: 32_000 } },
    ]);
    expect(resolvePreflightTrigger(events, 'c1', 8_192)).toBe('model_change');
  });

  it('窗口未变小或无快照 → preflight', () => {
    const same = service([{ type: 'context_snapshot', payload: { contextWindow: 8_192 } }]);
    expect(resolvePreflightTrigger(same, 'c1', 8_192)).toBe('preflight');
    expect(resolvePreflightTrigger(service([]), 'c1', 8_192)).toBe('preflight');
    expect(resolvePreflightTrigger(undefined, 'c1', 8_192)).toBe('preflight');
  });
});
