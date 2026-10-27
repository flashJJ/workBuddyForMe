// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  MeetingActionItemRecord,
  MeetingConclusionRecord,
  MeetingConclusionView,
} from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { MeetingConclusionPanel } from './meeting-conclusion-panel';

vi.mock('@/lib/hooks/use-flows', () => ({
  useFlows: () => ({
    data: [
      { id: 'f1', name: '跟进 Flow', status: 'published' },
      { id: 'f2', name: '草稿 Flow', status: 'draft' },
    ],
  }),
}));

const conclusion: MeetingConclusionRecord = {
  meetingId: 'm1',
  summary: '采用方案 A',
  decisions: ['先做后端'],
  openQuestions: ['UI 排期'],
  modelId: null,
  generatedAt: '2026-10-01T02:00:00.000Z',
  editedAt: null,
};

function makeItem(partial: Partial<MeetingActionItemRecord> = {}): MeetingActionItemRecord {
  return {
    id: 'i1',
    meetingId: 'm1',
    content: '补测试',
    ownerLabel: '第二成员',
    ownerMemberId: 'a2',
    dueAt: '2099-11-01T01:30:00.000Z',
    status: 'open',
    source: 'generated',
    sourceTurnId: null,
    linkedReminderId: null,
    linkedFlowRunId: null,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-01T02:00:00.000Z',
    ...partial,
  };
}

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('会议结论面板（v2.6 M3）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let view: MeetingConclusionView;

  const replaceItem = (itemId: string, patch: Partial<MeetingActionItemRecord>) => {
    view = {
      ...view,
      actionItems: view.actionItems.map((item) =>
        item.id === itemId ? { ...item, ...patch, updatedAt: '2026-10-03T00:00:00.000Z' } : item,
      ),
    };
    return view.actionItems.find((item) => item.id === itemId)!;
  };

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url === '/api/meetings/m1/conclusion') {
        if (method === 'GET') return ok(view);
        if (method === 'POST') {
          view = { conclusion: { ...conclusion }, actionItems: view.actionItems };
          return ok(view);
        }
        if (method === 'PATCH') {
          view = {
            ...view,
            conclusion: { ...(view.conclusion ?? conclusion), ...body, editedAt: '2026-10-05T00:00:00.000Z' },
          };
          return ok(view);
        }
      }
      if (url.startsWith('/api/meetings/m1/action-items/')) {
        const itemId = url.split('/')[5]!;
        const action = url.split('/')[6];
        if (method === 'PATCH' && !action) {
          return ok(replaceItem(itemId, body as Partial<MeetingActionItemRecord>));
        }
        if (method === 'POST' && action === 'to-reminder') {
          const item = replaceItem(itemId, { linkedReminderId: 'r1' });
          return ok({ reminder: { id: 'r1' }, actionItem: item });
        }
        if (method === 'POST' && action === 'run-flow') {
          const item = replaceItem(itemId, { linkedFlowRunId: 'run-1' });
          return ok({ runId: 'run-1', workflowId: body.workflowId, actionItem: item });
        }
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const render = () =>
    renderWithProviders(
      <MeetingConclusionPanel meetingId="m1" members={[{ id: 'a2', name: '第二成员' }]} />,
    );

  it('展示已有结论、行动项状态与闭环标记', async () => {
    view = {
      conclusion,
      actionItems: [
        makeItem({
          status: 'done',
          linkedReminderId: 'r1',
          linkedFlowRunId: 'run-0',
        }),
      ],
    };
    render();

    expect(await screen.findByText('采用方案 A')).toBeInTheDocument();
    expect(screen.getByText('先做后端')).toBeInTheDocument();
    expect(screen.getByText('UI 排期')).toBeInTheDocument();
    const row = screen.getByTestId('meeting-action-item');
    expect(row).toHaveAttribute('data-status', 'done');
    expect(within(row).getByText('已完成')).toBeInTheDocument();
    expect(within(row).getByText(/已转提醒/)).toBeInTheDocument();
    expect(within(row).getByText(/已运行 Flow/)).toBeInTheDocument();
  });

  it('空结论展示入口，生成后渲染摘要', async () => {
    view = { conclusion: null, actionItems: [] };
    const user = userEvent.setup();
    render();

    expect(await screen.findByText('会议已结束，生成结论把讨论沉淀下来。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成结论' }));
    expect(await screen.findByText('采用方案 A')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/m1/conclusion',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('编辑结论：保存后展示人工摘要', async () => {
    view = { conclusion, actionItems: [] };
    const user = userEvent.setup();
    render();

    await screen.findByText('采用方案 A');
    await user.click(screen.getByRole('button', { name: '编辑' }));
    const summary = screen.getByLabelText('摘要');
    await user.clear(summary);
    await user.type(summary, '人工结论');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('人工结论')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/m1/conclusion',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('行动项勾选完成：PATCH 状态并更新徽标', async () => {
    view = { conclusion, actionItems: [makeItem()] };
    const user = userEvent.setup();
    render();

    const row = await screen.findByTestId('meeting-action-item');
    await user.click(within(row).getByRole('button', { name: '标记完成' }));
    await waitFor(() =>
      expect(screen.getByTestId('meeting-action-item')).toHaveAttribute('data-status', 'done'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/m1/action-items/i1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('行动项转提醒与运行 Flow：确认后回链', async () => {
    view = { conclusion, actionItems: [makeItem()] };
    const user = userEvent.setup();
    render();

    const row = await screen.findByTestId('meeting-action-item');
    await user.click(within(row).getByRole('button', { name: '转提醒' }));
    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: '转提醒' }));
    await waitFor(() =>
      expect(within(screen.getByTestId('meeting-action-item')).getByText(/已转提醒/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/m1/action-items/i1/to-reminder',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assistantId: 'a2', timezone: 'Asia/Shanghai' }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(
      within(screen.getByTestId('meeting-action-item')).getByRole('button', { name: '运行 Flow' }),
    );
    const flowDialog = await screen.findByRole('dialog');
    await user.click(within(flowDialog).getByRole('button', { name: '运行 Flow' }));
    await waitFor(() =>
      expect(within(screen.getByTestId('meeting-action-item')).getByText(/已运行 Flow/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetings/m1/action-items/i1/run-flow',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workflowId: 'f1' }),
      }),
    );
  });
});
