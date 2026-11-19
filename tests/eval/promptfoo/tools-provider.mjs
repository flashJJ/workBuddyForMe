import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '../../../scripts/eval/lib/http.mjs';
import { streamChat } from '../../../scripts/eval/lib/sse-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, 'tool-cases.json'), 'utf8'));
const byId = new Map(cases.map((item) => [item.id, item]));

const BASE_URL = process.env.WBFM_TOOL_EVAL_BASE_URL ?? 'http://127.0.0.1:3200';
const ASSISTANT_ID = process.env.WBFM_TOOL_EVAL_ASSISTANT_ID ?? '';
const MODE = process.env.WBFM_TOOL_EVAL_MODE === 'real' ? 'real' : 'mock';

/** 从最终回答中提取 {{toolState}} 探针 */
function parseProbe(content) {
  const text = typeof content === 'string' ? content : '';
  const index = text.lastIndexOf('{"count"');
  if (index === -1) return null;
  try {
    return JSON.parse(text.slice(index));
  } catch {
    return null;
  }
}

/**
 * v4.11 P1-5：工具链路评测 provider。
 * - mock 模式：按 caseId 自动加 `[scenario:...]` 前缀，驱动离线场景；
 * - real 模式：只发自然语言 prompt，让真实模型自己决定工具。
 * 统一返回 metadata（工具序列/确认次数/失败/探针），供 promptfoo 断言。
 */
export default class WbfmToolEvalProvider {
  id() {
    return 'wbfm-tool-eval';
  }

  async callApi(prompt, context) {
    const caseId = context?.vars?.caseId;
    const testCase = byId.get(caseId);
    if (!testCase) return { error: `未知评测用例：${caseId}` };
    if (!ASSISTANT_ID) return { error: '缺少 WBFM_TOOL_EVAL_ASSISTANT_ID' };

    const content = MODE === 'mock' ? `[scenario:${testCase.scenario}] ${prompt}` : prompt;
    try {
      const conversation = await api(BASE_URL, '/api/conversations', {
        method: 'POST',
        body: JSON.stringify({
          assistantId: ASSISTANT_ID,
          title: `tool-eval-${caseId}-${Date.now()}`,
        }),
      });
      const result = await streamChat(BASE_URL, '/api/chat/stream', {
        assistantId: ASSISTANT_ID,
        conversationId: conversation.id,
        content,
      });
      if (result.error) return { error: result.error };

      const toolEvents = result.events.filter((event) => event.event === 'tool');
      const starts = toolEvents.filter((event) => event.data?.phase === 'start');
      const ends = toolEvents.filter((event) => event.data?.phase === 'end');
      const usage = result.usage ?? null;
      return {
        output: result.content,
        metadata: {
          caseId,
          mode: MODE,
          toolOrder: starts.map((event) => event.data.tool),
          approvals: result.events.filter((event) => event.event === 'tool_confirmation_required').length,
          failed: ends
            .filter((event) => event.data.status !== 'ok')
            .map((event) => ({ tool: event.data.tool, error: event.data.error ?? event.data.resultSummary })),
          probe: parseProbe(result.content),
          expectedTools: testCase.expectedTools,
          realExpectedTools: testCase.realExpectedTools,
          expectedProbeCount: testCase.expectedProbeCount,
          expectFolded: Boolean(testCase.expectFolded),
          toolCalls: starts.length,
          usage,
        },
        ...(usage
          ? {
              tokenUsage: {
                prompt: usage.promptTokens ?? 0,
                completion: usage.completionTokens ?? 0,
                total: usage.totalTokens ?? 0,
              },
            }
          : {}),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
