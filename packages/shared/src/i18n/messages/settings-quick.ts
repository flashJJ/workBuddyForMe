/** v4.17：设置中心常用入口（独立命名空间，避免 settings 主文件继续膨胀） */
export const zhSettingsQuick = {
  title: '常用',
  providers: '模型与供应商',
  voice: '语音与对话',
  mcp: 'MCP 能力',
  appearance: '外观与主题',
  data: '数据与备份',
};

export const enSettingsQuick: typeof zhSettingsQuick = {
  title: 'Quick access',
  providers: 'Models & providers',
  voice: 'Voice & chat',
  mcp: 'MCP capabilities',
  appearance: 'Appearance',
  data: 'Data & backup',
};
