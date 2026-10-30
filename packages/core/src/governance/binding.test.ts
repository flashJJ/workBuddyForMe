import { describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import { assertBindingMatches, computeOperationBinding, summarizeBinding } from './binding';

describe('审批绑定（v2.13 M2）', () => {
  it('参数键顺序不影响哈希；执行前同一 binding 通过', () => {
    const a = computeOperationBinding({ tool: 'write_file', args: { b: 1, a: 2 } });
    const b = computeOperationBinding({ tool: 'write_file', args: { a: 2, b: 1 } });
    expect(a.argsHash).toBe(b.argsHash);
    expect(() => assertBindingMatches(a, b)).not.toThrow();
  });

  it('参数 / 目录 / 环境漂移抛 409 APPROVAL_BINDING_DRIFT', () => {
    const expected = computeOperationBinding({
      tool: 'write_file',
      args: { path: 'a.txt' },
      cwd: '/tmp/a',
      env: { A: '1' },
    });
    const changed = computeOperationBinding({
      tool: 'write_file',
      args: { path: 'b.txt' },
      cwd: '/tmp/a',
      env: { A: '2' },
    });
    try {
      assertBindingMatches(expected, changed);
      expect.unreachable('应当拒绝漂移');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).details).toEqual({ code: 'APPROVAL_BINDING_DRIFT' });
    }
  });

  it('摘要只含工具 / 目录 / 目标窗口', () => {
    const binding = computeOperationBinding({
      tool: 'mouse_click',
      args: { x: 1, y: 2 },
      cwd: '/tmp/a',
      target: { processName: 'notepad.exe', windowId: 'w1' },
    });
    const summary = summarizeBinding(binding, 'x=1');
    expect(summary).toContain('mouse_click');
    expect(summary).toContain('notepad.exe');
    expect(summary).toContain('/tmp/a');
  });
});
