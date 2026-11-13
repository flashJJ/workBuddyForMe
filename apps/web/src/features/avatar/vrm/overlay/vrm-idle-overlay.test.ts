import { describe, expect, it } from 'vitest';
import type { VrmAnimationRuntime } from '../../animation/adapters/vrm';
import { VrmIdleOverlay } from './vrm-idle-overlay';

function fakeAnim(): VrmAnimationRuntime {
  return {
    active: false,
    hasMotion: () => true,
    applyMotion: () => 1,
  } as unknown as VrmAnimationRuntime;
}

describe('VrmIdleOverlay 暂停释放', () => {
  it('背对/睡眠时丢弃未完成的触摸反应，不在恢复后从半截续播', () => {
    const overlay = new VrmIdleOverlay(fakeAnim());
    expect(overlay.playReaction('motion.react-flinch', 1000)).toBe(true);
    expect(overlay.reacting).toBe(true);

    overlay.update(0, true, true);
    expect(overlay.reacting).toBe(false);
  });
});

describe('VrmIdleOverlay 待机余兴', () => {
  it('有 clip 待机时也会播放余兴动作', () => {
    const calls: string[] = [];
    const anim = {
      active: false,
      hasMotion: () => true,
      applyMotion: (id: string) => {
        calls.push(id);
        return 1;
      },
    } as unknown as VrmAnimationRuntime;
    const overlay = new VrmIdleOverlay(anim);
    (overlay as unknown as { accent: { id: string; startedAt: number } }).accent = {
      id: 'motion.hands-front',
      startedAt: performance.now(),
    };
    overlay.update(0, false, false);
    expect(overlay.accentId).toBe('motion.hands-front');
    expect(calls).toContain('motion.hands-front');
  });

  it('行为接管时余兴让位并清空状态', () => {
    const anim = {
      active: true,
      hasMotion: () => true,
      applyMotion: () => 1,
    } as unknown as VrmAnimationRuntime;
    const overlay = new VrmIdleOverlay(anim);
    (overlay as unknown as { accent: { id: string; startedAt: number } }).accent = {
      id: 'motion.hands-front',
      startedAt: performance.now(),
    };
    overlay.update(0, false, false);
    expect(overlay.accentId).toBeNull();
  });

  it('剧本 busy 时余兴让位', () => {
    const overlay = new VrmIdleOverlay(fakeAnim());
    (overlay as unknown as { accent: { id: string; startedAt: number } }).accent = {
      id: 'motion.hands-front',
      startedAt: performance.now(),
    };
    overlay.setScriptBusy(true);
    overlay.update(0, false, false);
    expect(overlay.accentId).toBeNull();
  });
});
