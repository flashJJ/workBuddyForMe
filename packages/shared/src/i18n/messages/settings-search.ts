/** v2.17 联网搜索设置文案（settings.search 命名空间） */
export const zhSettingsSearch = {
  search: {
    title: '联网搜索',
    description: '为 Agent 提供网页搜索能力；仅在你开启并配置搜索服务后生效。',
    provider: '搜索服务',
    providerNone: '关闭',
    providerSearxng: 'SearXNG（自建 / 公共实例）',
    endpoint: 'SearXNG 地址',
    endpointPlaceholder: '例如 http://127.0.0.1:8080',
    publicPreset: '公共实例',
    publicPresetCustom: '自定义 / 手动填写',
    publicPresetHint: '公共实例由第三方维护，可能关闭 JSON 输出；测试失败请换一个，或用下方一键部署。',
    deployTitle: '本机一键部署（Docker）',
    deployHint: '自动拉起 SearXNG 容器并开启 JSON 输出；需要已安装并启动 Docker Desktop。',
    deploy: '一键部署',
    deploying: '部署中…（首次会拉取镜像）',
    deployOk: '部署完成：{endpoint}，已自动保存并测试',
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
    providerSearxng: 'SearXNG (self-hosted / public)',
    endpoint: 'SearXNG endpoint',
    endpointPlaceholder: 'e.g. http://127.0.0.1:8080',
    publicPreset: 'Public instance',
    publicPresetCustom: 'Custom / enter manually',
    publicPresetHint:
      'Public instances are run by third parties and may disable JSON output. If the test fails, try another one or use one-click deploy below.',
    deployTitle: 'One-click deploy (Docker)',
    deployHint:
      'Starts a local SearXNG container with JSON enabled. Requires Docker Desktop installed and running.',
    deploy: 'Deploy',
    deploying: 'Deploying… (first run pulls the image)',
    deployOk: 'Deployed at {endpoint}; settings saved and tested',
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
