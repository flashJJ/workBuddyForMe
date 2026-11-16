// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  MUSIC_SESSION_KEYS,
  MUSIC_STORAGE_KEYS,
  readMusicSessionSetting,
  readMusicSetting,
  writeMusicSessionSetting,
  writeMusicSetting,
} from '../music-persistence';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('v4.2 音乐偏好与会话意图', () => {
  it('音量与曲目仍写 localStorage', () => {
    expect(readMusicSetting(MUSIC_STORAGE_KEYS.volume)).toBeNull();
    writeMusicSetting(MUSIC_STORAGE_KEYS.volume, '0.4');
    expect(readMusicSetting(MUSIC_STORAGE_KEYS.volume)).toBe('0.4');
  });

  it('播放意图写 sessionStorage，舞台返回后可恢复', () => {
    expect(readMusicSessionSetting(MUSIC_SESSION_KEYS.playing)).toBeNull();
    writeMusicSessionSetting(MUSIC_SESSION_KEYS.playing, '1');
    expect(readMusicSessionSetting(MUSIC_SESSION_KEYS.playing)).toBe('1');
    writeMusicSessionSetting(MUSIC_SESSION_KEYS.playing, '0');
    expect(readMusicSessionSetting(MUSIC_SESSION_KEYS.playing)).toBe('0');
  });
});
