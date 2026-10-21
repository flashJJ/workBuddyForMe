/**
 * runs 命名空间（v2.4 M4 / P1-1）：
 * task / agent-run / flow-run 共用的统一状态标签、耗时与失败归因文案。
 * 「为什么失败 + 你能做什么」按 FailureReason 分类，原始错误保留在折叠区。
 */
export const zhRuns = {
  outcome: {
    queued: '排队中',
    running: '运行中',
    waiting: '等待中',
    succeeded: '已完成',
    failed: '已失败',
    cancelled: '已取消',
    interrupted: '已中断',
    budget_exceeded: '已达限额',
  },
  duration: '耗时',
  durationHint: '从开始执行到结束（运行中按至今计算）',
  durationUnavailable: '—',
  hint: {
    title: '为什么失败：{reason}',
    next: '下一步：{action}',
    raw: '原始错误',
  },
  failure: {
    cancelled: {
      why: '本次运行已被取消。',
      next: '需要结果时重新发起一次运行。',
    },
    max_steps: {
      why: '已达到步数上限，任务没有在限定步数内完成。',
      next: '调高步数上限，或把目标拆成更小的任务。',
    },
    max_failures: {
      why: '连续失败次数达到上限，运行被终止。',
      next: '检查最近失败步骤的工具与参数，修复后重新运行。',
    },
    budget_exceeded: {
      why: '轮次、步数或 token 预算已耗尽。',
      next: '调高预算或简化目标，再重新发起。',
    },
    breaker: {
      why: '目标工具已熔断，运行被终止。',
      next: '到工具调试检查该工具的健康状态，恢复后再试。',
    },
    interrupted: {
      why: '应用重启或进程退出，运行被中断。',
      next: '用相同入参重跑；工作流可从失败节点重放。',
    },
    rejected: {
      why: '协作审查驳回，运行按设计终止。',
      next: '查看审查卡意见，调整目标或验收标准后重新发起。',
    },
    permission: {
      why: '工具调用未获授权或被拒绝。',
      next: '重新发起并在授权弹窗中允许该工具，或为助手开启相应权限。',
    },
    auth: {
      why: '模型或服务的鉴权失败（API Key 无效或缺失）。',
      next: '到设置 → 模型供应商检查密钥与地址，保存后重试。',
    },
    rate_limit: {
      why: '模型供应商限流或额度不足。',
      next: '稍后重试、降低并发，或切换其他供应商与模型。',
    },
    timeout: {
      why: '请求超时，模型或工具没有在时限内返回。',
      next: '重试；若持续超时，缩短上下文或换更快的模型。',
    },
    network: {
      why: '网络连接失败，无法访问模型或本地服务。',
      next: '检查网络、代理与本地服务状态，恢复后重试。',
    },
    model: {
      why: '模型或供应商返回错误。',
      next: '到模型设置检查模型名并做连接测试，必要时切换模型。',
    },
    tool: {
      why: '工具执行失败。',
      next: '检查工具参数与所需环境（浏览器/文件权限），修正后重试。',
    },
    node: {
      why: '工作流节点执行失败。',
      next: '查看该节点的输入与日志，修复后从失败节点重放。',
    },
    unknown: {
      why: '运行因未识别的错误终止。',
      next: '展开原始错误排查；仍无法定位时重跑一次并反馈日志。',
    },
  },
};

export const enRuns = {
  outcome: {
    queued: 'Queued',
    running: 'Running',
    waiting: 'Waiting',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
    interrupted: 'Interrupted',
    budget_exceeded: 'Limit reached',
  },
  duration: 'Duration',
  durationHint: 'From execution start to finish (live runs count up to now)',
  durationUnavailable: '—',
  hint: {
    title: 'Why it failed: {reason}',
    next: 'Next step: {action}',
    raw: 'Raw error',
  },
  failure: {
    cancelled: {
      why: 'This run was cancelled.',
      next: 'Start a new run when you need the result.',
    },
    max_steps: {
      why: 'The step limit was reached before the task finished.',
      next: 'Raise the step limit or split the goal into smaller tasks.',
    },
    max_failures: {
      why: 'Too many consecutive failures terminated the run.',
      next: 'Inspect the failing step’s tool and arguments, fix them, then rerun.',
    },
    budget_exceeded: {
      why: 'The round, step or token budget was exhausted.',
      next: 'Raise the budget or simplify the goal, then start again.',
    },
    breaker: {
      why: 'The target tool is circuit-broken, so the run was stopped.',
      next: 'Check the tool health in tool debugging and retry once recovered.',
    },
    interrupted: {
      why: 'The app restarted or the process exited, interrupting the run.',
      next: 'Rerun with the same inputs; workflows can replay from the failed node.',
    },
    rejected: {
      why: 'The collaboration review rejected the result, so the run ended by design.',
      next: 'Read the review notes, adjust the goal or acceptance criteria, then start again.',
    },
    permission: {
      why: 'A tool call was not authorized or was denied.',
      next: 'Start again and allow the tool in the approval prompt, or enable the permission for the assistant.',
    },
    auth: {
      why: 'Model or service authentication failed (invalid or missing API key).',
      next: 'Check the key and base URL under Settings → Model providers, then retry.',
    },
    rate_limit: {
      why: 'The model provider rate-limited the request or the quota is exhausted.',
      next: 'Retry later, lower concurrency, or switch provider/model.',
    },
    timeout: {
      why: 'The request timed out before the model or tool returned.',
      next: 'Retry; if it persists, shorten the context or use a faster model.',
    },
    network: {
      why: 'Network connection failed, so the model or local service was unreachable.',
      next: 'Check the network, proxy and local service status, then retry.',
    },
    model: {
      why: 'The model or provider returned an error.',
      next: 'Check the model name and run a connection test in model settings; switch models if needed.',
    },
    tool: {
      why: 'Tool execution failed.',
      next: 'Check the tool arguments and required environment (browser/file permissions), then retry.',
    },
    node: {
      why: 'A workflow node failed.',
      next: 'Inspect the node inputs and logs, fix it, then replay from the failed node.',
    },
    unknown: {
      why: 'The run ended with an unrecognized error.',
      next: 'Expand the raw error to investigate; if unclear, rerun once and share the logs.',
    },
  },
};
