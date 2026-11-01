/** v2.17 联网搜索设置文案（settings.search 命名空间） */
export const zhSettingsSearch = {
  search: {
    title: '联网搜索',
    description: '为 Agent 提供网页搜索能力；仅在你开启并配置搜索服务后生效。',
    provider: '搜索服务',
    providerNone: '关闭',
    providerSearxng: 'SearXNG（自建）',
    endpoint: 'SearXNG 地址',
    endpointPlaceholder: '例如 http://127.0.0.1:8080',
    allowPrivate: '允许内网地址（仅自建 SearXNG）',
    maxResults: '每次结果数',
    save: '保存',
    saving: '保存中…',
    saved: '搜索设置已保存',
    test: '测试连接',
    testing: '测试中…',
    testFail: '搜索服务不可用：{message}',
    privacy: '查询会发送到你配置的搜索服务；本应用不代管 Key、不做云端代理，搜索查询不写入审计正文。',
  },
};

export const enSettingsSearch = {
  search: {
    title: 'Web search',
    description:
      'Give the Agent web search capability. It only takes effect after you enable and configure a search service.',
    provider: 'Search service',
    providerNone: 'Off',
    providerSearxng: 'SearXNG (self-hosted)',
    endpoint: 'SearXNG endpoint',
    endpointPlaceholder: 'e.g. http://127.0.0.1:8080',
    allowPrivate: 'Allow private network endpoint (self-hosted SearXNG only)',
    maxResults: 'Results per search',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Search settings saved',
    test: 'Test connection',
    testing: 'Testing…',
    testFail: 'Search service unavailable: {message}',
    privacy:
      'Queries are sent to the search service you configure. This app does not host keys or proxy searches, and query text is not written to the audit ledger.',
  },
};
