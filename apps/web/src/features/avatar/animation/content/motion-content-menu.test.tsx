// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MotionContentMenu } from './motion-content-menu';

vi.mock('./use-motion-content', () => ({
  useMotionContent: () => ({
    content: {
      version: 'packs:test',
      poses: [{ id: 'pack.pose.wave', mask: { include: ['head'] }, bones: {} }],
      motions: [],
      behaviors: [{ id: 'pack.behavior.wave', priority: 1, interrupt: 'all' }],
    },
    ready: true,
  }),
}));

describe('动效内容选择菜单（v4.0）', () => {
  it('默认列行为，切换姿势后按内容快照回传 id', () => {
    const onApply = vi.fn();
    renderWithProviders(<MotionContentMenu onApply={onApply} />);
    expect(screen.getByTestId('motion-content-item')).toHaveValue('pack.behavior.wave');

    fireEvent.change(screen.getByTestId('motion-content-kind'), {
      target: { value: 'pose' },
    });
    fireEvent.click(screen.getByTestId('motion-content-play'));

    expect(onApply).toHaveBeenCalledWith({ kind: 'pose', id: 'pack.pose.wave' });
  });

  it('传入目标列表时要求先选目标', () => {
    const onApply = vi.fn();
    renderWithProviders(
      <MotionContentMenu
        onApply={onApply}
        targets={[{ id: 'left', label: '左' }]}
        onTargetChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('motion-content-target')).toHaveValue('');
    expect(screen.getByTestId('motion-content-play')).toBeDisabled();
  });
});
