import { describe, expect, it } from 'vitest';
import type { Assistant } from '@wbfm/shared/types';
import { DEFAULT_AGENT_POLICY } from '@wbfm/shared/schemas';
import { RESEARCH_DEPTH_PRESETS } from '@wbfm/shared/constants';
import type { ServiceDeps } from '../../services/base/deps';
import { createToolRuntime } from '../tool-runtime';
import { resolveToolTurnLimits } from '../budget/turn-budget';

/**
 * v4.11 P0：工具契约快照（L0）。
 *
 * 守护「声明即契约」：权限等级、确认策略、必填参数的任何变化都会让快照失败。
 * 背景：fetch_webpage 曾从 danger 改为 read（逐页 HITL → 零确认），
 * 当时没有任何测试会因此失败，最终由用户体感发现。
 */
function contractLines(): string[] {
  const runtime = createToolRuntime({} as ServiceDeps);
  return runtime
    .listDebugTools()
    .filter((tool) => tool.source === 'builtin')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      return `${tool.name}|permission=${tool.permissions.join(',')}|alwaysConfirm=${tool.alwaysConfirm}|required=${required.join(',')}`;
    });
}

describe('工具契约快照', () => {
  it('内置工具的权限/确认/必填参数与快照一致', () => {
    expect(contractLines()).toMatchSnapshot();
  });

  it('联网检索工具保持 read，键鼠保持 danger', () => {
    const lines = contractLines();
    const lineOf = (name: string) => lines.find((line) => line.startsWith(`${name}|`)) ?? '';
    expect(lineOf('fetch_webpage')).toContain('permission=read');
    expect(lineOf('web_search')).toContain('permission=read');
    expect(lineOf('read_fetched')).toContain('permission=read');
    expect(lineOf('mouse_click')).toContain('permission=danger');
  });

  it('read_fetched 随 fetch_webpage 自动注入，未启用抓取时不出现', () => {
    const runtime = createToolRuntime({} as ServiceDeps);
    const withFetch = runtime.buildTools(
      { enabledTools: ['fetch_webpage'], knowledgeBaseIds: [] } as unknown as Assistant,
      true,
    );
    expect([...withFetch.keys()].sort()).toEqual(['fetch_webpage', 'read_fetched']);
    const withoutFetch = runtime.buildTools(
      { enabledTools: ['current_time'], knowledgeBaseIds: [] } as unknown as Assistant,
      true,
    );
    expect(withoutFetch.has('read_fetched')).toBe(false);
  });
});

describe('策略与预算常量快照', () => {
  it('默认确认策略保持 confirm_each（read 工具不受影响，danger 才逐次确认）', () => {
    expect(DEFAULT_AGENT_POLICY.defaultMode).toBe('confirm_each');
  });

  it('检索深度三档数值固定', () => {
    expect(RESEARCH_DEPTH_PRESETS).toEqual({
      frugal: { toolResultRatio: 0.08, maxWebSearch: 2, maxFetch: 3, perPageChars: 8_000 },
      standard: { toolResultRatio: 0.15, maxWebSearch: 4, maxFetch: 6, perPageChars: 12_000 },
      deep: { toolResultRatio: 0.3, maxWebSearch: 8, maxFetch: 12, perPageChars: 16_000 },
    });
  });

  it('预算随窗口缩放：8K 保底、128K 按比例、1M 高但受硬顶', () => {
    expect(resolveToolTurnLimits(8_192, 'standard').toolResultTokens).toBe(2_880);
    expect(resolveToolTurnLimits(128_000, 'standard').toolResultTokens).toBe(17_280);
    expect(resolveToolTurnLimits(1_000_000, 'standard').toolResultTokens).toBe(135_000);
    // 深度档 1M 理论 270K，被 200K 硬顶截断
    expect(resolveToolTurnLimits(1_000_000, 'deep').toolResultTokens).toBe(200_000);
  });
});
