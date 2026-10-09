/** commandPalette 命名空间：命令面板与内置命令 */
export const zhCommandPalette = {
  title: '命令面板',
  placeholder: '输入命令名称…（↑↓ 选择，Enter 执行，Esc 关闭）',
  searchLabel: '搜索并执行命令',
  listLabel: '命令列表',
  empty: '没有匹配「{query}」的命令',
  groups: {
    navigation: '导航',
    conversation: '会话',
    assistant: '助手',
    settings: '设置',
    update: '更新',
  },
  commands: {
    navChat: { label: '前往对话', description: '进入对话页面' },
    navKnowledge: { label: '前往知识库', description: '管理文档与 RAG' },
    navAssistants: { label: '前往助手', description: '智能体与提示词预设' },
    navSettings: { label: '前往设置', description: '供应商、模型与偏好' },
    convNew: {
      label: '新建会话',
      description: '在当前助手下创建新对话',
      disabled: '暂无可用助手',
    },
    convSearch: { label: '搜索会话', description: '按标题查找历史对话' },
    convExport: { label: '导出当前会话', description: '导出为 Markdown / HTML 快照' },
    convExportHint: '请在对话页点击右上角「分享」按钮导出',
    asstSwitch: { label: '切换助手', description: '选择不同的智能体' },
    setProviders: { label: '管理模型供应商', description: '新增 / 编辑 API 供应商' },
    setTheme: { label: '切换主题', description: '深色 / 浅色模式' },
    updCheck: { label: '检查更新', description: '查看是否有新版本可用' },
  },
};

export const enCommandPalette = {
  title: 'Command palette',
  placeholder: 'Type a command… (↑↓ to move, Enter to run, Esc to close)',
  searchLabel: 'Search and run a command',
  listLabel: 'Commands',
  empty: 'No commands match “{query}”',
  groups: {
    navigation: 'Navigation',
    conversation: 'Conversation',
    assistant: 'Assistant',
    settings: 'Settings',
    update: 'Update',
  },
  commands: {
    navChat: { label: 'Go to Chat', description: 'Open the chat page' },
    navKnowledge: { label: 'Go to Knowledge', description: 'Manage documents and RAG' },
    navAssistants: { label: 'Go to Assistants', description: 'Agents and prompt presets' },
    navSettings: { label: 'Go to Settings', description: 'Providers, models and preferences' },
    convNew: {
      label: 'New conversation',
      description: 'Start a new conversation with the current assistant',
      disabled: 'No assistant available',
    },
    convSearch: { label: 'Search conversations', description: 'Find past chats by title' },
    convExport: {
      label: 'Export current conversation',
      description: 'Export as a Markdown / HTML snapshot',
    },
    convExportHint: 'Use the “Share” button in the top-right of the chat page to export.',
    asstSwitch: { label: 'Switch assistant', description: 'Choose a different agent' },
    setProviders: { label: 'Manage model providers', description: 'Add / edit API providers' },
    setTheme: { label: 'Toggle theme', description: 'Switch between dark and light mode' },
    updCheck: { label: 'Check for updates', description: 'See whether a new version is available' },
  },
};
