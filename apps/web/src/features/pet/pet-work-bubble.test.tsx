// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { PetWorkView, WorkSignal } from '@wbfm/shared';
import { PetWorkBubble } from './pet-work-bubble';

const primary: WorkSignal = {
  key: 'flow:r1',
  source: 'flow',
  runId: 'r1',
  title: '发布流程',
  outcome: 'waiting',
  attention: 'input',
  activity: 'idle',
  stepLabel: 'review 等待人工审核',
  completedSteps: 1,
  totalSteps: null,
  startedAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:10.000Z',
  endedAt: null,
  errorReason: null,
  deepLink: '/flows/w1?run=r1',
};

const view: PetWorkView = {
  base: 'waiting',
  primary,
  runningCount: 1,
  approvalCount: 1,
  pulse: null,
  headline: '',
};

function renderBubble(props: Partial<React.ComponentProps<typeof PetWorkBubble>> = {}) {
  return render(
    <I18nProvider skipHydration>
      <PetWorkBubble
        view={view}
        mode="always"
        enabled
        connected
        reduceMotion={false}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('PetWorkBubble', () => {
  afterEach(cleanup);

  it('等待审批时显示主运行与计数', () => {
    renderBubble();
    const bubble = screen.getByTestId('pet-work-bubble');
    expect(bubble).toHaveAttribute('data-work-state', 'waiting');
    expect(bubble).toHaveAttribute('data-work-approvals', '1');
    expect(screen.getByText(/等待审批/)).toBeInTheDocument();
    expect(screen.getByText(/1 项待审批/)).toBeInTheDocument();
  });

  it('hidden 模式不渲染', () => {
    renderBubble({ mode: 'hidden' });
    expect(screen.queryByTestId('pet-work-bubble')).toBeNull();
  });

  it('断线时显示连接中断', () => {
    renderBubble({ connected: false });
    expect(screen.getByText('工作信号连接中断')).toBeInTheDocument();
  });
});
