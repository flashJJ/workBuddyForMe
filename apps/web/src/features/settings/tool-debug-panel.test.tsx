// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DebugToolInfo } from '@wbfm/core/tools';
import { renderWithProviders } from '@/test/render';
import { ToolDebugPanel } from './tool-debug-panel';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeTool(partial: Partial<DebugToolInfo> & { name: string }): DebugToolInfo {
  return {
    name: partial.name,
    source: partial.source ?? 'builtin',
    permission: partial.permission ?? 'read',
    description: partial.description ?? `${partial.name} 工具`,
    parameters: partial.parameters ?? { type: 'object', properties: {} },
  };
}

describe('工具调试台面板（v0.6 M4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('列表加载后默认选第一个工具；执行后展示结果', async () => {
    // GET /api/tools/debug 返回 2 个工具
    fetchMock.mockResolvedValueOnce(
      ok([makeTool({ name: 'current_time' }), makeTool({ name: 'fetch_webpage', permission: 'danger' })]),
    );
    // POST /api/tools/debug 执行结果
    fetchMock.mockResolvedValueOnce(
      ok({ ok: true, output: '当前时间 2026-09-28', summary: '当前时间' }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ToolDebugPanel />);

    // 列表加载完成后默认选 current_time
    await waitFor(() => {
      expect(screen.getByTestId('tool-debug-select')).toHaveValue('current_time');
    });

    // 工具元数据展示：source=builtin 徽章
    expect(screen.getByText('builtin')).toBeTruthy();

    // 参数默认即 '{}'，无需手动输入
    const argsTextarea = screen.getByTestId('tool-debug-args') as HTMLTextAreaElement;
    expect(argsTextarea.value).toBe('{}');

    // 执行
    await user.click(screen.getByTestId('tool-debug-execute'));

    // 结果展示
    await waitFor(() => {
      const result = screen.getByTestId('tool-debug-result');
      expect(result.textContent).toContain('成功');
      expect(result.textContent).toContain('当前时间 2026-09-28');
    });
  });

  it('参数不是合法 JSON 时 toast 报错且不发起执行', async () => {
    fetchMock.mockResolvedValueOnce(ok([makeTool({ name: 'current_time' })]));

    const user = userEvent.setup();
    renderWithProviders(<ToolDebugPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('tool-debug-select')).toHaveValue('current_time');
    });

    const argsTextarea = screen.getByTestId('tool-debug-args') as HTMLTextAreaElement;
    await user.clear(argsTextarea);
    await user.type(argsTextarea, 'not json');

    await user.click(screen.getByTestId('tool-debug-execute'));

    // toast 文案出现
    await waitFor(() => {
      expect(screen.getByText('参数不是合法 JSON')).toBeTruthy();
    });
    // 只触发了 GET 列表请求，没有触发 POST 执行
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('列表为空时展示空态提示', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    renderWithProviders(<ToolDebugPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(/暂无可调试工具/),
      ).toBeTruthy();
    });
  });
});
