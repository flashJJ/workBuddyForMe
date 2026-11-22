// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { MessageRows } from './message-rows';

function Harness({
  count,
  enabled = true,
  forceAll = false,
}: {
  count: number;
  enabled?: boolean;
  forceAll?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} style={{ height: 600 }}>
      <MessageRows
        count={count}
        enabled={enabled}
        forceAll={forceAll}
        containerRef={containerRef}
        resetKey="c1"
        itemKey={(index) => `m-${index}`}
        renderItem={(index) => (
          <div key={`row-${index}`} data-testid={`row-${index}`}>
            {index}
          </div>
        )}
      />
    </div>
  );
}

function rowCount(): number {
  return screen.queryAllByTestId(/^row-\d+$/).length;
}

describe('v4.20 长会话渲染', () => {
  it('默认只挂载最近 50 条，点击加载更早后逐批展开', () => {
    render(
      <I18nProvider skipHydration>
        <Harness count={120} />
      </I18nProvider>,
    );
    expect(rowCount()).toBe(50);
    expect(screen.getByTestId('row-70')).toBeInTheDocument();
    const button = screen.getByTestId('load-earlier-messages');
    expect(button).toHaveTextContent('加载更早的 70 条');

    fireEvent.click(button);
    expect(rowCount()).toBe(100);
    fireEvent.click(screen.getByTestId('load-earlier-messages'));
    expect(rowCount()).toBe(120);
    expect(screen.queryByTestId('load-earlier-messages')).toBeNull();
  });

  it('超过 200 条切换窗口化，只渲染可见区间', () => {
    render(
      <I18nProvider skipHydration>
        <Harness count={250} />
      </I18nProvider>,
    );
    const rendered = rowCount();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(250);
    expect(screen.getByTestId('row-249')).toBeInTheDocument();
  });

  it('深链目标存在时强制全量挂载', () => {
    render(
      <I18nProvider skipHydration>
        <Harness count={120} forceAll />
      </I18nProvider>,
    );
    expect(rowCount()).toBe(120);
    expect(screen.getByTestId('row-0')).toBeInTheDocument();
  });

  it('开关关闭时回到 v4.19 的全量渲染', () => {
    render(
      <I18nProvider skipHydration>
        <Harness count={80} enabled={false} />
      </I18nProvider>,
    );
    expect(rowCount()).toBe(80);
    expect(screen.getByTestId('row-0')).toBeInTheDocument();
    expect(screen.queryByTestId('load-earlier-messages')).toBeNull();
  });
});
