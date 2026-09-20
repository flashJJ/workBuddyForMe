// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { Composer } from './composer';

describe('输入区 Composer（TR-27.1）', () => {
  it('Enter 发送并清空；空白内容不发送', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Composer streaming={false} onSend={onSend} onStop={() => undefined} />);

    await user.click(screen.getByLabelText('消息输入框'));
    await user.keyboard('   ');
    await user.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('消息输入框'), '你好');
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('你好');
    expect(screen.getByLabelText('消息输入框')).toHaveValue('');
  });

  it('Shift+Enter 换行不触发发送', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Composer streaming={false} onSend={onSend} onStop={() => undefined} />);

    const textarea = screen.getByLabelText('消息输入框');
    await user.type(textarea, '第一行');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('第一行');
  });

  it('流式中展示停止按钮并触发 onStop', async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Composer streaming onSend={() => undefined} onStop={onStop} />);

    const stopButton = screen.getByRole('button', { name: /停止生成/ });
    await user.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
