// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EVENT_FX_DURATION_MS, type ActiveFx } from './fx-registry';
import { EventFxLayer } from './event-fx-layer';

function fx(id: ActiveFx['id'], key: number): ActiveFx {
  return { id, key };
}

describe('EventFxLayer', () => {
  it('空列表不渲染层', () => {
    const { queryByTestId } = render(<EventFxLayer fx={[]} />);
    expect(queryByTestId('event-fx-layer')).toBeNull();
  });

  it('按实例渲染 data-testid 与注册时长，同类连发各自成节点', () => {
    const list = [fx('hearts', 1), fx('hearts', 2), fx('fadeIn', 3)];
    const { getAllByTestId } = render(<EventFxLayer fx={list} />);
    expect(getAllByTestId('event-fx-hearts')).toHaveLength(2);
    expect(getAllByTestId('event-fx-fadeIn')).toHaveLength(1);
    const heart = getAllByTestId('event-fx-hearts')[0]!;
    expect(heart.getAttribute('data-fx')).toBe('hearts');
    expect(heart.style.animationDuration).toBe(`${EVENT_FX_DURATION_MS.hearts}ms`);
  });

  it('层不接收指针事件（不挡舞台点击/摸头）', () => {
    const { getByTestId } = render(<EventFxLayer fx={[fx('sweat', 1)]} />);
    expect(getByTestId('event-fx-layer').className).toContain('pointer-events-none');
  });
});
