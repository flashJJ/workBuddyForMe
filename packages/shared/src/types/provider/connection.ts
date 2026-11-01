/** v2.17：供应商连接测试三态（failed 仍由既有 HTTP 错误层表达，成功响应区分前两态） */
export type ProviderConnectionStatus = 'verified' | 'reachable_unverified' | 'failed';

export interface ProviderConnectionCheck {
  step: 'models' | 'chat-probe' | 'protocol';
  ok: boolean;
  message?: string;
}

export interface ProviderConnectionResult {
  /** 兼容字段：status === 'verified' */
  ok: boolean;
  status: ProviderConnectionStatus;
  checks: ProviderConnectionCheck[];
  /** 首字探活使用的对话模型 */
  modelId?: string;
  /** 可达但无法验证 / 失败时的说明 */
  message?: string;
}
