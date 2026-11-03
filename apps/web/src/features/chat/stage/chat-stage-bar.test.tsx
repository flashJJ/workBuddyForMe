// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { StagePlan } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { ChatStageBar } from './chat-stage-bar';

const mocks = vi.hoisted(() => ({
  plan: null as StagePlan | null,
  save: vi.fn(async (_plan: StagePlan) => ({ plan: null, modelId: null })),
  prepare: vi.fn(async () => ({ taskText: 'TASK TEXT', modelId: null, stepIndex: 0 })),
}));

vi.mock('./use-stage-plan', () => ({
  useStagePlan: () => ({
    plan: mocks.plan,
    isLoading: false,
    save: { mutateAsync: mocks.save, isPending: false },
    prepare: { mutateAsync: mocks.prepare, isPending: false },
  }),
}));

vi.mock('@/lib/hooks/provider', () => ({ useAllModels: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/capability', () => ({ useSkills: () => ({ data: [] }) }));

const PLAN: StagePlan = {
  activeStep: 0,
  steps: [
    { title: '调研', modelId: null, skillNames: [], goal: '整理竞品', deliverables: '' },
    { title: '执行', modelId: null, skillNames: [], goal: '', deliverables: '' },
  ],
};

function renderBar(overrides: Partial<React.ComponentProps<typeof ChatStageBar>> = {}) {
  return renderWithProviders(
    <ChatStageBar
      conversationId="c1"
      streaming={false}
      draft=""
      conversationModelId={null}
      assistantModelId={null}
      defaultModelId={null}
      onTaskPrepared={() => undefined}
      {...overrides}
    />,
  );
}

describe('v2.20 M5 阶段条', () => {
  beforeEach(() => {
    mocks.plan = PLAN;
    mocks.save.mockClear();
    mocks.prepare.mockClear();
  });

  it('无计划不渲染；有计划渲染不超过 8 个阶段 chip', () => {
    mocks.plan = null;
    renderBar();
    expect(screen.queryByTestId('chat-stage-bar')).toBeNull();

    mocks.plan = { ...PLAN, steps: Array.from({ length: 8 }, (_, i) => ({ ...PLAN.steps[0]!, title: `阶段${i}` })) };
    renderBar();
    expect(screen.getByTestId('chat-stage-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stage-chip-7')).toBeInTheDocument();
  });

  it('载入任务写入草稿且不自动发送；非空草稿被阻止', async () => {
    const onTaskPrepared = vi.fn();
    renderBar({ onTaskPrepared });
    fireEvent.click(screen.getByTestId('stage-load-task'));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith(0));
    expect(onTaskPrepared).toHaveBeenCalledWith('TASK TEXT');

    mocks.prepare.mockClear();
    renderBar({ onTaskPrepared, draft: '已有内容' });
    fireEvent.click(screen.getAllByTestId('stage-load-task').at(-1)!);
    await waitFor(() =>
      expect(screen.getByText('输入框已有内容，先发送或清空再载入任务')).toBeInTheDocument(),
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('运行中锁定编辑/载入；切阶段写入 activeStep', async () => {
    renderBar({ streaming: true });
    expect(screen.getByTestId('stage-edit')).toBeDisabled();
    expect(screen.getByTestId('stage-load-task')).toBeDisabled();

    renderBar();
    fireEvent.click(screen.getAllByTestId('stage-chip-1').at(-1)!);
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({ activeStep: 1 });
  });
});
