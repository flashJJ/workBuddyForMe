import type { FlowRunError, FlowRunFailureCategory } from '@wbfm/shared/types';

/**
 * v5.0 运行失败分类（纯函数）：
 * - 显式错误码优先，其次消息关键词，再按节点类型兜底；
 * - 仅 network / timeout / rate_limit 允许自动补偿；
 * - hint 为面向用户的一步建议（与现有错误文案一致，使用中文）。
 */

const HINTS: Record<FlowRunFailureCategory, string> = {
  config: '检查节点配置、必填参数与流程发布状态后重试。',
  auth: '检查模型/工具密钥或授权是否有效后重试。',
  network: '检查网络或代理连通性；稍后会自动重试。',
  timeout: '节点执行超时；可提高超时时间或稍后重试。',
  rate_limit: '请求过于频繁或额度不足；稍后会自动重试。',
  tool: '检查工具/MCP 服务是否可用，或改用其他节点。',
  data: '检查输入数据格式与编码，修正后重放。',
  version: '原运行版本不可用；请按新版本重放。',
  unknown: '查看节点错误详情；必要时从失败节点重放。',
};

const RETRYABLE: ReadonlySet<FlowRunFailureCategory> = new Set([
  'network',
  'timeout',
  'rate_limit',
]);

interface Rule {
  category: FlowRunFailureCategory;
  pattern: RegExp;
}

const CODE_RULES: Rule[] = [
  { category: 'auth', pattern: /auth|unauthor|forbidden|credential|api.?key|token|permission|401|403/ },
  { category: 'timeout', pattern: /timeout|timed.?out|etimedout|deadline/ },
  { category: 'rate_limit', pattern: /rate.?limit|too.?many|429|quota|budget/ },
  { category: 'network', pattern: /network|econn|enotfound|eai_again|socket|dns|offline|fetch/ },
  { category: 'version', pattern: /version|migration|schema.?version/ },
  { category: 'data', pattern: /parse|json|decode|encoding|format|corrupt/ },
  { category: 'tool', pattern: /tool|mcp|skill/ },
  { category: 'config', pattern: /config|validation|invalid|missing|required|not.?found|404|schema/ },
];

const NODE_TYPE_RULES: Array<{ category: FlowRunFailureCategory; types: ReadonlySet<string> }> = [
  { category: 'tool', types: new Set(['tool', 'agent', 'knowledge', 'retrieval', 'mcp']) },
  { category: 'config', types: new Set(['start', 'end', 'condition', 'branch']) },
];

function match(text: string): FlowRunFailureCategory | null {
  for (const rule of CODE_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return null;
}

export function classifyFlowRunError(
  error: FlowRunError,
  failedNode?: { nodeId: string; nodeType: string },
): FlowRunError {
  const codeText = (error.code ?? '').toLowerCase();
  const messageText = (error.message ?? '').toLowerCase();
  const byCode = match(codeText);
  const byMessage = byCode ?? match(messageText);
  const byNode = byMessage ?? nodeTypeCategory(failedNode?.nodeType);
  const category = byNode ?? 'unknown';

  return {
    ...error,
    category,
    retryable: RETRYABLE.has(category),
    hint: error.hint ?? HINTS[category],
  };
}

function nodeTypeCategory(nodeType?: string): FlowRunFailureCategory | null {
  if (!nodeType) return null;
  for (const rule of NODE_TYPE_RULES) {
    if (rule.types.has(nodeType)) return rule.category;
  }
  return null;
}
