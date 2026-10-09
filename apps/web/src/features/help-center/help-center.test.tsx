// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { HelpCenterPanel } from './help-center-panel';
import { HELP_CENTER_ANCHOR, HELP_ITEMS } from './help-items';

describe('帮助中心 HelpCenterPanel（v1.2 M5）', () => {
  it('渲染全部 FAQ 且每条带锚点 id', () => {
    renderWithProviders(<HelpCenterPanel />);
    const section = screen.getByTestId('help-center');
    expect(section).toHaveAttribute('id', HELP_CENTER_ANCHOR);
    for (const item of HELP_ITEMS) {
      const article = screen.getByTestId(`help-item-${item.id}`);
      expect(article).toHaveAttribute('id', item.id);
      expect(article.querySelector('.markdown-body')).toBeInTheDocument();
    }
  });

  it('答案 Markdown 被渲染（链接/代码），不裸露键名', () => {
    renderWithProviders(<HelpCenterPanel />);
    const shortcuts = screen.getByTestId('help-item-shortcuts');
    expect(shortcuts.textContent).toContain('Ctrl + K');
    expect(shortcuts.textContent).not.toContain('help.items.');
  });
});
