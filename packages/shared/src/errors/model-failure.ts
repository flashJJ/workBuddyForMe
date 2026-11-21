/**
 * v4.18 A 线：模型失败分类契约（唯一事实源）。
 *
 * 只回答「这一轮为什么失败、能否自动切换」，不携带供应商原始报文。
 * 上游 status 与 providerMessage 仅用于日志与诊断，UI 只消费 code。
 */

export const MODEL_FAILURE_CODES = [
  'auth_failed',
  'rate_limited',
  'timeout',
  'stream_interrupted',
  'context_overflow',
  'provider_5xx',
  'unknown',
] as const;

export type ModelFailureCode = (typeof MODEL_FAILURE_CODES)[number];

/** 首字前是否允许切换到备用模型；首字后一律不自动切换 */
export const MODEL_FAILURE_AUTO_SWITCH: Record<ModelFailureCode, boolean> = {
  auth_failed: false,
  rate_limited: true,
  timeout: true,
  stream_interrupted: true,
  context_overflow: false,
  provider_5xx: true,
  unknown: false,
};

/** 单轮最多自动切换次数（目标为助手配置的唯一备用模型） */
export const MAX_MODEL_SWITCH_ATTEMPTS = 2;

export type ModelFailurePhase = 'before_first_token' | 'after_first_token';

export interface ModelFailure {
  code: ModelFailureCode;
  phase: ModelFailurePhase;
  /** 上游 HTTP 状态；超时/断流可为空 */
  status?: number;
  /** 是否值得重试（自动切换或手动重试）；认证失败与上下文超限为 false */
  retriable: boolean;
}

/** 写入会话事件的切换记录；不记录任何正文 */
export interface ModelSwitchEvent {
  fromModelId: string;
  toModelId: string;
  reason: ModelFailureCode;
  /** 1 起，最大 MAX_MODEL_SWITCH_ATTEMPTS */
  attempt: number;
}

export function isModelFailureCode(value: unknown): value is ModelFailureCode {
  return (
    typeof value === 'string' && (MODEL_FAILURE_CODES as readonly string[]).includes(value)
  );
}

/** 首字后的断流即使错误码可切换，也必须停在手动动作，避免重复输出 */
export function canAutoSwitchModel(failure: Pick<ModelFailure, 'code' | 'phase'>): boolean {
  return failure.phase === 'before_first_token' && MODEL_FAILURE_AUTO_SWITCH[failure.code];
}
