import { describe, expect, it } from 'vitest';
import {
  buildPermissionResultLine,
  buildRunLine,
  isFatalParseFailure,
  parseCliLine,
} from './cli-protocol';

describe('v2.11 CLI JSON Lines 协议', () => {
  it('合法帧：delta / permission / done / error', () => {
    expect(parseCliLine('{"type":"delta","text":"hi"}')).toEqual({
      kind: 'frame',
      frame: { type: 'delta', text: 'hi' },
    });
    expect(parseCliLine('{"type":"permission","id":"p1","title":"写入","detail":"a.md"}')).toEqual({
      kind: 'frame',
      frame: { type: 'permission', id: 'p1', title: '写入', detail: 'a.md' },
    });
    expect(parseCliLine('{"type":"done","summary":"ok"}')).toEqual({
      kind: 'frame',
      frame: { type: 'done', summary: 'ok' },
    });
    expect(parseCliLine('{"type":"error","code":"FAILED","message":"boom"}')).toEqual({
      kind: 'frame',
      frame: { type: 'error', code: 'FAILED', message: 'boom' },
    });
    expect(parseCliLine('  ')).toEqual({ kind: 'empty' });
  });

  it('非法帧：非 JSON / 缺字段 / 未知 type', () => {
    expect(parseCliLine('not-json')).toEqual({ kind: 'invalid', reason: '非 JSON 行' });
    expect(parseCliLine('{"type":"delta"}')).toEqual({
      kind: 'invalid',
      reason: 'delta.text 必须是字符串',
    });
    expect(parseCliLine('{"type":"permission","id":"p1"}')).toEqual({
      kind: 'invalid',
      reason: 'permission 缺少 id/title',
    });
    const unknown = parseCliLine('{"type":"unknown"}');
    expect(unknown).toEqual({ kind: 'invalid', reason: '未知 type：unknown' });
    expect(isFatalParseFailure(unknown)).toBe(true);
    expect(isFatalParseFailure(parseCliLine('{"type":"delta"}'))).toBe(false);
  });

  it('单行超过 64KB 视为终止性协议错误', () => {
    const huge = JSON.stringify({ type: 'delta', text: 'x'.repeat(70_000) });
    const parsed = parseCliLine(huge);
    expect(parsed).toEqual({ kind: 'invalid', reason: '单行输出超过 64KB' });
    expect(isFatalParseFailure(parsed)).toBe(true);
  });

  it('宿主帧序列化', () => {
    expect(buildRunLine({ goal: '整理 README', budget: { maxRounds: 3 } })).toBe(
      '{"type":"run","protocol":1,"goal":"整理 README","budget":{"maxRounds":3}}',
    );
    expect(buildPermissionResultLine('p1', false)).toBe(
      '{"type":"permission_result","id":"p1","allow":false}',
    );
  });
});
