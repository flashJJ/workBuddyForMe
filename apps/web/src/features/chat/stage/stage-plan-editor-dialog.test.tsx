// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { StagePlan } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { StagePlanEditorDialog } from './stage-plan-editor-dialog';

const PLAN: StagePlan = {
  activeStep: 0,
  steps: [{ title: '', modelId: null, skillNames: [], goal: '', deliverables: '' }],
};

describe('v2.20 M5 阶段编辑对话框', () => {
  it('标题为空禁用保存；填写后可保存', () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <StagePlanEditorDialog
        open
        onOpenChange={() => undefined}
        plan={PLAN}
        models={[]}
        skills={[]}
        saving={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('stage-editor-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('stage-editor-title-0'), {
      target: { value: '调研' },
    });
    expect(screen.getByTestId('stage-editor-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('stage-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        activeStep: 0,
        steps: [expect.objectContaining({ title: '调研' })],
      }),
    );
  });

  it('最多 8 阶段、至少保留 1 阶段；删除阶段同步 activeStep', () => {
    const plan: StagePlan = {
      activeStep: 1,
      steps: Array.from({ length: 8 }, (_, index) => ({
        title: `阶段${index}`,
        modelId: null,
        skillNames: [],
        goal: '',
        deliverables: '',
      })),
    };
    renderWithProviders(
      <StagePlanEditorDialog
        open
        onOpenChange={() => undefined}
        plan={plan}
        models={[]}
        skills={[]}
        saving={false}
        error="服务端拒绝"
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByTestId('stage-editor-add')).toBeDisabled();
    expect(screen.getByTestId('stage-editor-remove-0')).toBeEnabled();
    fireEvent.click(screen.getByTestId('stage-editor-remove-0'));
    expect(screen.queryByTestId('stage-editor-row-7')).toBeNull();
    expect(screen.getByText('服务端拒绝')).toBeInTheDocument();
  });
});
