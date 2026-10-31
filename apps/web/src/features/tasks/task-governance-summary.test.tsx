// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { AuditEventView, TaskRunView } from '@wbfm/shared/schemas';
import { TaskGovernanceSummary } from './task-governance-summary';

const task: TaskRunView = {
  id: 'run-1',
  conversationId: 'conv-1',
  assistantId: 'assistant-1',
  goal: '整理周报',
  status: 'completed',
  stepCount: 3,
  failureCount: 0,
  maxSteps: 20,
  stopReason: null,
  permissionMode: 'smart_approve',
  workspacePath: 'D:\\work\\demo',
  originScheduledTaskId: 'schedule-1',
  policyHash: 'a'.repeat(64),
  createdAt: '2026-10-31T00:00:00.000Z',
  updatedAt: '2026-10-31T00:00:01.000Z',
  finishedAt: '2026-10-31T00:00:01.000Z',
};

function event(seq: number, decision: AuditEventView['decision']): AuditEventView {
  return {
    id: `ev-${seq}`,
    seq,
    createdAt: '2026-10-31T00:00:00.000Z',
    kind: 'approval_granted',
    actor: 'user',
    runId: 'run-1',
    conversationId: null,
    tool: 'danger_tool',
    decision,
    reasonCode: null,
    policyHash: null,
    binding: null,
    outcome: null,
    prevHash: 'GENESIS',
    hash: 'h',
  };
}

function renderSummary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider skipHydration>
        <TaskGovernanceSummary task={task} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('TaskGovernanceSummary（v2.14）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('治理摘要：模式、脱敏工作目录、策略哈希前缀、来源定时任务', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { events: [], nextCursor: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderSummary();

    const summary = await screen.findByTestId('task-governance-run-1');
    expect(summary.textContent).toContain('智能审批');
    expect(summary.textContent).toContain('D:\\…\\demo');
    expect(summary.textContent).toContain('aaaaaaaaaaaa…');
    expect(summary.textContent).toContain('schedule-1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audit/events?runId=run-1&limit=10',
      expect.anything(),
    );
  });

  it('最近审计事件：渲染条目并显示空态', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { events: [event(2, 'allow'), event(1, 'ask')], nextCursor: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderSummary();

    await screen.findByTestId('task-audit-event-2');
    expect(screen.getByTestId('task-audit-event-1')).toBeTruthy();
    expect(screen.getAllByText('审批通过')).toHaveLength(2);
  });

  it('无关联事件时显示空态而不是错误', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { events: [], nextCursor: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderSummary();
    expect(await screen.findByTestId('task-audit-empty-run-1')).toBeTruthy();
  });
});
