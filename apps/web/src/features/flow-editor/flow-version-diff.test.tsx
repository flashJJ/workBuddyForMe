// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { FlowGraphDiff } from '@wbfm/shared/schemas';
import { renderWithProviders } from '@/test/render';
import { FlowVersionDiff } from './flow-version-diff';

function diff(overrides: Partial<FlowGraphDiff['summary']> = {}): FlowGraphDiff {
  return {
    from: 1,
    to: 2,
    nodes: {
      added: [{ id: 'llm', type: 'llm' }],
      removed: [],
      typeChanged: [],
      configChanged: [],
    },
    edges: {
      added: [{ source: 'start', target: 'llm', handle: null }],
      removed: [],
    },
    summary: {
      nodesAdded: 1,
      nodesRemoved: 0,
      nodesTypeChanged: 0,
      nodesConfigChanged: 0,
      edgesAdded: 1,
      edgesRemoved: 0,
      ...overrides,
    },
  };
}

describe('工作流版本差异摘要（v2.15 M4）', () => {
  it('有差异时按分组渲染节点与连线', () => {
    renderWithProviders(<FlowVersionDiff diff={diff()} />);
    expect(screen.getByTestId('flow-version-diff')).toBeInTheDocument();
    expect(screen.getByText('llm (llm)')).toBeInTheDocument();
    expect(screen.getByText('start → llm')).toBeInTheDocument();
  });

  it('全零差异显示无差异文案', () => {
    const empty = diff({
      nodesAdded: 0,
      edgesAdded: 0,
    });
    empty.nodes.added = [];
    empty.edges.added = [];
    renderWithProviders(<FlowVersionDiff diff={empty} />);
    expect(screen.getByTestId('flow-version-diff-empty')).toBeInTheDocument();
  });
});
