import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import type { ServiceDeps } from '../services/deps';
import { createConversationService } from '../services/conversation-service';
import { createSessionLogService } from './session-log-service';
import { createSessionExportService } from './export-session';

describe('v2.9 事件日志 / 时间线 / 导出', () => {
  let db: DatabaseInstance;
  let deps: ServiceDeps;
  const conversationId = 'c1';

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-log-')));
    db = createDatabase();
    deps = { db, cipher: createWebCipher() };
    const ts = '2026-10-29T00:00:00.000Z';
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
    ).run(ts, ts);
    deps.events = createSessionLogService(deps);
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('对话写入事件；时间线可重建消息与回答', () => {
    const conversations = createConversationService(deps);
    conversations.appendMessage({ conversationId, role: 'user', content: '暗号是青鸟' });
    const assistant = conversations.appendMessage({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    conversations.completeMessage(assistant.id, '收到，青鸟。', null, []);
    conversations.saveMessageToolTrace(assistant.id, [
      {
        callId: 'call-1',
        tool: 'current_time',
        status: 'ok',
        argsSummary: '',
        resultSummary: '12:00',
        durationMs: 1,
        startedAt: '2026-10-29T00:00:00.000Z',
        source: 'builtin',
        permission: 'read',
      },
    ]);

    const timeline = deps.events!.timeline('chat', conversationId);
    expect(timeline.events.map((event) => event.type)).toEqual([
      'message_started',
      'message_started',
      'message_completed',
      'tool_trace',
    ]);
    expect(timeline.items[2]!.detail).toContain('青鸟');
    expect(deps.events!.search('青鸟')).toHaveLength(2);
  });

  it('导出 ZIP：manifest 与条目一致；默认脱敏移除密钥', () => {
    const conversations = createConversationService(deps);
    conversations.appendMessage({ conversationId, role: 'user', content: 'key=sk-test1234567890' });
    deps.events!.recordChat(conversationId, 'tool_trace', {
      apiKey: 'sk-secret1234567890',
      note: 'Bearer abcdefghijklmnop',
    });

    const exported = createSessionExportService(deps, deps.events!).export({
      scope: 'chat',
      scopeId: conversationId,
    });
    const files = unzipSync(exported.bytes);
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as {
      entries: Array<{ name: string }>;
      redacted: boolean;
      counts: { events: number; messages: number };
    };
    expect(manifest.redacted).toBe(true);
    expect(manifest.entries.map((entry) => entry.name).sort()).toEqual(
      Object.keys(files).sort(),
    );
    expect(manifest.counts.messages).toBe(1);
    expect(manifest.counts.events).toBe(2);

    const messages = strFromU8(files['messages.json']!);
    const events = strFromU8(files['events.jsonl']!);
    expect(messages).not.toContain('sk-test1234567890');
    expect(messages).toContain('[REDACTED]');
    expect(events).not.toContain('sk-secret1234567890');
    expect(events).not.toContain('apiKey');
  });

  it('导出 redact=0：保留工具参数但仍掩码令牌', () => {
    deps.events!.recordChat(conversationId, 'tool_trace', {
      note: 'Bearer abcdefghijklmnop',
      args: { q: '复盘' },
    });
    const exported = createSessionExportService(deps, deps.events!).export({
      scope: 'chat',
      scopeId: conversationId,
      redact: false,
    });
    const files = unzipSync(exported.bytes);
    const events = strFromU8(files['events.jsonl']!);
    expect(events).toContain('复盘');
    expect(events).not.toContain('Bearer abcdefghijklmnop');
    expect(JSON.parse(strFromU8(files['manifest.json']!)).redacted).toBe(false);
  });
});
