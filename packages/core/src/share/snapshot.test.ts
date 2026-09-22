import { describe, expect, it } from 'vitest';
import { sanitizeShareText, sanitizeSnapshot, REDACTED, type ConversationSnapshot } from './snapshot';

describe('分享文本脱敏 sanitizeShareText', () => {
  it('OpenAI 风格 sk- key 被替换', () => {
    expect(sanitizeShareText('key is sk-abcdefghijklmnop1234 end')).toBe(`key is ${REDACTED} end`);
  });

  it('Bearer 令牌被替换但保留前缀', () => {
    expect(sanitizeShareText('Authorization: Bearer abcdef1234567890ABCD')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
  });

  it('api_key/token/secret 赋值串被替换', () => {
    expect(sanitizeShareText('{"api_key":"abcdef1234567890"}')).toContain(REDACTED);
    expect(sanitizeShareText('token = zzzzaaaabbbbccccdddd')).toContain(REDACTED);
    expect(sanitizeShareText('password: "my-secret-pw-123"')).toContain(REDACTED);
  });

  it('Windows 数据根路径被替换', () => {
    const out = sanitizeShareText('文件位于 C:\\Users\\aa707\\.workbuddy-for-me\\attachments\\x.png');
    expect(out).not.toContain('aa707');
    expect(out).toContain(REDACTED);
  });

  it('具体 dataRoot 路径（正斜杠变体）被替换', () => {
    const root = 'C:\\Users\\aa707\\.workbuddy-for-me';
    const out = sanitizeShareText(`路径 ${root}/db/wbfm.sqlite`, root);
    expect(out).not.toContain('aa707');
  });

  it('macOS/Linux 路径与波浪号路径被替换', () => {
    expect(sanitizeShareText('/home/alice/.workbuddy-for-me/db/x.sqlite')).toContain(REDACTED);
    expect(sanitizeShareText('/Users/bob/.workbuddy-for-me/attachments')).toContain(REDACTED);
    expect(sanitizeShareText('~/.workbuddy-for-me/secret')).toContain(REDACTED);
  });

  it('正常文本（含普通代码路径）不被误伤', () => {
    const text = '在 src/index.ts 里调用 build()，耗时 2.3s';
    expect(sanitizeShareText(text)).toBe(text);
  });

  it('短 token（≤6 字符）不替换，避免误伤', () => {
    expect(sanitizeShareText('token=abc')).toBe('token=abc');
  });
});

describe('sanitizeSnapshot 深度脱敏', () => {
  it('content/parts/toolTrace/citations 全部递归脱敏', () => {
    const snap: ConversationSnapshot = {
      conversationId: 'c1',
      title: 'C:\\Users\\aa707\\.workbuddy-for-me 数据目录',
      assistantName: '助手',
      exportedAt: '2025-01-01T00:00:00Z',
      appVersion: '0.4.0',
      messages: [
        {
          role: 'user',
          content: 'sk-abcdefghijklmnop1234',
          createdAt: '2025-01-01T00:00:00Z',
          parts: [{ type: 'text', text: 'Bearer abcdef1234567890ABCD' }],
          toolTrace: [
            {
              callId: 't1', tool: 'fetch_webpage', argsSummary: 'url=x', status: 'ok',
              durationMs: 10, resultSummary: 'token = zzzzaaaabbbbccccdddd', startedAt: '2025-01-01',
            },
          ],
          citations: [
            { documentId: 'd1', documentName: 'C:\\Users\\aa707\\.workbuddy-for-me\\f.md', ordinal: 1 },
          ],
        },
      ],
    };
    const out = sanitizeSnapshot(snap, 'C:\\Users\\aa707\\.workbuddy-for-me');
    expect(out.title).not.toContain('aa707');
    expect(out.messages[0]!.content).toBe(REDACTED);
    expect(out.messages[0]!.parts[0]).toEqual({ type: 'text', text: `Bearer ${REDACTED}` });
    expect(out.messages[0]!.toolTrace[0]!.resultSummary).toContain(REDACTED);
    expect(out.messages[0]!.citations[0]!.documentName).not.toContain('aa707');
  });

  it('图片 data URL 不被改动', () => {
    const snap: ConversationSnapshot = {
      conversationId: 'c1', title: 't', assistantName: null,
      exportedAt: '', appVersion: '0.4.0',
      messages: [
        {
          role: 'user', content: '', createdAt: '',
          parts: [{ type: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
          toolTrace: [], citations: [],
        },
      ],
    };
    const out = sanitizeSnapshot(snap);
    expect(out.messages[0]!.parts[0]).toEqual({ type: 'image', dataUrl: 'data:image/png;base64,AAAA' });
  });
});
