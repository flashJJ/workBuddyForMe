/** settings 命名空间：设置中心页面 / 默认偏好 / 通用进行态；供应商见 settingsProviders，其余面板见 settingsMcp */
export const zhSettings = {
  title: '设置',
  description: '管理模型供应商、默认模型与本地偏好，所有数据仅保存在本机。',
  addProvider: '新增供应商',
  loadError: '供应商加载失败',
  saving: '保存中…',
  empty: {
    title: '还没有模型供应商',
    description: '新增一个 OpenAI 兼容服务，添加模型后即可开始对话。',
    action: '去新增',
  },
  defaults: {
    title: '默认偏好',
    chatModel: '默认对话模型',
    embeddingModel: '默认向量模型（知识库）',
    notSelected: '未选择',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    modelOptionLabel: '{displayName}（{modelId}）',
    dataDir: '本地数据目录',
    dataDirCopied: '数据目录已复制',
    settingsSaved: '设置已保存',
    hint: '助手可单独指定模型；未指定时使用上方默认对话模型。设置项即时保存。',
  },
};

export const enSettings = {
  title: 'Settings',
  description:
    'Manage model providers, default models and local preferences. All data stays on this device.',
  addProvider: 'Add provider',
  loadError: 'Failed to load providers',
  saving: 'Saving…',
  empty: {
    title: 'No model providers yet',
    description: 'Add an OpenAI-compatible service and configure a model to start chatting.',
    action: 'Add provider',
  },
  defaults: {
    title: 'Defaults',
    chatModel: 'Default chat model',
    embeddingModel: 'Default embedding model (knowledge base)',
    notSelected: 'Not selected',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'Match system',
    modelOptionLabel: '{displayName} ({modelId})',
    dataDir: 'Local data directory',
    dataDirCopied: 'Data directory copied',
    settingsSaved: 'Settings saved',
    hint: 'Assistants can override the model; otherwise the default chat model above is used. Changes save instantly.',
  },
};
