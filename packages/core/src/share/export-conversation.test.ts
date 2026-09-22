import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseInstance,
  createConversationRepository,
  createMessageRepository,
  createAttachmentRepository,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';
import { buildConversationSnapshot } from './export-conversation';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('buildConversationSnapshot（M2 分享）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-share-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    ensureSeedData(db);
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('完整会话：文本/工具轨迹/引用 + 图片 data URL', () => {
    const convRepo = createConversationRepository(db);
    const msgRepo = createMessageRepository(db);
    const attRepo = createAttachmentRepository(db);

    const conv = convRepo.create({ assistantId: 'builtin-general', title: '技术方案讨论' });

    // 图片附件（文件落盘）
    mkdirSync(join(tempRoot, 'attachments'), { recursive: true });
    const att = attRepo.create({
      filename: 'diagram.png', mimeType: 'image/png', byteSize: PNG_MAGIC.length, contentHash: 'h1',
    });
    writeFileSync(join(tempRoot, 'attachments', att.storage_path), PNG_MAGIC);

    // 用户多模态消息
    msgRepo.add({
      conversationId: conv.id, role: 'user', content: '看这张图', status: 'completed',
      contentParts: [
        { type: 'text', text: '看这张图' },
        { type: 'image', attachmentId: att.id },
      ],
    });
    // 助手消息：工具轨迹 + 引用
    msgRepo.add({
      conversationId: conv.id, role: 'assistant', content: '根据资料，方案如下', status: 'completed',
      toolTrace: [
        {
          callId: 'call-1', tool: 'fetch_webpage', argsSummary: 'https://example.com',
          status: 'ok', durationMs: 2300, resultSummary: '抓取成功 1.2KB', startedAt: '2025-01-01T00:00:00Z',
        },
      ],
      citations: [{ documentId: 'd1', documentName: '架构.md', ordinal: 1, snippet: '模块分层' }],
    });

    const snap = buildConversationSnapshot({ db, cipher: createWebCipher() }, conv.id);

    expect(snap.title).toBe('技术方案讨论');
    expect(snap.assistantName).toBe('通用助手');
    expect(snap.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(snap.messages).toHaveLength(2);

    // 图片转 data URL
    const userMsg = snap.messages[0]!;
    expect(userMsg.role).toBe('user');
    const imgPart = userMsg.parts.find((p) => p.type === 'image');
    expect(imgPart).toBeDefined();
    expect(imgPart!.type === 'image' && imgPart!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    // 工具轨迹 + 引用保留
    const aiMsg = snap.messages[1]!;
    expect(aiMsg.toolTrace).toHaveLength(1);
    expect(aiMsg.toolTrace[0]!.durationMs).toBe(2300);
    expect(aiMsg.citations[0]!.documentName).toBe('架构.md');
  });

  it('error 状态消息被排除', () => {
    const convRepo = createConversationRepository(db);
    const msgRepo = createMessageRepository(db);
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '有错的会话' });

    msgRepo.add({ conversationId: conv.id, role: 'user', content: '提问', status: 'completed' });
    const failed = msgRepo.add({ conversationId: conv.id, role: 'assistant', content: '', status: 'error' });
    msgRepo.markError(failed.id, 'PROVIDER_ERROR', '上游挂了');
    msgRepo.add({ conversationId: conv.id, role: 'assistant', content: '重试成功', status: 'completed' });

    const snap = buildConversationSnapshot({ db, cipher: createWebCipher() }, conv.id);
    expect(snap.messages).toHaveLength(2);
    expect(snap.messages.every((m) => m.role === 'user' || m.content !== '')).toBe(true);
  });

  it('附件文件缺失时跳过图片片段但不报错', () => {
    const convRepo = createConversationRepository(db);
    const msgRepo = createMessageRepository(db);
    const attRepo = createAttachmentRepository(db);
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '图片丢了' });

    const att = attRepo.create({
      filename: 'lost.png', mimeType: 'image/png', byteSize: 10, contentHash: 'hx',
    });
    // 故意不写文件
    msgRepo.add({
      conversationId: conv.id, role: 'user', content: '图', status: 'completed',
      contentParts: [
        { type: 'text', text: '图' },
        { type: 'image', attachmentId: att.id },
      ],
    });

    const snap = buildConversationSnapshot({ db, cipher: createWebCipher() }, conv.id);
    expect(snap.messages[0]!.parts).toHaveLength(1);
    expect(snap.messages[0]!.parts[0]!.type).toBe('text');
  });

  it('会话不存在抛 NOT_FOUND', () => {
    expect(() => buildConversationSnapshot({ db, cipher: createWebCipher() }, 'nope')).toThrow(/不存在/);
  });

  it('消息内容中的 sk- key 在快照中已脱敏', () => {
    const convRepo = createConversationRepository(db);
    const msgRepo = createMessageRepository(db);
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '含密钥' });
    msgRepo.add({
      conversationId: conv.id, role: 'user', status: 'completed',
      content: '我的 key 是 sk-abcdefghijklmnop1234 别告诉别人',
    });

    const snap = buildConversationSnapshot({ db, cipher: createWebCipher() }, conv.id);
    expect(snap.messages[0]!.content).not.toContain('sk-');
    expect(snap.messages[0]!.content).toContain('[REDACTED]');
  });
});
