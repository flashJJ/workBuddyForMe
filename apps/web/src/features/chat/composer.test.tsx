// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { Composer } from './composer';

// jsdom 无 canvas：压缩链路整体 mock，返回带类型的 jpeg blob
vi.mock('@/lib/utils/image', () => ({
  isSupportedImage: (file: File) => file.type.startsWith('image/'),
  compressImage: vi.fn(async (file: File) => ({
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    filename: file.name.replace(/\.[^.]+$/, '') + '.jpg',
  })),
}));

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
    expect(onSend).toHaveBeenCalledWith('你好', []);
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

  it('非视觉模型不显示图片入口；视觉模型显示附加按钮', () => {
    const { unmount } = renderWithProviders(
      <Composer streaming={false} onSend={() => undefined} onStop={() => undefined} />,
    );
    expect(screen.queryByRole('button', { name: '附加图片' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <Composer streaming={false} visionEnabled onSend={() => undefined} onStop={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: '附加图片' })).toBeInTheDocument();
  });

  it('选图后压缩上传，发送时携带附件 ID 并清空待发区', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 'att-1',
            filename: 'shot.jpg',
            mimeType: 'image/jpeg',
            byteSize: 1,
            contentHash: 'h',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Composer streaming={false} visionEnabled onSend={onSend} onStop={() => undefined} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['binary'], 'shot.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('attachment-previews')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('消息输入框'), '看图');
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('看图', ['att-1']);
    expect(screen.queryByTestId('attachment-previews')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  afterEach(() => vi.unstubAllGlobals());
});
