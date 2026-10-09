import type { PermissionLevel } from '@wbfm/shared/types';
import type { SsePayloadMap } from '@wbfm/shared/api';

/** v0.6 M2：待用户确认的工具调用（HITL 弹窗数据源） */
export interface PendingToolConfirmation {
  callId: string;
  tool: string;
  permission: PermissionLevel;
  argsSummary: string;
}

/** v1.0：语音接线（朗读开关 + 音频帧/状态回调），由对话页注入播放队列 */
export interface ChatSessionVoice {
  ttsEnabled: boolean;
  onAudio?: (frame: SsePayloadMap['voice_audio']) => void;
  onVoiceState?: (state: SsePayloadMap['voice_state']) => void;
  /** 停止/重置时中断播放 */
  cancelPlayback?: () => void;
}
