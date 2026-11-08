import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationFactRepository, createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../../../secrets/cipher';
import { createChatOrchestrator } from '../chat-orchestrator';
import { drain, seedLongConversation, sse } from '../chat-orchestrator-compaction.helpers';

/** JSON 内容需转义后才能嵌入 sse() 的 content 字段 */
function sseJson(value: unknown): string {
  return sse(JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
}

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('v2.26 P1 压缩产物：结构化事实落库与注入', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-p1-')));
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('facts / decisions / open_loops 写入 conversation_facts，并记录来源消息', async () => {
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    fetchMock
      .mockResolvedValueOnce(sseResponse(sse('本轮回答')))
      .mockResolvedValueOnce(
        sseResponse(
          sseJson({
            summary: '早期对话摘要内容',
            facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: null }],
            decisions: ['采用方案 A'],
            open_loops: ['待确认上线时间'],
          }),
        ),
      );

    const orchestrator = createChatOrchestrator({ db, cipher });
    await drain(orchestrator.streamChat({ assistantId, conversationId, content: '最新问题' }));
    await orchestrator.waitForBackgroundJobs();

    const facts = createConversationFactRepository(db).listByConversation(conversationId);
    expect(facts).toHaveLength(3);
    expect(facts.find((fact) => fact.key === 'budget')).toMatchObject({
      kind: 'fact',
      value: '5000',
      unit: '元',
    });
    expect(facts.some((fact) => fact.kind === 'decision')).toBe(true);
    expect(facts.some((fact) => fact.kind === 'open_loop')).toBe(true);
    expect(facts[0]!.sourceMessageIds.length).toBeGreaterThan(0);
  });

  it('下一轮 system 注入事实块，且位于摘要之前', async () => {
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    const structured = {
      summary: '早期摘要内容',
      facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: null }],
      decisions: [],
      open_loops: [],
    };
    fetchMock
      .mockResolvedValueOnce(sseResponse(sse('本轮回答')))
      .mockResolvedValueOnce(sseResponse(sseJson(structured)))
      .mockResolvedValueOnce(sseResponse(sse('次轮回答')))
      .mockResolvedValueOnce(sseResponse(sseJson({ ...structured, summary: '更新后的摘要' })));

    const orchestrator = createChatOrchestrator({ db, cipher });
    await drain(orchestrator.streamChat({ assistantId, conversationId, content: '第一问' }));
    await orchestrator.waitForBackgroundJobs();
    await drain(orchestrator.streamChat({ assistantId, conversationId, content: '第二问' }));
    await orchestrator.waitForBackgroundJobs();

    const chatBodies = fetchMock.mock.calls
      .map((call) => JSON.parse((call[1] as RequestInit).body as string))
      .filter((body) => !String(body.messages[0]!.content).includes('对话摘要助手'));
    const system = String(chatBodies.at(-1)!.messages[0]!.content);
    expect(system).toContain('【对话事实】');
    expect(system).toContain('5000元');
    expect(system.indexOf('【对话事实】')).toBeLessThan(system.indexOf('【对话摘要】'));
  });
});
