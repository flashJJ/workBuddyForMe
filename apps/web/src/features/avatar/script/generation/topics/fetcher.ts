import { localDateKey } from '../state';
import { fetchBaiduHot, topicsFromResults, type TopicNewsSource } from './source';

/**
 * P8.6：每日时事/热点抓取（生成前置）。
 *
 * 优先用设置里的联网搜索；未配置或失败时用百度热搜兜底。
 * 只取标题做灵感，不把原文塞进提示词；同一天缓存，失败 30 分钟后才重试。
 */

export const PET_SCRIPT_TOPICS_KEY = 'pet-script.topics';
const RETRY_MS = 30 * 60 * 1000;
const TOPIC_QUERY = '今日热点新闻 生活 科技 娱乐 节庆';

export interface DailyTopics {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  fetchedAt: number;
  items: string[];
  provider: string | null;
  error: string | null;
}

export interface TopicStore {
  load(): unknown;
  save(state: DailyTopics): void;
}

export interface TopicSearchInput {
  query: string;
  maxResults?: number;
  freshness?: 'day' | 'week' | 'month' | 'year';
}

/** 与 core SearchService 结构兼容；这里不直接依赖 core，便于单测 */
export interface TopicSearch {
  search(input: TopicSearchInput): Promise<{
    provider: string;
    results: Array<{ title: string; snippet: string }>;
  }>;
}

export interface PetTopicFetcher {
  today(): Promise<DailyTopics>;
}

export function emptyTopics(date: string, now: number): DailyTopics {
  return { date, fetchedAt: now, items: [], provider: null, error: null };
}

export function resolveTopics(raw: unknown): DailyTopics | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  const items = Array.isArray(value.items)
    ? value.items.filter((item): item is string => typeof item === 'string').slice(0, 5)
    : [];
  return {
    date: value.date,
    fetchedAt: typeof value.fetchedAt === 'number' ? value.fetchedAt : 0,
    items,
    provider: typeof value.provider === 'string' ? value.provider : null,
    error: typeof value.error === 'string' ? value.error : null,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '热点获取失败';
}

export function createPetTopicFetcher(deps: {
  store: TopicStore;
  search?: TopicSearch;
  /** 兜底新闻源；默认百度热搜，测试可注入空实现避免联网 */
  news?: TopicNewsSource;
  now?: () => Date;
}): PetTopicFetcher {
  const now = deps.now ?? (() => new Date());
  const news = deps.news ?? fetchBaiduHot;

  return {
    async today() {
      const date = localDateKey(now());
      const cached = resolveTopics(deps.store.load());
      if (cached && cached.date === date) {
        const retryable =
          cached.items.length === 0 && now().getTime() - cached.fetchedAt >= RETRY_MS;
        if (!retryable) return cached;
      }

      const base: DailyTopics = {
        date,
        fetchedAt: now().getTime(),
        items: [],
        provider: null,
        error: null,
      };
      const errors: string[] = [];

      // 百度热搜更贴近「当天热点」，优先；失败/为空时再退回配置的搜索服务
      try {
        const items = topicsFromResults(await news());
        if (items.length > 0) {
          const next: DailyTopics = { ...base, items, provider: 'baidu-hot' };
          deps.store.save(next);
          return next;
        }
        errors.push('今日热点为空');
      } catch (error) {
        errors.push(errorText(error));
      }

      if (deps.search) {
        try {
          const response = await deps.search.search({
            query: TOPIC_QUERY,
            maxResults: 6,
            freshness: 'day',
          });
          const items = topicsFromResults(response.results);
          if (items.length > 0) {
            const next: DailyTopics = { ...base, items, provider: response.provider };
            deps.store.save(next);
            return next;
          }
          errors.push('搜索无可用话题');
        } catch (error) {
          errors.push(errorText(error));
        }
      }

      const next = { ...base, error: errors.join('；') || '未配置联网搜索' };
      deps.store.save(next);
      return next;
    },
  };
}

/** 拼进提示词；无话题返回 undefined，让 prompt 走默认文案 */
export function topicsContextForPrompt(topics: DailyTopics | null): string | undefined {
  if (!topics || topics.items.length === 0) return undefined;
  return topics.items.map((topic, index) => `${index + 1}) ${topic}`).join('\n');
}
