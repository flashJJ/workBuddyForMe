// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge 徽标', () => {
  it('渲染默认变体与文本', () => {
    render(<Badge>默认</Badge>);
    expect(screen.getByText('默认')).toBeInTheDocument();
  });

  it('success/warning/danger/outline 变体应用对应样式', () => {
    render(
      <>
        <Badge variant="success" data-testid="s">成功</Badge>
        <Badge variant="warning" data-testid="w">警告</Badge>
        <Badge variant="danger" data-testid="d">危险</Badge>
        <Badge variant="outline" data-testid="o">轮廓</Badge>
      </>,
    );
    expect(screen.getByTestId('s')).toHaveClass('bg-emerald-500/10');
    expect(screen.getByTestId('w')).toHaveClass('bg-amber-500/10');
    expect(screen.getByTestId('d')).toHaveClass('bg-red-500/10');
    expect(screen.getByTestId('o')).toHaveClass('border');
  });
});
