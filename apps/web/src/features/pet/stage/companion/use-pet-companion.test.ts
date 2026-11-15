// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetCompanionSettings, PetQuickAction } from '@wbfm/shared/pet';
import type { VoiceSettings } from '@wbfm/shared/schemas';

const voice = vi.hoisted(() => ({
  settings: { ttsEnabled: true, proactiveEnabled: false } as Partial<VoiceSettings>,
  update: vi.fn(async () => ({})),
}));
vi.mock('@/features/voice', () => ({ useVoiceSettings: () => voice }));

let quickHandler: ((action: PetQuickAction) => void) | null = null;
let companionReports: PetCompanionSettings[] = [];
const bridge = {
  onQuickAction: (cb: (action: PetQuickAction) => void) => {
    quickHandler = cb;
    return () => {
      quickHandler = null;
    };
  },
  reportCompanionSettings: (settings: PetCompanionSettings) => {
    companionReports.push(settings);
  },
};
vi.mock('../../pet-bridge', () => ({ getPetBridge: () => bridge }));

import { usePetCompanion, type PetCompanionArgs } from './use-pet-companion';

function makeArgs(overrides: Partial<PetCompanionArgs> = {}): PetCompanionArgs {
  return {
    linesEnabled: true,
    script: { playScene: vi.fn(() => true) },
    showLine: vi.fn(),
    t: (key) => `T:${key}`,
    ...overrides,
  };
}

describe('usePetCompanion（M1 伴身交互）', () => {
  beforeEach(() => {
    window.localStorage.clear();
    voice.settings = { ttsEnabled: true, proactiveEnabled: false };
    voice.update.mockClear();
    quickHandler = null;
    companionReports = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次见面问候一次，之后不再重复', () => {
    vi.useFakeTimers();
    const args = makeArgs();
    const first = renderHook(() => usePetCompanion(args));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(args.showLine).toHaveBeenCalledTimes(1);
    expect(String((args.showLine as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toMatch(
      /^T:emotion\.firstMeet\.line[0-2]$/,
    );
    first.unmount();

    const second = makeArgs();
    renderHook(() => usePetCompanion(second));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(second.showLine).not.toHaveBeenCalled();
  });

  it('右键动作：干饭/炸毛直接播放内置场戏', () => {
    const args = makeArgs();
    renderHook(() => usePetCompanion(args));

    act(() => {
      quickHandler?.('play-eat-rice');
      quickHandler?.('play-called-fat');
    });
    expect(args.script.playScene).toHaveBeenNthCalledWith(1, 'moment.eat-rice');
    expect(args.script.playScene).toHaveBeenNthCalledWith(2, 'moment.called-fat');
  });

  it('剧本不可用时右键动作回退本地台词', () => {
    const args = makeArgs({ script: { playScene: vi.fn(() => false) } });
    renderHook(() => usePetCompanion(args));

    act(() => {
      quickHandler?.('play-eat-rice');
      quickHandler?.('play-called-fat');
    });
    const lines = (args.showLine as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
      String(call[0]),
    );
    expect(lines.some((line) => /^T:emotion\.eatRice\.line[0-2]$/.test(line))).toBe(true);
    expect(lines.some((line) => /^T:emotion\.calledFat\.line[0-2]$/.test(line))).toBe(true);
  });

  it('一键静音：取反 ttsEnabled 并回报台词', async () => {
    const args = makeArgs();
    renderHook(() => usePetCompanion(args));

    await act(async () => {
      quickHandler?.('toggle-mute');
    });
    expect(voice.update).toHaveBeenCalledWith({ ttsEnabled: false });
    expect(String((args.showLine as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toBe(
      'T:emotion.quick.muteOn',
    );
  });

  it('主动说话开关：取反 proactiveEnabled 并回报台词', async () => {
    const args = makeArgs();
    renderHook(() => usePetCompanion(args));

    await act(async () => {
      quickHandler?.('toggle-proactive');
    });
    expect(voice.update).toHaveBeenCalledWith({ proactiveEnabled: true });
    expect(String((args.showLine as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toBe(
      'T:emotion.quick.proactiveOn',
    );
  });

  it('同步静音/主动说话状态给右键菜单', () => {
    voice.settings = { ttsEnabled: false, proactiveEnabled: true };
    renderHook(() => usePetCompanion(makeArgs()));
    expect(companionReports).toEqual([{ muted: true, proactive: true }]);
  });
});
