import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { maybeSpillOutput, spillHash, SPILL_THRESHOLD_CHARS } from '@wbfm/core/tools';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as getEvents } from '../events/route';
import { GET as searchEvents } from '../search/route';
import { GET as exportSession } from '../export/session/route';
import { GET as getSpill } from '../spills/[hash]/route';

describe('v2.9 事件 / 检索 / 导出 / 溢出 API', () => {
  let db: DatabaseInstance;
  let conversationId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-timeline-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    const assistantId = services.assistants.list()[0]!.id;
    conversationId = services.conversations.create(assistantId, '复盘会话').id;
    services.conversations.appendMessage({
      conversationId,
      role: 'user',
      content: '暗号是青鸟',
    });
    const assistant = services.conversations.appendMessage({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    services.conversations.completeMessage(assistant.id, '收到：青鸟已记下。', null, []);
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET /api/events 返回时间线与事件', async () => {
    const res = await getEvents(
      new Request(
        `http://127.0.0.1/x?scope=chat&scopeId=${conversationId}&limit=100`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data as {
      events: Array<{ type: string }>;
      items: Array<{ label: string; detail: string }>;
    };
    expect(body.events.map((event) => event.type)).toEqual([
      'message_started',
      'message_started',
      'message_completed',
    ]);
    expect(body.items.at(-1)!.detail).toContain('青鸟');
  });

  it('GET /api/search 支持中文 2 字词', async () => {
    const res = await searchEvents(new Request('http://127.0.0.1/x?q=青鸟'));
    expect(res.status).toBe(200);
    const list = (await res.json()).data as Array<{ scope: string; scopeId: string }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.scope).toBe('chat');
    expect(list[0]!.scopeId).toBe(conversationId);
  });

  it('GET /api/export/session 返回 ZIP', async () => {
    const res = await exportSession(
      new Request(
        `http://127.0.0.1/x?scope=chat&scopeId=${conversationId}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toContain('.zip');
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('GET /api/spills/:hash 读取全文；非法 hash 404', async () => {
    const output = '丙'.repeat(SPILL_THRESHOLD_CHARS + 1);
    expect(maybeSpillOutput(output).ref).not.toBeNull();
    const hash = spillHash(output);
    const res = await getSpill(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ hash }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(output);

    const bad = await getSpill(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ hash: 'nope' }),
    });
    expect(bad.status).toBe(404);
  });
});
