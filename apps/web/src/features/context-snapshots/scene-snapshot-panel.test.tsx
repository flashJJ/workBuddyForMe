// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import { SceneSnapshotPanel } from './scene-snapshot-panel';
import { summarizeSceneSnapshots, type SceneSnapshotEntry } from './scene-snapshot-events';

function payload(
  patch: Partial<SceneContextSnapshotPayload> = {},
): SceneContextSnapshotPayload {
  return {
    scene: 'collab_plan',
    role: 'planner',
    contextWindow: 4096,
    usableWindow: 3686,
    reserveTokens: 614,
    budgetTokens: 3008,
    promptTokens: 466,
    systemTokens: 200,
    inputTokens: 266,
    messageCount: 2,
    truncatedMessages: 0,
    droppedMessages: 0,
    truncated: false,
    ...patch,
  };
}

function entry(patch: Partial<SceneContextSnapshotPayload> = {}): SceneSnapshotEntry {
  return { value: payload(patch) };
}

function renderPanel(entries: SceneSnapshotEntry[]) {
  return render(
    <I18nProvider skipHydration>
      <SceneSnapshotPanel
        summary={summarizeSceneSnapshots(entries)}
        defaultOpen
        compact
      />
    </I18nProvider>,
  );
}

describe('SceneSnapshotPanel（v4.10）', () => {
  it('协作场景按 planner/executor/reviewer 展示最新行', () => {
    renderPanel([
      entry({ role: 'planner', scene: 'collab_plan', promptTokens: 400 }),
      entry({ role: 'executor', scene: 'collab_exec', promptTokens: 500 }),
      entry({ role: 'reviewer', scene: 'collab_review', promptTokens: 300 }),
    ]);
    expect(screen.getByTestId('scene-snapshot-collab_plan-planner')).toBeTruthy();
    expect(screen.getByTestId('scene-snapshot-collab_exec-executor')).toBeTruthy();
    expect(screen.getByTestId('scene-snapshot-collab_review-reviewer')).toBeTruthy();
    expect(screen.getByTestId('scene-snapshot-panel').textContent).toContain('上下文预算');
  });

  it('任务场景混合有角色与无角色快照时按场景分行', () => {
    renderPanel([
      entry({ scene: 'task_start', role: undefined, promptTokens: 58 }),
      entry({ scene: 'task_step', role: 'executor', promptTokens: 1139 }),
    ]);
    expect(screen.getByTestId('scene-snapshot-task_start')).toBeTruthy();
    expect(screen.getByTestId('scene-snapshot-task_step-executor')).toBeTruthy();
    const panel = screen.getByTestId('scene-snapshot-panel');
    expect(panel.textContent).toContain('启动上下文块');
    expect(panel.textContent).toContain('任务决策');
  });

  it('截断时展示警告与丢弃/截断条数', () => {
    renderPanel([
      entry({
        scene: 'task_step',
        role: undefined,
        truncated: true,
        truncatedMessages: 2,
        droppedMessages: 1,
      }),
    ]);
    const panel = screen.getByTestId('scene-snapshot-panel');
    expect(panel.textContent).toContain('已截断');
    expect(panel.textContent).toContain('丢弃 1 条');
    expect(panel.textContent).toContain('截断 2 条');
  });

  it('无快照时不渲染占位', () => {
    const { container } = renderPanel([]);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('scene-snapshot-panel')).toBeNull();
  });
});
