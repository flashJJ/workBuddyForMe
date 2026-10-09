/** errors 命名空间：错误码 → 用户可见文案（服务端 message 仅日志，前端按 code 呈现） */
export const zhErrors = {
  VALIDATION_ERROR: '提交的数据校验失败，请检查输入内容。',
  UNAUTHORIZED: '未授权或密钥无效，请检查 API Key。',
  FORBIDDEN: '没有权限执行此操作。',
  NOT_FOUND: '请求的资源不存在或已被删除。',
  CONFLICT: '资源冲突，内容可能已被修改，请刷新后重试。',
  EMBEDDING_NOT_CONFIGURED: '尚未配置嵌入模型，请先在设置中添加。',
  UNSUPPORTED_PROVIDER: '当前供应商不支持该操作。',
  PROVIDER_ERROR: '模型服务返回错误，请检查供应商配置或稍后重试。',
  PROVIDER_TIMEOUT: '模型服务响应超时，请稍后重试。',
  INTERNAL_ERROR: '服务内部错误，请稍后重试。',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试。',
  UNKNOWN_ERROR: '发生未知错误，请稍后重试。',
  /** 本地化主文案后附加服务端细节（全角括号，无空格） */
  detailSuffix: '（{detail}）',
};

export const enErrors = {
  VALIDATION_ERROR: 'Validation failed. Please check your input.',
  UNAUTHORIZED: 'Unauthorized or invalid API key.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource does not exist or was deleted.',
  CONFLICT: 'Conflict: the resource may have changed. Refresh and try again.',
  EMBEDDING_NOT_CONFIGURED: 'No embedding model configured. Add one in Settings first.',
  UNSUPPORTED_PROVIDER: 'This provider does not support that action.',
  PROVIDER_ERROR:
    'The model service returned an error. Check your provider settings or try again later.',
  PROVIDER_TIMEOUT: 'The model service timed out. Please try again later.',
  INTERNAL_ERROR: 'Internal server error. Please try again later.',
  NETWORK_ERROR: 'Network error. Check your connection and try again.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please try again later.',
  /** Appended to a localized main message when server detail is useful (leading space) */
  detailSuffix: ' ({detail})',
};
