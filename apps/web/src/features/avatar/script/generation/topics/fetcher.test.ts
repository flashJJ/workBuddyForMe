import { describe, expect, it } from 'vitest';
import { createPetTopicFetcher, resolveTopics, topicsContextForPrompt } from './fetcher';
import {
  isLightTopic,
  parseBaiduHotTitles,
  sanitizeTopic,
  topicsFromResults,
} from './source';

const NOW = new Date(2026, 10, 13, 9, 0);

function memoryStore(initial: unknown = null) {
  const box = {
    state: initial,
    load: () => box.state,
    save: (state: unknown) => {
      box.state = state;
    },
  };
  return box;
}

describe('每日时事抓取（P8.6）', () => {
  it('标题清洗：去括号/站点后缀/日期前缀，去重并过滤沉重话题', () => {
    expect(sanitizeTopic('【城市马拉松周末开跑】')).toBe('城市马拉松周末开跑');
    expect(sanitizeTopic('今日十大科技新闻 - 今日头条')).toBe('今日十大科技新闻');
    expect(sanitizeTopic('5.10今日科技与生活热点速览 - 简书')).toBe('今日科技与生活热点速览');
    expect(sanitizeTopic('某地发生严重车祸')).toBeNull();
    expect(sanitizeTopic('短')).toBeNull();
    expect(
      topicsFromResults([
        { title: '城市马拉松周末开跑' },
        { title: '【城市马拉松周末开跑】' },
        { title: '新款折叠屏发布' },
      ]),
    ).toEqual(['城市马拉松周末开跑', '新款折叠屏发布']);
  });

  it('解析百度热搜 s-data，并只保留生活/科技/文娱类话题', () => {
    const html =
      '<html><!--s-data:{"data":{"cards":[{"content":[{"word":"飞秒手术要降价了"},{"word":"某地发生严重车祸"},{"word":"习近平将出席APEC会议"},{"word":"KFC列车诞生了"}]}]}}--></html>';
    const titles = parseBaiduHotTitles(html);
    expect(titles).toEqual([
      { title: '飞秒手术要降价了' },
      { title: '某地发生严重车祸' },
      { title: '习近平将出席APEC会议' },
      { title: 'KFC列车诞生了' },
    ]);
    expect(isLightTopic('飞秒手术要降价了')).toBe(true);
    expect(isLightTopic('KFC列车诞生了')).toBe(true);
    expect(isLightTopic('习近平将出席APEC会议')).toBe(false);
  });

  it('同一天只搜索一次，并把话题拼进提示词', async () => {
    let calls = 0;
    const store = memoryStore();
    const fetcher = createPetTopicFetcher({
      store,
      now: () => NOW,
      news: async () => [],
      search: {
        search: async () => {
          calls += 1;
          return {
            provider: 'mock',
            results: [{ title: '城市马拉松周末开跑', snippet: '' }],
          };
        },
      },
    });

    const first = await fetcher.today();
    expect(first.items).toEqual(['城市马拉松周末开跑']);
    expect(first.provider).toBe('mock');
    expect(topicsContextForPrompt(first)).toContain('1) 城市马拉松周末开跑');

    const second = await fetcher.today();
    expect(second.items).toEqual(first.items);
    expect(calls).toBe(1);
    expect(resolveTopics(store.state)?.items).toEqual(['城市马拉松周末开跑']);
  });

  it('搜索失败降级为空话题并缓存 30 分钟，之后重试', async () => {
    let calls = 0;
    let clock = NOW.getTime();
    const store = memoryStore();
    const fetcher = createPetTopicFetcher({
      store,
      now: () => new Date(clock),
      news: async () => [],
      search: {
        search: async () => {
          calls += 1;
          if (calls === 1) throw new Error('search offline');
          return { provider: 'mock', results: [{ title: '音乐节本周开场', snippet: '' }] };
        },
      },
    });

    const failed = await fetcher.today();
    expect(failed.items).toEqual([]);
    expect(failed.error).toContain('search offline');
    expect(topicsContextForPrompt(failed)).toBeUndefined();

    clock += 10 * 60 * 1000;
    expect((await fetcher.today()).items).toEqual([]);
    expect(calls).toBe(1);

    clock += 25 * 60 * 1000;
    const retried = await fetcher.today();
    expect(retried.items).toEqual(['音乐节本周开场']);
    expect(calls).toBe(2);
  });

  it('搜索与新闻源都不可用时降级为空，不抛错', async () => {
    const fetcher = createPetTopicFetcher({
      store: memoryStore(),
      now: () => NOW,
      news: async () => [],
    });
    const topics = await fetcher.today();
    expect(topics.items).toEqual([]);
    expect(topics.error).toContain('热点');
  });

  it('新闻源优先，未命中时才退回配置的搜索服务', async () => {
    let searchCalls = 0;
    const fetcher = createPetTopicFetcher({
      store: memoryStore(),
      now: () => NOW,
      news: async () => [{ title: '城市马拉松周末开跑' }, { title: '音乐节本周开场' }],
      search: {
        search: async () => {
          searchCalls += 1;
          return { provider: 'mock', results: [] };
        },
      },
    });
    const topics = await fetcher.today();
    expect(topics.provider).toBe('baidu-hot');
    expect(topics.items).toEqual(['城市马拉松周末开跑', '音乐节本周开场']);
    expect(searchCalls).toBe(0);
  });

  it('跨天会重新抓取', async () => {
    let calls = 0;
    let clock = NOW.getTime();
    const fetcher = createPetTopicFetcher({
      store: memoryStore(),
      now: () => new Date(clock),
      news: async () => {
        calls += 1;
        return [{ title: `话题${calls}号` }];
      },
    });
    await fetcher.today();
    clock += 24 * 60 * 60 * 1000;
    const next = await fetcher.today();
    expect(next.items).toEqual(['话题2号']);
    expect(calls).toBe(2);
  });
});
