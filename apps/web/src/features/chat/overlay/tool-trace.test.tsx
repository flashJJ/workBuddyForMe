// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import type { ToolTraceEntry } from '@wbfm/shared/types';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ToolTrace } from './tool-trace';

function I18nWrapper({ children }: { children: ReactNode }) {
  return <I18nProvider skipHydration>{children}</I18nProvider>;
}

function renderWithI18n(ui: ReactElement) {
  return render(ui, { wrapper: I18nWrapper });
}

const baseEntry: ToolTraceEntry = {
  callId: 'c1',
  tool: 'current_time',
  argsSummary: '当前时间',
  status: 'ok',
  durationMs: 120,
  resultSummary: '返回时间',
  startedAt: '2026-09-28T00:00:00.000Z',
  source: 'builtin',
  permission: 'read',
};

describe('ToolTrace 可观测性徽章（v0.6 M4）', () => {
  it('行内展示来源徽章（内置）与权限徽章（读）', () => {
    renderWithI18n(<ToolTrace trace={[baseEntry]} />);
    const row = screen.getByTestId('tool-trace-row');
    expect(row.textContent).toContain('内置');
    expect(row.textContent).toContain('120ms');
  });

  it('MCP 来源展示服务器名', () => {
    renderWithI18n(<ToolTrace trace={[{ ...baseEntry, source: 'mcp:filesystem', permission: 'write' }]} />);
    const row = screen.getByTestId('tool-trace-row');
    expect(row.textContent).toContain('MCP / filesystem');
    expect(row.textContent).toContain('写');
  });

  it('展开区显示来源与权限行', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ToolTrace trace={[baseEntry]} />);
    await user.click(screen.getByRole('button'));
    const dl = screen.getByText('来源').closest('dl')!;
    expect(dl.textContent).toContain('来源');
    expect(dl.textContent).toContain('权限');
  });

  it('M5 证据：行内标记 + 展开区展示来源/覆盖/未覆盖/采集时间', async () => {
    const user = userEvent.setup();
    const entry: ToolTraceEntry = {
      ...baseEntry,
      tool: 'web_search',
      resultSummary: 'mock · 2 条',
      evidence: {
        source: 'mock-search',
        coverage: '2 条结果',
        limitations: ['部分摘要截断至 300 字符'],
        capturedAt: '2026-11-02T08:00:00.000Z',
      },
    };
    renderWithI18n(<ToolTrace trace={[entry]} />);
    expect(screen.getByTestId('tool-trace-row').textContent).toContain('证据');

    await user.click(screen.getByRole('button'));
    const evidence = screen.getByTestId('tool-evidence');
    expect(evidence.textContent).toContain('mock-search');
    expect(evidence.textContent).toContain('2 条结果');
    expect(evidence.textContent).toContain('部分摘要截断至 300 字符');
    expect(evidence.textContent).toContain('采集于 2026-11-02 08:00:00');
  });

  it('无 source/permission 时不渲染徽章', () => {
    renderWithI18n(<ToolTrace trace={[{ ...baseEntry, source: undefined, permission: undefined }]} />);
    const row = screen.getByTestId('tool-trace-row');
    expect(row.textContent).not.toContain('内置');
  });
});

describe('ToolTrace flow 子步骤（v0.8 M3）', () => {
  const flowEntry: ToolTraceEntry = {
    ...baseEntry,
    callId: 'c2',
    tool: 'flow:b0000002-0000-4000-8000-000000000002',
    argsSummary: '',
    source: 'flow',
    substeps: [
      { id: 'start', label: '开始', status: 'ok' },
      { id: 'draft', label: '生成周报草稿', status: 'ok', detail: '周报草稿文本…' },
      { id: 'review', label: '人工确认', status: 'running' },
    ],
  };

  it('flow 工具显示「工作流」名 + 流程徽章 + 逐节点子步骤', () => {
    renderWithI18n(<ToolTrace trace={[flowEntry]} />);
    const row = screen.getByTestId('tool-trace-row');
    expect(row.textContent).toContain('工作流');
    expect(row.textContent).toContain('流程');
    const substeps = screen.getByTestId('tool-substeps');
    expect(substeps.textContent).toContain('开始');
    expect(substeps.textContent).toContain('生成周报草稿');
    expect(substeps.textContent).toContain('人工确认');
    expect(substeps.textContent).toContain('周报草稿文本…');
  });

  it('无子步骤时不渲染子步骤列表', () => {
    renderWithI18n(<ToolTrace trace={[baseEntry]} />);
    expect(screen.queryByTestId('tool-substeps')).toBeNull();
  });
});
