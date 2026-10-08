import type { DownloadProgress, VoiceModelKind } from '@wbfm/voice';

export interface DownloadJob {
  kind: VoiceModelKind;
  /** 同 kind 可能有多个规格（两套 TTS 引擎），用 specId 区分活动任务归属 */
  specId: string;
  controller: AbortController;
  lastProgress: DownloadProgress | null;
}

export interface SynthResult {
  samples: Float32Array;
  sampleRate: number;
}

export interface TranscribeResult {
  text: string;
  lang: string | null;
}
