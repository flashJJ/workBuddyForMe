/** P8.6：话题源（清洗、白名单与百度热搜兜底），不依赖 core/DB，便于单测 */
export const MAX_TOPICS = 5;

/** 不给桌宠用的沉重/敏感话题 */
const BLOCKED_WORDS = [
  '死亡',
  '遇难',
  '遗体',
  '车祸',
  '事故',
  '火灾',
  '地震',
  '洪水',
  '台风灾害',
  '战争',
  '冲突',
  '枪击',
  '恐怖',
  '疫情',
  '确诊',
  '犯罪',
  '判刑',
  '自杀',
  '坠楼',
  '坍塌',
  '爆炸',
  '罢工',
  '抗议',
  '选举',
  '政治',
  '导弹',
  '军事',
];

/** 无搜索配置时的兜底新闻源（百度热搜，固定 URL、无用户输入） */
export type TopicNewsSource = () => Promise<Array<{ title: string }>>;

const BAIDU_HOT_URL = 'https://top.baidu.com/board?tab=realtime';

/** 只收生活/科技/文娱/天气等轻话题，政治与负面社会新闻一律跳过 */
const LIGHT_TOPIC_WORDS = [
  '电影',
  '电视剧',
  '综艺',
  '短剧',
  '演唱会',
  '音乐',
  '游戏',
  '赛事',
  '马拉松',
  '旅游',
  '研学',
  '美食',
  '餐厅',
  '咖啡',
  '茶',
  '天气',
  '雨',
  '雪',
  '降温',
  '升温',
  '假期',
  '秋假',
  '寒假',
  '暑假',
  '开学',
  '考试',
  '教育',
  '宠物',
  '熊猫',
  '动物',
  'AI',
  '人工智能',
  '机器人',
  '手机',
  '新机',
  '发布',
  '科技',
  '航天',
  '卫星',
  '汽车',
  '新能源',
  '比亚迪',
  '航班',
  '高铁',
  '列车',
  '快递',
  '外卖',
  '上班',
  '下班',
  '加班',
  '休息',
  '健康',
  '手术',
  '降价',
  '展览',
  '展会',
  '节日',
  '春节',
  '中秋',
  '国庆',
];

export function isLightTopic(title: string): boolean {
  return LIGHT_TOPIC_WORDS.some((word) => title.includes(word));
}

/** 标题清洗：去站点后缀/日期前缀/括号空白，过滤沉重话题 */
export function sanitizeTopic(title: string): string | null {
  const text = title
    .replace(/[【】[\]()（）「」『』]/g, '')
    .replace(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*/, '')
    .replace(/^\d{1,2}[./-]\d{1,2}\s*/, '')
    .replace(/\s*[-—_|]\s*[^-—_|]{1,16}$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);
  if (text.length < 4) return null;
  if (BLOCKED_WORDS.some((word) => text.includes(word))) return null;
  return text;
}

export function topicsFromResults(results: ReadonlyArray<{ title: string }>): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const result of results) {
    const topic = sanitizeTopic(result.title);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    items.push(topic);
    if (items.length >= MAX_TOPICS) break;
  }
  return items;
}

/** 从百度热搜页的 s-data JSON 里解析标题（导出便于单测，不发网络） */
export function parseBaiduHotTitles(html: string): Array<{ title: string }> {
  const start = html.indexOf('<!--s-data:');
  const end = start >= 0 ? html.indexOf('-->', start) : -1;
  if (start < 0 || end < 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(html.slice(start + '<!--s-data:'.length, end));
  } catch {
    return [];
  }
  const cards = (data as { data?: { cards?: unknown } })?.data?.cards;
  if (!Array.isArray(cards)) return [];
  const titles: Array<{ title: string }> = [];
  for (const card of cards) {
    const content = (card as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      const word =
        (item as { word?: unknown })?.word ?? (item as { query?: unknown })?.query;
      if (typeof word === 'string' && word.trim()) titles.push({ title: word.trim() });
    }
  }
  return titles;
}

export const fetchBaiduHot: TopicNewsSource = async () => {
  const response = await fetch(BAIDU_HOT_URL, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'accept-language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`百度热搜请求失败：${response.status}`);
  return parseBaiduHotTitles(await response.text()).filter((item) => isLightTopic(item.title));
};
