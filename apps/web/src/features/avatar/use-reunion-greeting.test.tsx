// @vitest-environment jsdom
'use client';

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { REUNION_STORAGE_KEY } from '@wbfm/shared/constants';
import { useReunionGreeting } from './use-reunion-greeting';
import type { Conversation } from '@wbfm/shared/types';

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const HOUR = 3600_000;

let conversations: Conversation[] = [];
let isSuccess = true;

vi.mock('@/lib/hooks/use-conversations', () => ({
  useConversations: () => ({ data: conversations, isSuccess }),
}));

function makeConversation(lastMessageAt: number): Conversation {
  return {
    id: 'c1',
    assistantId: 'a1',
    title: 't',
    lastMessageAt: new Date(lastMessageAt).toISOString(),
    summary: null,
    summaryTurns: 0,
    createdAt: '',
    updatedAt: '',
  };
}

describe('useReunionGreeting（v1.6 G6 久别迎接）', () => {
  beforeEach(() => {
    window.localStorage.clear();
    conversations = [];
    isSuccess = true;
  });

  it('离开 25h：数据就绪即迎接一次（miss 档/sadness），并持久化久别基线', () => {
    conversations = [makeConversation(NOW - 25 * HOUR)];
    const onGreet = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: true, now: () => NOW, random: () => 0, onGreet }),
    );
    expect(onGreet).toHaveBeenCalledOnce();
    const arg = onGreet.mock.calls[0]![0];
    expect(arg.tier).toBe('miss');
    expect(arg.expression).toBe('sadness');
    expect(arg.lineKey).toMatch(/^emotion\.reunion\.miss[0-3]$/);
    const memory = JSON.parse(window.localStorage.getItem(REUNION_STORAGE_KEY)!);
    expect(memory.greetedInteractionAt).toBe(NOW - 25 * HOUR);
  });

  it('离开 5h：不迎接', () => {
    conversations = [makeConversation(NOW - 5 * HOUR)];
    const onGreet = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: true, now: () => NOW, random: () => 0, onGreet }),
    );
    expect(onGreet).not.toHaveBeenCalled();
  });

  it('开关关闭：即使久别也不迎接', () => {
    conversations = [makeConversation(NOW - 25 * HOUR)];
    const onGreet = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: false, now: () => NOW, random: () => 0, onGreet }),
    );
    expect(onGreet).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REUNION_STORAGE_KEY)).toBeNull();
  });

  it('同一波久别已迎接过（基线已记录）：不重复迎接', () => {
    const base = NOW - 25 * HOUR;
    conversations = [makeConversation(base)];
    window.localStorage.setItem(
      REUNION_STORAGE_KEY,
      JSON.stringify({ greetedInteractionAt: base, greetedAt: NOW - 1000 }),
    );
    const onGreet = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: true, now: () => NOW, random: () => 0, onGreet }),
    );
    expect(onGreet).not.toHaveBeenCalled();
  });

  it('数据未就绪时不迎接；73h（longMiss）给 joy 以外的委屈档表情', () => {
    isSuccess = false;
    const onGreetNotReady = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: true, now: () => NOW, random: () => 0, onGreet: onGreetNotReady }),
    );
    expect(onGreetNotReady).not.toHaveBeenCalled();

    isSuccess = true;
    conversations = [makeConversation(NOW - 73 * HOUR)];
    const onGreet = vi.fn();
    renderHook(() =>
      useReunionGreeting({ enabled: true, now: () => NOW, random: () => 0, onGreet }),
    );
    expect(onGreet).toHaveBeenCalledOnce();
    expect(onGreet.mock.calls[0]![0].tier).toBe('longMiss');
    expect(onGreet.mock.calls[0]![0].lineKey).toMatch(/^emotion\.reunion\.longMiss[0-2]$/);
  });
});
