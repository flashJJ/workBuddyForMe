// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioUnlockListener } from './audio-unlock';
import { audioDirector } from '@/features/audio';

describe('v4.2 首次手势解锁', () => {
  it('pointerdown 与 keydown 都只触发一次，并调用导演解锁回调', () => {
    const handler = vi.fn();
    const unregister = audioDirector.registerUnlock(handler);
    const { unmount } = render(<AudioUnlockListener />);

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(handler).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
    unregister();
  });
});
