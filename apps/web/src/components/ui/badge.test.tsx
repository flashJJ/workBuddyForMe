// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge 徽标', () => {
  it('渲染默认变体与文本', () => {
    render(<Badge>默认</Badge>);
    expect(screen.getByText('默认')).toBeInTheDocument();
  });

  it('success/warning/danger/info/outline 变体应用语义样式', () => {
    render(
      <>
        <Badge variant="success" data-testid="s">成功</Badge>
        <Badge variant="warning" data-testid="w">警告</Badge>
        <Badge variant="danger" data-testid="d">危险</Badge>
        <Badge variant="info" data-testid="i">信息</Badge>
        <Badge variant="outline" data-testid="o">轮廓</Badge>
      </>,
    );
    expect(screen.getByTestId('s')).toHaveClass('bg-success-background');
    expect(screen.getByTestId('w')).toHaveClass('bg-warning-background');
    expect(screen.getByTestId('d')).toHaveClass('bg-destructive/10');
    expect(screen.getByTestId('i')).toHaveClass('bg-info-background');
    expect(screen.getByTestId('o')).toHaveClass('border');
  });
});
