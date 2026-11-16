/** 音乐播放偏好的本地键与安全读写 */
export const MUSIC_STORAGE_KEYS = {
  volume: 'wbfm.music.volume',
  track: 'wbfm.music.track',
  loop: 'wbfm.music.loop',
} as const;

/** 会话级播放意图：舞台路由卸载后回到主窗恢复播放 */
export const MUSIC_SESSION_KEYS = {
  playing: 'wbfm.music.playing',
} as const;

export function readMusicSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeMusicSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式忽略 */
  }
}

export function readMusicSessionSetting(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeMusicSessionSetting(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* 隐私模式忽略 */
  }
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(file.name);
}
