/** 音乐播放偏好的本地键与安全读写 */
export const MUSIC_STORAGE_KEYS = {
  volume: 'wbfm.music.volume',
  track: 'wbfm.music.track',
  loop: 'wbfm.music.loop',
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

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(file.name);
}
