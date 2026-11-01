// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ToolConfirmDialog } from './tool-confirm-dialog';

/** v1.4 T4.5：协作链路弹窗必须标明发起来源；Flow 上下文隐藏「一直允许」 */
describe('ToolConfirmDialog 协作来源标识', () => {
  it('origin=agent 时显示「协作任务·Executor 发起」标识', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        origin="agent"
        tool="mouse_click"
        permission="danger"
        argsSummary="{}"
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    expect(screen.getByTestId('tool-confirm-origin')).toBeInTheDocument();
    expect(screen.getByTestId('tool-confirm-origin').textContent).toContain('Executor');
  });

  it('非协作链路不显示来源标识', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="write_note"
        permission="write"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    expect(screen.queryByTestId('tool-confirm-origin')).not.toBeInTheDocument();
  });

  it('hideAllowAlways 时不渲染「一直允许」按钮', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        origin="agent"
        hideAllowAlways
        tool="keyboard_type"
        permission="danger"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    // 「一直允许」（助手级记住）在 Flow 协作门控中隐藏
    expect(screen.queryByRole('button', { name: '一直允许' })).not.toBeInTheDocument();
  });

  it('拒绝按钮触发 onSubmit deny', async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="mouse_click"
        permission="danger"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onSubmit).toHaveBeenCalledWith('deny');
  });
});
