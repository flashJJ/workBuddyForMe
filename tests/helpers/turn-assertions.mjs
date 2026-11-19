/**
 * v4.11 P0：回合事件断言库（纯函数，零依赖）。
 *
 * 输入为 SSE 客户端收集的事件数组（{ event, data, at }），输出可直接断言的回合指标：
 * 人工确认次数、工具调用顺序、并发窗口、失败工具、模型自述探针。
 * 设计原则：优先断言确定性指标（次数/顺序/并发），绝对时延只配夹具慢响应 + 宽阈值。
 */

/** @typedef {{event:string, data:any, at?:number}} TurnEvent */

/**
 * 汇总一个用户回合的工具执行指标。
 * @param {TurnEvent[]} events
 */
export function analyzeTurn(events) {
  const toolEvents = events.filter((item) => item.event === 'tool');
  const starts = toolEvents.filter((item) => item.data?.phase === 'start');
  const ends = toolEvents.filter((item) => item.data?.phase === 'end');
  const firstStart = starts[0] ?? null;
  const lastEnd = ends.at(-1) ?? null;
  const wallMs =
    firstStart && lastEnd && typeof firstStart.at === 'number' && typeof lastEnd.at === 'number'
      ? lastEnd.at - firstStart.at
      : null;
  return {
    approvals: events.filter((item) => item.event === 'tool_confirmation_required').length,
    toolOrder: starts.map((item) => item.data.tool),
    toolCallIds: starts.map((item) => item.data.callId),
    ends: ends.map((item) => item.data),
    wallMs,
    failed: ends
      .filter((item) => item.data.status !== 'ok')
      .map((item) => ({ tool: item.data.tool, error: item.data.error ?? item.data.resultSummary })),
  };
}

/**
 * 从最终回答中提取 {{toolState}} 探针 JSON（模型实际看到的工具消息状态）。
 * @param {string} content
 * @returns {{count:number, tools:Array<{name:string,chars:number,folded:boolean}>}|null}
 */
export function parseProbe(content) {
  const text = typeof content === 'string' ? content : '';
  const index = text.lastIndexOf('{"count"');
  if (index === -1) return null;
  try {
    return JSON.parse(text.slice(index));
  } catch {
    return null;
  }
}

/** 统计 Fake Web 请求到达时间的最大跨度（毫秒）；跨度远小于串行总耗时即为并发 */
export function requestSpreadMs(stats) {
  const times = (stats?.requests ?? []).map((item) => item.at).filter((at) => typeof at === 'number');
  if (times.length < 2) return 0;
  return Math.max(...times) - Math.min(...times);
}

/** @param {boolean} condition @param {string} reason */
export function expectTrue(condition, reason) {
  return { pass: Boolean(condition), reason };
}

/** @param {*} actual @param {*} expected @param {string} label */
export function expectEqual(actual, expected, label) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return { pass, reason: pass ? `${label}=${JSON.stringify(actual)}` : `${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}` };
}

/** @param {number|null} actual @param {number} min @param {string} label */
export function expectAtLeast(actual, min, label) {
  const pass = typeof actual === 'number' && actual >= min;
  return { pass, reason: pass ? `${label}=${actual} ≥ ${min}` : `${label}=${actual}（要求 ≥${min}）` };
}

/** @param {number|null} actual @param {number} max @param {string} label */
export function expectAtMost(actual, max, label) {
  const pass = typeof actual === 'number' && actual <= max;
  return { pass, reason: pass ? `${label}=${actual} ≤ ${max}` : `${label}=${actual}（要求 ≤${max}）` };
}

/** 多断言汇总为 {pass, failedReasons}（与 scripts/eval/lib/assertions.mjs 的 allChecks 同形） */
export function collect(checks) {
  const failed = checks.filter((check) => !check.pass);
  return {
    pass: failed.length === 0,
    reason: failed.length === 0 ? checks.map((check) => check.reason).join('；') : undefined,
    failedReasons: failed.map((check) => check.reason),
  };
}
