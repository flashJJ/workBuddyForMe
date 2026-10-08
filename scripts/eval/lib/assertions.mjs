/**
 * eval 纯函数断言库（v1.1 M5）：每个断言返回结构化 {pass, reason}，
 * 不抛异常、不依赖测试框架——CLI/golden/未来 runner 通用。
 * 反向验证原则：恒真断言（无 actual 参与）禁止入库。
 */

/** 输出非空 */
export function outputNotEmpty(actual) {
  const text = typeof actual === 'string' ? actual : '';
  return text.trim().length > 0
    ? { pass: true, reason: '回答非空' }
    : { pass: false, reason: '回答为空' };
}

/** actual（小写包含）命中 expected 中任一关键词 */
export function outputContainsAny(actual, expected) {
  const haystack = String(actual ?? '').toLowerCase();
  const hit = expected.find((keyword) => haystack.includes(String(keyword).toLowerCase()));
  return hit
    ? { pass: true, reason: `命中「${hit}」` }
    : { pass: false, reason: `未命中任一项：${expected.join(' / ')}` };
}

/** 事件流包含指定事件名（可要求最少次数） */
export function eventsContain(events, name, minCount = 1) {
  const count = events.filter((e) => e.event === name).length;
  return count >= minCount
    ? { pass: true, reason: `${name} 出现 ${count} 次` }
    : { pass: false, reason: `${name} 仅 ${count} 次（要求 ≥${minCount}）` };
}

/** 消息计数不变（主动轮不落库断言） */
export function messageCountUnchanged(before, after) {
  return before === after
    ? { pass: true, reason: `消息数 ${after} 未变化` }
    : { pass: false, reason: `消息数 ${before} → ${after}（主动轮不应落库）` };
}

/**
 * prompt token 在预算线以下（压缩生效断言）。
 * @param {number} actual 实际 promptTokens
 * @param {number} limit 允许上限（由 golden 按基线 ×40% 给出）
 */
export function promptTokensBelow(actual, limit) {
  return typeof actual === 'number' && actual <= limit
    ? { pass: true, reason: `promptTokens=${actual} ≤ ${limit}` }
    : { pass: false, reason: `promptTokens=${actual} 超过预算线 ${limit}（压缩未生效？）` };
}

/** 运行多个断言，全过才 pass（任一失败收集全部 reason） */
export function allChecks(checks) {
  const failed = checks.filter((c) => !c.pass);
  return {
    pass: failed.length === 0,
    reasons: checks.map((c) => ({ pass: c.pass, reason: c.reason })),
    failedReasons: failed.map((c) => c.reason),
  };
}
