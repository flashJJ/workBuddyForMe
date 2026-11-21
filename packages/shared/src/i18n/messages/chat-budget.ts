/** v4.18：会话 token 预算（从 chat.ts 拆出，保持单文件行数上限） */
export const zhChatBudget = {
  action: '会话预算',
  title: '会话 token 预算',
  description: '超过预算后阻止继续发送；留空表示不限制。达到 80% 时会提示。',
  label: '预算上限（tokens）',
  placeholder: '例如 100000；留空=不限制',
  invalid: '请输入 1000–100000000 之间的整数，或留空',
  saveFailed: '保存预算失败，请稍后重试',
  warning: '会话预算已使用 {ratio}（{used}/{limit} tokens）',
  warningAction: '调整预算',
  dismiss: '知道了',
};

export const enChatBudget = {
  action: 'Token budget',
  title: 'Conversation token budget',
  description:
    'Sending is blocked once the budget is used up; leave empty for no limit. A warning appears at 80%.',
  label: 'Budget limit (tokens)',
  placeholder: 'e.g. 100000; empty = no limit',
  invalid: 'Enter an integer between 1000 and 100000000, or leave empty',
  saveFailed: 'Failed to save the budget. Please try again.',
  warning: 'Conversation budget used: {ratio} ({used}/{limit} tokens)',
  warningAction: 'Adjust budget',
  dismiss: 'Dismiss',
};
