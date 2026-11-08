import { describe, expect, it } from 'vitest';
import type { Memory } from '@wbfm/shared/types';
import { decideWrite } from './memory-write';

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: '1',
    kind: 'fact',
    content: '用户住在北京',
    importance: 0.6,
    sourceConversationId: null,
    sourceMessageId: null,
    recallCount: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastAccessedAt: null,
    scope: 'global',
    assistantId: null,
    source: 'extract',
    pinned: false,
    confidence: 1,
    subjectKey: null,
    version: 1,
    supersededBy: null,
    validFrom: null,
    validTo: null,
    ttlAt: null,
    lastConfirmedAt: null,
    ...overrides,
  };
}

const candidate = { kind: 'fact' as const, content: '用户住在上海', importance: 0.7 };

describe('v2.26 写入决策', () => {
  it('无同主体且无近邻 → create', () => {
    expect(decideWrite({ candidate, nearest: null, sameSubject: [] })).toEqual({
      action: 'create',
      targetId: null,
    });
  });

  it('同主体内容不同 → supersede 旧版本', () => {
    expect(
      decideWrite({
        candidate,
        nearest: null,
        sameSubject: [memory({ id: '9', subjectKey: 'residence:city' })],
      }),
    ).toEqual({ action: 'supersede', targetId: '9' });
  });

  it('同主体内容相同（忽略空白）→ merge', () => {
    expect(
      decideWrite({
        candidate: { ...candidate, content: '用户住在北京' },
        nearest: null,
        sameSubject: [memory({ id: '9', subjectKey: 'residence:city' })],
      }),
    ).toEqual({ action: 'merge', targetId: '9' });
  });

  it('近邻距离 ≤ 去重阈值 → merge；超过阈值 → create', () => {
    expect(
      decideWrite({ candidate, nearest: { id: '3', distance: 0.2 }, sameSubject: [] }),
    ).toEqual({ action: 'merge', targetId: '3' });
    expect(
      decideWrite({ candidate, nearest: { id: '3', distance: 0.8 }, sameSubject: [] }),
    ).toEqual({ action: 'create', targetId: null });
  });
});
