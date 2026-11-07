/**
 * v2.24：MCP 能力目录（推荐 / 可选 / 需凭证三档）。
 *
 * 与旧版「预置服务器」的区别：
 * - 显式声明运行依赖（Node / uv / Chrome）与最低 Node 主版本，安装前可预检；
 * - 参数用 {{token}} 占位，安装时由用户填目录或密钥，不再写死 D:/docs；
 * - 远程服务器走 http + headers，stdio 服务器兼容 Windows 的 npx.cmd 包装。
 */
export const MCP_CATALOG_TIERS = ['recommended', 'optional', 'credential'] as const;
export type McpCatalogTier = (typeof MCP_CATALOG_TIERS)[number];

export const MCP_CATALOG_REQUIREMENTS = ['node', 'uv', 'chrome'] as const;
export type McpCatalogRequirement = (typeof MCP_CATALOG_REQUIREMENTS)[number];

/** 安装时需要用户补的字段；安装器把 token 替换进 args / env / headers */
export interface McpCatalogField {
  token: string;
  label: string;
  placeholder: string;
  kind: 'directory' | 'text' | 'secret';
  required: boolean;
}

export interface McpCatalogEntry {
  id: string;
  /** 服务器命名空间（工具前缀 mcp:<name>:<tool>） */
  name: string;
  title: string;
  description: string;
  tier: McpCatalogTier;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  fields?: McpCatalogField[];
  /** v2.24：远程 OAuth 服务器（无静态 Headers，安装后走授权流程） */
  auth?: 'oauth';
  requires: readonly McpCatalogRequirement[];
  /** 运行 npx / uvx 所需的最低 Node 主版本（仅提示，由服务端预检） */
  nodeMinMajor?: number;
  docsUrl: string;
  license: string;
  note?: string;
}

const NODE_24 = 24;

/**
 * 精选目录。
 * 只收录官方仓库或维护方明确支持、Windows 可用、安装方式清晰的服务器；
 * 官方已归档的参考实现（fetch / time / puppeteer / sqlite / brave-search / github 旧仓库）不收录。
 */
export const MCP_CATALOG: readonly McpCatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'filesystem',
    title: '本地文件',
    description: '在指定目录内列目录、读文件、搜索与写入；适合让助手阅读本地资料。',
    tier: 'recommended',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '{{dir}}'],
    fields: [
      { token: '{{dir}}', label: '允许访问的目录', placeholder: '例如 D:/docs', kind: 'directory', required: true },
    ],
    requires: ['node'],
    nodeMinMajor: NODE_24,
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    license: 'MIT',
    note: '官方参考实现，工具权限按读/写分级；建议只指向一个工作目录。',
  },
  {
    id: 'memory',
    name: 'memory',
    title: '结构化记忆',
    description: '基于知识图谱的跨会话记忆，适合保存稳定的偏好、人物与项目事实。',
    tier: 'recommended',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    requires: ['node'],
    nodeMinMajor: NODE_24,
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    license: 'MIT',
    note: '零参数；默认记忆文件在 npx 缓存内，清理缓存会丢失，可用 MEMORY_FILE_PATH 指向固定文件。',
  },
  {
    id: 'sequential-thinking',
    name: 'sequential-thinking',
    title: '分步思考',
    description: '把复杂问题拆成可回退的思考步骤，适合规划、排查与多约束决策。',
    tier: 'recommended',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    requires: ['node'],
    nodeMinMajor: NODE_24,
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    license: 'MIT',
    note: '零参数；会增加一次工具调用的上下文开销。',
  },
  {
    id: 'everything',
    name: 'everything',
    title: 'MCP 自检',
    description: '官方示例服务器，覆盖工具、资源、提示词与采样；用来验证 MCP 链路是否正常。',
    tier: 'optional',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    requires: ['node'],
    nodeMinMajor: NODE_24,
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
    license: 'MIT',
    note: '仅用于自检；不要在日常助手里常开。',
  },
  {
    id: 'context7',
    name: 'context7',
    title: '库文档检索',
    description: '按库名与版本拉取最新官方文档，回答编程问题时减少过时 API。',
    tier: 'optional',
    transport: 'http',
    url: 'https://mcp.context7.com/mcp',
    requires: [],
    docsUrl: 'https://github.com/upstash/context7',
    license: 'MIT',
    note: '远程服务，无需本机 Node；未配置 API Key 时可能限流。',
  },
  {
    id: 'chrome-devtools',
    name: 'chrome-devtools',
    title: 'Chrome 调试',
    description: '控制并检查本机 Chrome：页面快照、网络请求、控制台与性能轨迹。',
    tier: 'optional',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--no-usage-statistics'],
    requires: ['node', 'chrome'],
    nodeMinMajor: 20,
    docsUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    license: 'Apache-2.0',
    note: '需要本机安装 Chrome；仅支持 Chrome / Chrome for Testing。',
  },
  {
    id: 'playwright',
    name: 'playwright',
    title: '浏览器自动化',
    description: '用可访问性树驱动浏览器，做网页操作、表单填写与回归验证。',
    tier: 'optional',
    transport: 'stdio',
    command: 'npx',
    args: ['@playwright/mcp@latest'],
    requires: ['node'],
    nodeMinMajor: 18,
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    license: 'Apache-2.0',
    note: '首次运行可能需要下载浏览器，体积较大；与 Chrome 调试二选一即可。',
  },
  {
    id: 'git',
    name: 'git',
    title: 'Git 仓库',
    description: '读取本地仓库状态、提交历史、差异与文件内容。',
    tier: 'optional',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-git', '--repository', '{{dir}}'],
    fields: [
      { token: '{{dir}}', label: '仓库目录', placeholder: '例如 D:/repo', kind: 'directory', required: true },
    ],
    requires: ['uv'],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    license: 'MIT',
    note: '官方 Python 实现，需安装 uv；只建议开发者启用。',
  },
  {
    id: 'markitdown',
    name: 'markitdown',
    title: '文档转 Markdown',
    description: '把 PDF、Word、Excel、PPT 等文档转成 Markdown，便于总结与检索。',
    tier: 'optional',
    transport: 'stdio',
    command: 'uvx',
    args: ['markitdown-mcp'],
    requires: ['uv'],
    docsUrl: 'https://github.com/microsoft/markitdown/tree/main/packages/markitdown-mcp',
    license: 'MIT',
    note: '当前为 alpha 版本，复杂版式可能丢失；需安装 uv。',
  },
  {
    id: 'tavily',
    name: 'tavily',
    title: 'Tavily 搜索',
    description: '面向 Agent 的搜索与正文抽取，适合做资料研究与事实核对。',
    tier: 'credential',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tavily-mcp@latest'],
    env: { TAVILY_API_KEY: '{{key}}' },
    fields: [
      { token: '{{key}}', label: 'Tavily API Key', placeholder: 'tvly-...', kind: 'secret', required: true },
    ],
    requires: ['node'],
    nodeMinMajor: 20,
    docsUrl: 'https://docs.tavily.com/documentation/mcp',
    license: 'MIT',
    note: '需要 Tavily 账号与 API Key；免费额度足够日常试用。',
  },
  {
    id: 'brave-search',
    name: 'brave-search',
    title: 'Brave 搜索',
    description: 'Brave 官方搜索 API，返回网页、新闻与本地结果。',
    tier: 'credential',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server', '--transport', 'stdio'],
    env: { BRAVE_API_KEY: '{{key}}' },
    fields: [
      { token: '{{key}}', label: 'Brave Search API Key', placeholder: 'BSA...', kind: 'secret', required: true },
    ],
    requires: ['node'],
    nodeMinMajor: 20,
    docsUrl: 'https://github.com/brave/brave-search-mcp-server',
    license: 'MIT',
    note: '需要 Brave Search API 订阅；免费档有速率限制。',
  },
  {
    id: 'firecrawl',
    name: 'firecrawl',
    title: 'Firecrawl 抓取',
    description: '把网页抓成干净 Markdown，支持站点爬取与结构化抽取。',
    tier: 'credential',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    env: { FIRECRAWL_API_KEY: '{{key}}' },
    fields: [
      { token: '{{key}}', label: 'Firecrawl API Key', placeholder: 'fc-...', kind: 'secret', required: true },
    ],
    requires: ['node'],
    nodeMinMajor: 22,
    docsUrl: 'https://github.com/firecrawl/firecrawl-mcp-server',
    license: 'MIT',
    note: '需要 Firecrawl 账号；抓取消耗额度。',
  },
  {
    id: 'notion',
    name: 'notion',
    title: 'Notion 工作区',
    description: '搜索、读取与编辑 Notion 页面和数据库；通过 OAuth 授权访问工作区。',
    tier: 'credential',
    transport: 'http',
    url: 'https://mcp.notion.com/mcp',
    auth: 'oauth',
    requires: [],
    docsUrl: 'https://developers.notion.com/guides/mcp/build-mcp-client',
    license: 'Proprietary',
    note: '官方托管服务，安装后点「授权」在浏览器完成 OAuth；令牌加密保存在本机。',
  },
  {
    id: 'github',
    name: 'github',
    title: 'GitHub 远程',
    description: '读取仓库、Issue、PR 与 Actions 结果，适合开发协作场景。',
    tier: 'credential',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { Authorization: 'Bearer {{key}}' },
    fields: [
      { token: '{{key}}', label: 'GitHub Personal Access Token', placeholder: 'ghp_... / github_pat_...', kind: 'secret', required: true },
    ],
    requires: [],
    docsUrl: 'https://github.com/github/github-mcp-server',
    license: 'MIT',
    note: '使用远程服务器与 PAT，不需要本机 Node；令牌保存在本机 MCP 配置中。',
  },
];

/** 按档位筛选（推荐档优先展示） */
export function catalogByTier(tier: McpCatalogTier): McpCatalogEntry[] {
  return MCP_CATALOG.filter((entry) => entry.tier === tier);
}

/** 目录项是否必填字段齐全 */
export function missingCatalogFields(entry: McpCatalogEntry, values: Record<string, string>): string[] {
  return (entry.fields ?? [])
    .filter((field) => field.required && !(values[field.token] ?? '').trim())
    .map((field) => field.label);
}
