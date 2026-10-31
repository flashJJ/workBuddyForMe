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
  SERVICE_UNAVAILABLE: '治理服务暂不可用，操作已按安全策略拒绝，请检查审计账本后重试。',
  SKILL_VERSION_MISSING: '该技能版本快照不存在，无法回退。',
  SKILL_VERSION_ACTIVE: '当前启用版本不可删除，请先回退到其他版本。',
  SKILL_VERSION_LAST: '至少保留一个技能版本，无法删除最后一份快照。',
  SKILL_VERSION_DELETE_FAILED: '技能快照删除失败，请检查数据目录权限后重试。',
  SKILL_ROLLBACK_FAILED: '技能回退失败，已尝试恢复原目录。',
  FLOW_VERSION_NOT_FOUND: '该工作流版本不存在，无法设为生产。',
  CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED: '目标版本低于当前版本，请确认降级并指定目标版本。',
  CAPABILITY_DOWNGRADE_TARGET_MISMATCH: '降级确认的目标版本与能力包版本不一致。',
  CAPABILITY_DEPENDENTS_ACTIVE: '仍有启用的能力包依赖当前版本，请先处理依赖方。',
  CAPABILITY_VERSION_NOT_NEWER: '版本未变化且不满足修复条件（同版本内容一致时无需重装）。',
  DIAGNOSTICS_TIMEOUT: '诊断包生成超时，请稍后重试。',
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
  SERVICE_UNAVAILABLE:
    'The governance service is unavailable. The action was denied by fail-closed policy. Check the audit ledger and retry.',
  SKILL_VERSION_MISSING: 'That skill version snapshot does not exist, so it cannot be restored.',
  SKILL_VERSION_ACTIVE:
    'The active skill version cannot be deleted. Roll back to another version first.',
  SKILL_VERSION_LAST:
    'At least one skill version must remain; the last snapshot cannot be deleted.',
  SKILL_VERSION_DELETE_FAILED:
    'Failed to delete the skill snapshot. Check data directory permissions and retry.',
  SKILL_ROLLBACK_FAILED: 'Skill rollback failed; the original folder was restored if possible.',
  FLOW_VERSION_NOT_FOUND: 'That workflow version does not exist and cannot be set as production.',
  CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED:
    'The target version is lower than the installed one. Confirm the downgrade and specify the target version.',
  CAPABILITY_DOWNGRADE_TARGET_MISMATCH:
    'The confirmed downgrade target does not match the capability pack version.',
  CAPABILITY_DEPENDENTS_ACTIVE:
    'Enabled capability packs still depend on the current version. Handle the dependents first.',
  CAPABILITY_VERSION_NOT_NEWER:
    'The version is unchanged and the pack is not repairable (identical content needs no reinstall).',
  DIAGNOSTICS_TIMEOUT: 'Diagnostics generation timed out. Please try again later.',
  INTERNAL_ERROR: 'Internal server error. Please try again later.',
  NETWORK_ERROR: 'Network error. Check your connection and try again.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please try again later.',
  /** Appended to a localized main message when server detail is useful (leading space) */
  detailSuffix: ' ({detail})',
};
