import { describe, expect, it } from 'vitest';
import type { FlowGraph, FlowNodeType } from '@wbfm/shared/schemas';
import { compileFlow } from './compiler';

const node = (id: string, type: FlowNodeType, config: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
});

function graphWith(config: Record<string, unknown>): FlowGraph {
  return {
    nodes: [node('start', 'start'), node('ag', 'agent', config), node('end', 'end')],
    edges: [
      { id: 'e1', source: 'start', target: 'ag' },
      { id: 'e2', source: 'ag', target: 'end' },
    ],
  };
}

function codes(graph: FlowGraph) {
  const result = compileFlow(graph);
  return {
    ok: result.ok,
    errors: result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code),
    warnings: result.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code),
  };
}

describe('compiler：v1.4 agent 节点校验', () => {
  it('goal 缺失/空白 → 阻断错误', () => {
    expect(codes(graphWith({})).errors).toContain('flow/agent-goal-required');
    expect(codes(graphWith({ goal: '   ' })).errors).toContain('flow/agent-goal-required');
  });

  it('goal 支持 $ref 整字段绑定', () => {
    const result = codes(graphWith({ goal: { $ref: 'nodes.start.params.topic' } }));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('预算越界（轮次/步数/token）→ 阻断错误；合法值通过', () => {
    expect(codes(graphWith({ goal: 'g', maxRounds: 6 })).errors).toContain('flow/agent-budget-range');
    expect(codes(graphWith({ goal: 'g', maxRounds: 0 })).errors).toContain('flow/agent-budget-range');
    expect(codes(graphWith({ goal: 'g', maxSteps: 51 })).errors).toContain('flow/agent-budget-range');
    expect(codes(graphWith({ goal: 'g', maxTotalTokens: 9999 })).errors).toContain(
      'flow/agent-budget-range',
    );
    expect(codes(graphWith({ goal: 'g', maxTotalTokens: 200001 })).errors).toContain(
      'flow/agent-budget-range',
    );
    const valid = codes(graphWith({ goal: 'g', maxRounds: 5, maxSteps: 50, maxTotalTokens: 200000 }));
    expect(valid.ok).toBe(true);
  });

  it('desktop 工具域 → 非阻断警告（人工试运行可用，无人值守会被拦）', () => {
    const result = codes(graphWith({ goal: 'g', toolScopes: ['knowledge', 'desktop'] }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('flow/agent-desktop-unattended');
    // 无桌面域不报警
    expect(codes(graphWith({ goal: 'g', toolScopes: ['knowledge'] })).warnings).toEqual([]);
  });

  it('诊断带 nodeId 便于画布定位', () => {
    const result = compileFlow(graphWith({}));
    const diag = result.diagnostics.find((d) => d.code === 'flow/agent-goal-required');
    expect(diag?.nodeId).toBe('ag');
  });
});
