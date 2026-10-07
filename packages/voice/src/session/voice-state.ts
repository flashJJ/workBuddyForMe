/**
 * 语音会话状态机（纯数据、纯函数，渲染端与服务端共用同一份规约）。
 *
 * idle      初始/一轮结束
 * listening 用户正在说话（端点检测或按住说话）
 * thinking  ASR/LLM 处理中
 * speaking  TTS 播放中
 *
 * 半双工约束（v1.0）：speaking 期间不允许 listening（麦克风软闭麦防自激），
 * 但允许 listen_start 作为「打断」入口：先中断播放再进入 listening。
 */

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceEvent =
  | 'listen_start' // 用户开始说话（打断语义：speaking 下也合法）
  | 'listen_end' // 一句话说完，进入处理
  | 'llm_start' // 纯文字输入也可触发（跳过 listening）
  | 'speech_start' // 首段 TTS 开始播放
  | 'speech_end' // 全部播放完成
  | 'cancel' // 用户停止/急停（任意状态 → idle）
  | 'error'; // 异常回到 idle

/**
 * 合法迁移表。cancel/error 对所有状态合法（单独处理，不在表内重复）。
 */
const ALLOWED: Record<VoiceState, VoiceEvent[]> = {
  idle: ['listen_start', 'llm_start'],
  listening: ['listen_end', 'llm_start'],
  thinking: ['speech_start'],
  speaking: ['listen_start'],
};

export function isVoiceTransitionAllowed(state: VoiceState, event: VoiceEvent): boolean {
  if (event === 'cancel' || event === 'error') return true;
  return ALLOWED[state]?.includes(event) ?? false;
}

export interface VoiceTransition {
  state: VoiceState;
  changed: boolean;
  illegal: boolean;
}

/**
 * 计算下一状态。
 * - 合法迁移 → changed=true；
 * - 非法迁移 → 保持原状态，illegal=true（调用方记日志/丢弃即可，不抛异常以保证流不中断）。
 */
export function nextVoiceState(state: VoiceState, event: VoiceEvent): VoiceTransition {
  if (event === 'cancel' || event === 'error') {
    return { state: 'idle', changed: state !== 'idle', illegal: false };
  }
  switch (event) {
    case 'listen_start':
      if (state === 'idle' || state === 'speaking') {
        return { state: 'listening', changed: true, illegal: false };
      }
      break;
    case 'llm_start':
      if (state === 'idle' || state === 'listening') {
        // 两个合法入口迁移后都是 thinking，必然发生变化
        return { state: 'thinking', changed: true, illegal: false };
      }
      break;
    case 'listen_end':
      if (state === 'listening') {
        return { state: 'thinking', changed: true, illegal: false };
      }
      break;
    case 'speech_start':
      if (state === 'thinking') {
        return { state: 'speaking', changed: true, illegal: false };
      }
      break;
    case 'speech_end':
      if (state === 'speaking') {
        return { state: 'idle', changed: true, illegal: false };
      }
      break;
  }
  return { state, changed: false, illegal: true };
}
