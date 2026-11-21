// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ChatSetupGuide } from './chat-setup-guide';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('首启空态（v4.17）', () => {
  it('三条起步路径都可见，模板入口指向助手页', () => {
    render(
      <I18nProvider skipHydration>
        <ChatSetupGuide />
      </I18nProvider>,
    );
    expect(screen.getByTestId('chat-open-wizard')).toHaveTextContent('打开配置向导');
    expect(screen.getByTestId('chat-try-demo')).toHaveTextContent('用演示模式试一句');
    expect(screen.getByTestId('chat-open-templates')).toHaveAttribute('href', '/assistants');
  });
});
