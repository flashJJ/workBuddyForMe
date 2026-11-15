// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TheaterBackdrop } from '../theater-backdrop';

describe('剧场背景（S3）', () => {
  it('幕布变体渲染侧幕、檐幕、地板与暗角', () => {
    render(<TheaterBackdrop variant="curtain" focus="left" />);
    expect(screen.getByTestId('theater-backdrop').getAttribute('data-variant')).toBe('curtain');
    expect(screen.getByTestId('theater-curtain-left')).toBeTruthy();
    expect(screen.getByTestId('theater-curtain-right')).toBeTruthy();
    expect(screen.getByTestId('theater-valance')).toBeTruthy();
    expect(screen.getByTestId('theater-floor')).toBeTruthy();
    expect(screen.getByTestId('theater-vignette')).toBeTruthy();
  });

  it('聚光灯跟随焦点与自定义站位', () => {
    render(<TheaterBackdrop variant="spotlight" focus="right" slots={{ right: { x: 0.7 } }} />);
    expect(screen.getByTestId('theater-spotlight').getAttribute('data-spot-x')).toBe('70');
    expect(screen.getByTestId('theater-floor-pool').getAttribute('data-spot-x')).toBe('70');
    expect(screen.queryByTestId('theater-curtain-left')).toBeNull();
  });

  it('散焦时聚光灯回到中央，默认站位走内置坐标', () => {
    const { rerender } = render(<TheaterBackdrop variant="curtain" focus={null} />);
    expect(screen.getByTestId('theater-spotlight').getAttribute('data-spot-x')).toBe('50');
    rerender(<TheaterBackdrop variant="curtain" focus="left" />);
    expect(screen.getByTestId('theater-spotlight').getAttribute('data-spot-x')).toBe('21');
  });

  it('none 变体不渲染任何背景', () => {
    const { container } = render(<TheaterBackdrop variant="none" focus="center" />);
    expect(container.firstChild).toBeNull();
  });
});
