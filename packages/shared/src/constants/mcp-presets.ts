/** v2.3 开箱即用：常见 MCP 服务器预置目录（一键填入新增表单，仍需用户按需补参数） */
export interface McpPresetServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  /** 用途说明与参数提示（数据，展示在预置卡片上） */
  description: string;
}

export const MCP_PRESET_SERVERS: readonly McpPresetServer[] = [
  {
    id: 'filesystem',
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
    description: '读写本地指定目录（把最后一个参数改成你的目标目录）。授权为 read，高危写操作需确认。',
  },
  {
    id: 'fetch',
    name: 'fetch',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    description: '抓取并转换网页为 Markdown，便于做资料汇总与摘要。',
  },
  {
    id: 'git',
    name: 'git',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git', '--repository', 'D:/repo'],
    description: '读取本地 Git 仓库状态、日志与差异（把仓库路径改成你的项目目录）。',
  },
  {
    id: 'memory',
    name: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: '提供基于知识图谱的记忆存储，可让助手跨会话记住结构化事实。',
  },
];
