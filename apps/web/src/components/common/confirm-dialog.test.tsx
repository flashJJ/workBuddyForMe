// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from './confirm-dialog';

function Trigger({
  onResult,
  danger,
}: {
  onResult: (value: boolean) => void;
  danger?: boolean;
}) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({ title: '删除 X', description: '确定删除？', danger }).then(onResult)
      }
    >
      触发
    </button>
  );
}

describe('ConfirmDialog', () => {
  it('点确认 resolve(true)，点取消 resolve(false)', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Trigger onResult={onResult} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: '触发' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('删除 X')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));

    // 再来一次走确认
    await user.click(screen.getByRole('button', { name: '触发' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('Esc/遮罩关闭视为取消', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Trigger onResult={onResult} />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: '触发' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('危险动作：确认钮是 destructive 语义，默认焦点在取消（Enter 不误删）', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Trigger onResult={onResult} danger />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: '触发' }));

    const cancel = screen.getByRole('button', { name: '取消' });
    const confirmBtn = screen.getByRole('button', { name: '确认' });
    expect(confirmBtn).toHaveClass('bg-destructive');
    expect(cancel).toHaveFocus();

    // Enter 落在取消钮 → 不执行
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
