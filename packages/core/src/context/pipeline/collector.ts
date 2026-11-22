import type {
  ContextCollectRequest,
  ContextCollectResult,
  ContextFragment,
  ContextSource,
  ContextSourceStatus,
} from './types';

/**
 * 并发采集所有来源：
 * - 单来源抛错只记 status='failed'，不阻断其他来源；
 * - enabled 返回 false 记 'skipped'，不调用 collect；
 * - 空白片段视为无效，来源无有效片段时记 'empty'；
 * - 来源自身的 priority 是权威值（片段内同名字段被覆盖），保证优先级表唯一。
 */
async function runSource(
  source: ContextSource,
  request: ContextCollectRequest,
): Promise<{ fragments: ContextFragment[]; status: ContextSourceStatus }> {
  const startedAt = Date.now();
  const settle = (status: ContextSourceStatus['status'], fragments: ContextFragment[]) => ({
    fragments,
    status: {
      id: source.id,
      status,
      fragments: fragments.length,
      durationMs: Date.now() - startedAt,
    },
  });

  if (source.enabled && !source.enabled(request)) return settle('skipped', []);

  try {
    const collected = await source.collect(request);
    const fragments = collected
      .filter((fragment) => fragment && fragment.text.trim() !== '')
      .map((fragment) => ({ ...fragment, source: source.id, priority: source.priority }));
    return settle(fragments.length > 0 ? 'ok' : 'empty', fragments);
  } catch {
    return settle('failed', []);
  }
}

export async function collectContext(
  sources: readonly ContextSource[],
  request: ContextCollectRequest,
): Promise<ContextCollectResult> {
  const results = await Promise.all(sources.map((source) => runSource(source, request)));
  // Promise.all 保持注册顺序；按来源优先级稳定排序，同优先级保持注册顺序
  const fragments = results
    .flatMap((result) => result.fragments)
    .sort((a, b) => a.priority - b.priority);
  return { fragments, sources: results.map((result) => result.status) };
}
