/** v4.18：对话重命名/分享文案（从 chat.ts 拆出，保持单文件行数上限） */
export const zhChatDialogs = {
  rename: {
    title: '重命名对话',
    description: '给这个对话起一个更容易识别的标题。',
    titleLabel: '对话标题',
    titlePlaceholder: '输入新的对话标题',
  },
  share: {
    title: '分享对话',
    description: '选择导出格式。导出内容已自动脱敏 API Key、访问令牌与本地路径。',
    markdownHint: '.md，适合粘贴到文档 / GitHub',
    htmlLabel: 'HTML 网页',
    htmlHint: '.html 单文件，浏览器直接打开',
    generating: '生成中…',
  },
};

export const enChatDialogs = {
  rename: {
    title: 'Rename conversation',
    description: 'Give this conversation a more recognizable title.',
    titleLabel: 'Conversation title',
    titlePlaceholder: 'Enter a new conversation title',
  },
  share: {
    title: 'Share conversation',
    description:
      'Choose an export format. Exports are automatically sanitized of API keys, access tokens and local paths.',
    markdownHint: '.md, ideal for pasting into docs / GitHub',
    htmlLabel: 'HTML page',
    htmlHint: '.html single file, opens directly in a browser',
    generating: 'Generating…',
  },
};
