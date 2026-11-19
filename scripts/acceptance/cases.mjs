/**
 * v4.11 P0：自动验收入口用例集。
 *
 * 每个用例只描述「发什么消息 + 断言什么」，服务编排由 run.mjs 负责。
 * 共同前提：场景化 mock 供应商按轮下发工具调用，系统侧全部走真实代码。
 */
import {
  analyzeTurn,
  collect,
  expectAtMost,
  expectAtLeast,
  expectEqual,
  expectTrue,
  parseProbe,
  requestSpreadMs,
} from '../../tests/helpers/turn-assertions.mjs';

/** 每个用例都成立的底线断言 */
function baseline(result, turn) {
  return [
    expectTrue(!result.error, `无错误帧${result.error ? `（${result.error}）` : ''}`),
    expectTrue(turn.approvals === 0, `人工确认 ${turn.approvals} 次（要求 0）`),
    expectTrue(turn.failed.length === 0, `工具失败 ${turn.failed.length} 个（要求 0）${turn.failed.map((item) => `${item.tool}:${item.error}`).join(' | ')}`),
    expectTrue(turn.toolOrder.length > 0, '发生过真实工具调用'),
  ];
}

/** @param {Array<{path:string,at:number}>} requests */
function requestsTo(requests, prefix) {
  return requests.filter((item) => item.path.startsWith(prefix));
}

export const CASES = [
  {
    id: 'fetch-concurrent',
    tier: '128k',
    message: '[scenario:fetch-concurrent] 请并发抓取三个页面',
    async check({ result, stats }) {
      const turn = analyzeTurn(result.events);
      const probe = parseProbe(result.content);
      const slow = requestsTo(stats.requests, '/slow');
      return collect([
        ...baseline(result, turn),
        expectEqual(turn.toolOrder, ['fetch_webpage', 'fetch_webpage', 'fetch_webpage'], '工具顺序'),
        expectEqual(slow.length, 3, '慢页面请求数'),
        // 并发判定：三个请求到达间隔远小于单页 300ms 延迟
        expectAtMost(requestSpreadMs({ requests: slow }), 150, '请求到达跨度(ms)'),
        // 3×300ms 串行下限 900ms；并发应接近 300ms，留 2.3 倍余量
        expectAtMost(turn.wallMs, 700, '工具阶段墙钟(ms)'),
        expectTrue(probe?.count === 3, `模型看到 3 条工具结果（实际 ${probe?.count ?? 'null'}）`),
      ]);
    },
  },
  {
    id: 'fetch-cache',
    tier: '128k',
    message: '[scenario:fetch-cache] 抓取长页面后续读',
    async check({ result, stats }) {
      const turn = analyzeTurn(result.events);
      const probe = parseProbe(result.content);
      const large = requestsTo(stats.requests, '/large');
      const readEnd = turn.ends.find((item) => item.tool === 'read_fetched');
      return collect([
        ...baseline(result, turn),
        expectEqual(turn.toolOrder, ['fetch_webpage', 'read_fetched'], '工具顺序'),
        expectEqual(large.length, 1, '/large 网络请求数'),
        expectTrue(readEnd?.status === 'ok', 'read_fetched 返回 ok'),
        expectTrue(probe?.count === 2, `模型看到 2 条工具结果（实际 ${probe?.count ?? 'null'}）`),
        expectTrue(
          (turn.ends.find((item) => item.tool === 'fetch_webpage')?.resultSummary ?? '').length > 0,
          '抓取结果含摘要',
        ),
      ]);
    },
  },
  {
    id: 'fetch-fold',
    tier: '128k',
    message: '[scenario:fetch-fold] 连续抓取六个长页面',
    async check({ result, stats }) {
      const turn = analyzeTurn(result.events);
      const probe = parseProbe(result.content);
      const tools = probe?.tools ?? [];
      const latest = tools.at(-1);
      return collect([
        ...baseline(result, turn),
        expectEqual(turn.toolOrder.length, 6, '抓取次数'),
        expectEqual(requestsTo(stats.requests, '/large').length, 6, '/large 请求数'),
        expectTrue(probe?.count === 6, `模型看到 6 条工具结果（实际 ${probe?.count ?? 'null'}）`),
        expectTrue(tools[0]?.folded === true, '最早的页面已被折叠'),
        expectTrue(latest?.folded === false, '最新页面保持完整'),
        // 128K 单条工具消息预算 25.6K token，远大于单页 12K 字符：不做二次截断
        expectAtLeast(latest?.chars ?? 0, 10_000, '最新工具结果字符数'),
      ]);
    },
  },
  {
    id: 'budget-8k',
    tier: '8k',
    message: '[scenario:fetch-fold] 8K 窗口连续抓取六个长页面',
    async check({ result, stats }) {
      const turn = analyzeTurn(result.events);
      const probe = parseProbe(result.content);
      const tools = probe?.tools ?? [];
      return collect([
        expectTrue(!result.error, `无错误帧${result.error ? `（${result.error}）` : ''}`),
        expectTrue(turn.approvals === 0, `人工确认 ${turn.approvals} 次（要求 0）`),
        expectEqual(turn.toolOrder.length, 6, '抓取尝试次数'),
        // 8K：软预算 2880 token 触发折叠，硬保险丝 8640 token 在第 4 个抓取前拒绝出网
        expectEqual(requestsTo(stats.requests, '/large').length, 3, '/large 网络请求数'),
        expectEqual(turn.failed.length, 3, '预算拒绝次数'),
        expectTrue(
          turn.failed.every((item) => String(item.error ?? '').includes('预算已用尽')),
          `拒绝原因均为预算：${turn.failed.map((item) => item.error).join(' | ')}`,
        ),
        expectTrue(probe?.count === 6, `模型看到 6 条工具消息（实际 ${probe?.count ?? 'null'}）`),
        expectTrue(tools[0]?.folded === true, '最早的页面已折叠'),
        expectTrue(tools[1]?.folded === true, '第二条页面已折叠'),
        expectTrue(tools[2]?.folded === false, '第三条页面保持完整'),
        // 8K 档预算下限 2880 token 不为 0：单页仍有可引用正文
        expectAtLeast(tools[2]?.chars ?? 0, 3_000, '8K 单页入模字符数'),
      ]);
    },
  },
  {
    id: 'budget-1m',
    tier: '1m',
    message: '[scenario:fetch-fold] 1M 窗口连续抓取六个长页面',
    async check({ result, stats }) {
      const turn = analyzeTurn(result.events);
      const probe = parseProbe(result.content);
      const tools = probe?.tools ?? [];
      return collect([
        ...baseline(result, turn),
        expectEqual(turn.toolOrder.length, 6, '抓取次数'),
        expectEqual(requestsTo(stats.requests, '/large').length, 6, '/large 请求数'),
        expectTrue(probe?.count === 6, `模型看到 6 条工具结果（实际 ${probe?.count ?? 'null'}）`),
        // 1M 标准档软预算 135K token，6 页合计约 20K token：不应折叠或二次截断
        expectTrue(tools.every((item) => item.folded === false), '1M 窗口不折叠任何结果'),
        expectTrue(tools.every((item) => item.chars > 10_000), '每条工具结果都保持完整首屏'),
      ]);
    },
  },
  {
    id: 'overflow-retry',
    tier: '128k',
    message: '[scenario:overflow-retry] 触发一次上下文溢出',
    // 构造可缩容历史：溢出缩容要求非 system 消息 ≥4 且有 user 边界
    warmups: ['预热一', '预热二'],
    async check({ result }) {
      const turn = analyzeTurn(result.events);
      return collect([
        expectTrue(!result.error, `无错误帧${result.error ? `（${result.error}）` : ''}`),
        expectTrue(result.content.includes('溢出缩容后完成'), '溢出后自动重试并完成回答'),
        expectEqual(turn.approvals, 0, '人工确认次数'),
      ]);
    },
  },
];

export async function fetchStats(fixtureUrl) {
  const response = await fetch(`${fixtureUrl}/__stats`);
  return response.json();
}

export async function resetFixture(fixtureUrl) {
  await fetch(`${fixtureUrl}/__reset`, { method: 'POST' });
}
