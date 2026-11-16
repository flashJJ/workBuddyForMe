/** v4.2 音频导演：音轨类型、sink 与订阅快照 */

export const AUDIO_TRACK_KINDS = ['music', 'theater-bgm', 'voice', 'sfx'] as const;
export type AudioTrackKind = (typeof AUDIO_TRACK_KINDS)[number];

/** 背景乐类型：同一时刻最多一条 */
export type AudioBackgroundKind = Extract<AudioTrackKind, 'music' | 'theater-bgm'>;

/** 音频子系统注册的音量出口；gain 为导演算好的 0–1 系数 */
export interface AudioSink {
  setGain(gain: number): void;
  /** 背景互斥：true 时暂停发声，但不销毁播放器 */
  setSuspended?(suspended: boolean): void;
  /** v4.3 M4：输出设备偏好；不支持或失败时 sink 自行回退默认 */
  setOutputDevice?(deviceId: string | null): void;
}

export interface AudioDirectorSnapshot {
  muted: boolean;
  voiceActive: boolean;
  background: AudioBackgroundKind | null;
  unlocked: boolean;
  /** v4.3 M4：输出设备偏好；null = 系统默认 */
  outputDevice: string | null;
}

export type AudioDirectorListener = (snapshot: AudioDirectorSnapshot) => void;
