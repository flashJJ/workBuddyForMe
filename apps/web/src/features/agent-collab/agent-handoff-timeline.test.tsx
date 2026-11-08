// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AgentHandoffTimeline } from './agent-handoff-timeline';
import type { AgentHandoffEntry } from './agent-run-reducer';

function entry(over: Partial<AgentHandoffEntry>): AgentHandoffEntry {
  return {
    round: 0,
    seq: 1,
    from: 'planner',
    to: 'executor',
    at: '2026-01-01T00:00:00.000Z',
    kind: 'subtask',
    summary: '查证制度',
    ...over,
  };
}

describe('AgentHandoffTimeline（v2.27 P2-M5）', () => {
  it('空交接不渲染', () => {
    renderWithProviders(<AgentHandoffTimeline handoffs={[]} />);
    expect(screen.queryByTestId('agent-handoff-timeline')).toBeNull();
  });

  it('渲染交接条目：角色、摘要、裁决与相邻耗时', () => {
    const handoffs = [
      entry({ seq: 1 }),
      entry({
        seq: 2,
        from: 'executor',
        to: 'reviewer',
        kind: 'outcome',
        summary: '年假 15 天',
        at: '2026-01-01T00:00:01.500Z',
      }),
      entry({
        seq: 3,
        from: 'reviewer',
        to: 'user',
        kind: 'verdict',
        summary: '符合验收',
        verdict: 'approve',
        at: '2026-01-01T00:01:06.500Z',
      }),
    ];
    renderWithProviders(<AgentHandoffTimeline handoffs={handoffs} />);

    expect(screen.getByTestId('agent-handoff-timeline')).toBeTruthy();
    expect(screen.getAllByTestId('agent-handoff-item')).toHaveLength(3);
    expect(screen.getByText('查证制度')).toBeTruthy();
    expect(screen.getByText('年假 15 天')).toBeTruthy();
    expect(screen.getByText('符合验收')).toBeTruthy();
    // 第 1 条无前序交接，不显示耗时；后两条按相邻 at 差值展示
    expect(screen.getByText('+1.5s')).toBeTruthy();
    expect(screen.getByText('+1m 5s')).toBeTruthy();
    expect(screen.getByText('通过')).toBeTruthy();
  });
});
