/**
 * chatMessages 命名空间：消息列表空态、消息项操作栏/状态徽标/错误重试、赞踩反馈。
 * 从 chat.ts 拆出以保持单文件 ≤250 行；仅框架文案，模型正文不在此列。
 */
export const zhChatMessages = {
  /** 用户消息的头像与名称（助手侧取助手名，AI 字样保持静态） */
  you: '我',
  stopped: '已停止',
  unknownError: '未知错误',
  generateFailed: '生成失败：{reason}',
  copied: '已复制',
  regenerate: '重新生成',
  /** v2.23：滚离底部时的回到底部浮标 */
  backToBottom: '回到底部',
  /** v2.23：助手消息底部展示本轮 token 用量 */
  turnTokens: '本轮 {count} tokens',
  turnTokensDetail: '输入 {prompt} · 输出 {completion} · 合计 {total} tokens',
  /** v2.28：实时约束已记住提示与撤销 */
  memoryNoticePrefix: '已记住：',
  memoryNoticeUndo: '撤销',
  memoryNoticeUndone: '已撤销',
  memoryNoticeFailed: '撤销失败',
  /** v2.27：回合运行摘要（工具/引用/耗时），仅有工具或引用时展示 */
  turnSummaryTools: '工具 {count} 次（成功 {ok} / 失败 {failed}）',
  turnSummaryDuration: '工具耗时 {duration}',
  turnSummaryCitations: '引用 {count} 条',
  turnSummarySourceKnowledge: '知识库',
  turnSummarySourceWeb: '网页',
  turnSummaryTokens: '输入 {prompt} / 输出 {completion} token',
  turnSummaryToolsDetail: '逐工具耗时',
  resend: '重新发送',
  editAndResend: '编辑并重发',
  citations: '引用来源',
  /** v1.5：引用超过折叠阈值时标题条（默认折叠，不挤占正文）；v2.27 追加文档/网页分组计数 */
  citationsCollapsed: '引用来源 · {count} 条（文档 {doc} / 网页 {web}）',
  citationsExpand: '展开',
  citationsCollapse: '收起',
  /** v2.27：来源卡按文档/网页分组标题 */
  citationGroupDocuments: '文档来源 · {count}',
  citationGroupWeb: '网页来源 · {count}',
  /** v2.27：正文行内角标与不可用降级提示 */
  citationRef: '查看来源 {index}',
  citationUnavailable: '引用不可用',
  feedback: {
    helpful: '有帮助',
    notHelpful: '没帮助',
  },
  list: {
    emptyTitle: '开始新对话',
    emptyDescription: '发送第一条消息，助手会在这里回应你。',
    generatingReply: '正在生成回复…',
    promptsLabel: '试试这样问',
    promptPlan: '帮我把一个想法拆成三步可执行的计划',
    promptSummary: '总结这次对话，并列出接下来的待办',
    promptSources: '检索知识库后给出带引用的回答',
  },
  image: {
    unavailable: '图片不可用',
    loading: '图片加载中',
    viewLarge: '查看大图',
    alt: '聊天图片',
    previewTitle: '图片预览',
    altLarge: '聊天图片大图',
  },
};

export const enChatMessages = {
  you: 'You',
  stopped: 'Stopped',
  unknownError: 'Unknown error',
  generateFailed: 'Generation failed: {reason}',
  copied: 'Copied',
  regenerate: 'Regenerate',
  /** v2.23: back-to-bottom pill shown when scrolled away from the end */
  backToBottom: 'Back to bottom',
  /** v2.23: per-turn token usage under assistant messages */
  turnTokens: 'This turn: {count} tokens',
  turnTokensDetail: 'Prompt {prompt} · Completion {completion} · Total {total} tokens',
  /** v2.28：constraint notice + undo */
  memoryNoticePrefix: 'Remembered: ',
  memoryNoticeUndo: 'Undo',
  memoryNoticeUndone: 'Undone',
  memoryNoticeFailed: 'Failed to undo',
  turnSummaryTools: 'Tools {count} (ok {ok} / failed {failed})',
  turnSummaryDuration: 'Tool time {duration}',
  turnSummaryCitations: '{count} citations',
  turnSummarySourceKnowledge: 'knowledge base',
  turnSummarySourceWeb: 'web',
  turnSummaryTokens: 'Prompt {prompt} / completion {completion} tokens',
  turnSummaryToolsDetail: 'Per-tool time',
  resend: 'Send again',
  editAndResend: 'Edit and resend',
  citations: 'Sources',
  citationsCollapsed: 'Sources · {count} (docs {doc} / web {web})',
  citationsExpand: 'Show',
  citationsCollapse: 'Hide',
  citationGroupDocuments: 'Documents · {count}',
  citationGroupWeb: 'Web · {count}',
  citationRef: 'View source {index}',
  citationUnavailable: 'Citation unavailable',
  feedback: {
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
  },
  list: {
    emptyTitle: 'Start a new conversation',
    emptyDescription: 'Send your first message and the assistant will reply here.',
    generatingReply: 'Generating a reply…',
    promptsLabel: 'Try asking',
    promptPlan: 'Turn an idea into a three-step executable plan',
    promptSummary: 'Summarize this chat and list the follow-ups',
    promptSources: 'Answer with citations from my knowledge base',
  },
  image: {
    unavailable: 'Image unavailable',
    loading: 'Loading image',
    viewLarge: 'View full image',
    alt: 'Chat image',
    previewTitle: 'Image preview',
    altLarge: 'Chat image (large)',
  },
};
