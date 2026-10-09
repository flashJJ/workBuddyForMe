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
  resend: '重新发送',
  editAndResend: '编辑并重发',
  citations: '引用来源',
  feedback: {
    helpful: '有帮助',
    notHelpful: '没帮助',
  },
  list: {
    emptyTitle: '开始新对话',
    emptyDescription: '发送第一条消息，助手会在这里回应你。',
    generatingReply: '正在生成回复…',
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
  resend: 'Send again',
  editAndResend: 'Edit and resend',
  citations: 'Sources',
  feedback: {
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
  },
  list: {
    emptyTitle: 'Start a new conversation',
    emptyDescription: 'Send your first message and the assistant will reply here.',
    generatingReply: 'Generating a reply…',
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
