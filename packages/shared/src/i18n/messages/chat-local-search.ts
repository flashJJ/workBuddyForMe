/** v4.16：本地搜索启动询问的文案（从 chat.ts 拆出以守住 300 行门禁） */
export type ChatLocalSearchStartMessages = {
  title: string;
  description: string;
  queryLabel: string;
  confirm: string;
  confirmWeb: string;
  cancel: string;
  starting: string;
  webHint: string;
};

export const zhLocalSearchStart: ChatLocalSearchStartMessages = {
  title: '本地搜索服务未运行',
  description: '联网搜索需要本机 SearXNG（{endpoint}）。是否现在一键启动？启动成功后会自动继续本次搜索。',
  queryLabel: '搜索词',
  confirm: '一键启动并继续',
  confirmWeb: '我已启动，继续搜索',
  cancel: '取消',
  starting: '正在启动…',
  webHint: '当前为浏览器模式，无法自动启动 Docker；请到设置 → 工具与权限 → 联网搜索启动后再继续。',
};

export const enLocalSearchStart: ChatLocalSearchStartMessages = {
  title: 'Local search service is not running',
  description:
    'Web search needs the local SearXNG instance ({endpoint}). Start it now? The current search will continue automatically afterwards.',
  queryLabel: 'Query',
  confirm: 'Start and continue',
  confirmWeb: 'I started it, continue',
  cancel: 'Cancel',
  starting: 'Starting…',
  webHint:
    'Browser mode cannot start Docker automatically. Start SearXNG in Settings → Tools & Permissions → Web Search, then continue.',
};
