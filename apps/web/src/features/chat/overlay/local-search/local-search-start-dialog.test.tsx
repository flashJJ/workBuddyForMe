// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { LocalSearchStartDialog } from './local-search-start-dialog';

const BASE = {
  open: true,
  endpoint: 'http://127.0.0.1:8080',
  query: '今日时事',
  canAutoStart: true,
  running: false,
  error: null,
  onStart: () => undefined,
  onCancel: () => undefined,
};

describe('LocalSearchStartDialog', () => {
  it('展示服务地址与搜索词，桌面端提供一键启动', () => {
    renderWithProviders(<LocalSearchStartDialog {...BASE} />);
    expect(screen.getByText('本地搜索服务未运行')).toBeInTheDocument();
    expect(screen.getByText(/127\.0\.0\.1:8080/)).toBeInTheDocument();
    expect(screen.getByText(/今日时事/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '一键启动并继续' })).toBeInTheDocument();
  });

  it('浏览器模式改为「我已启动，继续搜索」并提示手动启动', () => {
    renderWithProviders(<LocalSearchStartDialog {...BASE} canAutoStart={false} />);
    expect(screen.getByRole('button', { name: '我已启动，继续搜索' })).toBeInTheDocument();
    expect(screen.getByText(/浏览器模式/)).toBeInTheDocument();
  });

  it('启动中禁用按钮并显示进度文案', () => {
    renderWithProviders(<LocalSearchStartDialog {...BASE} running />);
    expect(screen.getByRole('button', { name: '正在启动…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  });

  it('展示启动失败信息，点击取消回调', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <LocalSearchStartDialog {...BASE} error="Docker 未安装" onCancel={onCancel} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Docker 未安装');
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
