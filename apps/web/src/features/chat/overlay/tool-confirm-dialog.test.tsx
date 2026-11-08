// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ToolConfirmDialog } from './tool-confirm-dialog';

/** v1.4 T4.5：协作链路弹窗必须标明发起来源；Flow 上下文隐藏「一直允许」 */
describe('ToolConfirmDialog 协作来源标识', () => {
  it('origin=agent 时显示「协作任务·Executor 发起」标识', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        origin="agent"
        tool="mouse_click"
        permission="danger"
        argsSummary="{}"
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    expect(screen.getByTestId('tool-confirm-origin')).toBeInTheDocument();
    expect(screen.getByTestId('tool-confirm-origin').textContent).toContain('Executor');
  });

  it('非协作链路不显示来源标识', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="write_note"
        permission="write"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    expect(screen.queryByTestId('tool-confirm-origin')).not.toBeInTheDocument();
  });

  it('hideAllowAlways 时不渲染「一直允许」按钮', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        origin="agent"
        hideAllowAlways
        tool="keyboard_type"
        permission="danger"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    // 「一直允许」（助手级记住）在 Flow 协作门控中隐藏
    expect(screen.queryByRole('button', { name: '一直允许' })).not.toBeInTheDocument();
  });

  it('拒绝按钮触发 onSubmit deny', async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="mouse_click"
        permission="danger"
        argsSummary=""
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onSubmit).toHaveBeenCalledWith('deny');
  });
});

describe('ToolConfirmDialog 能力安装详情（v2.30）', () => {
  const details = {
    catalogId: 'com.example.sample.skill',
    name: '示例技能：日报',
    kind: 'skill',
    version: '1.0.0',
    source: 'bundled',
    installStrategy: 'bundled-pack',
    signatureStatus: 'valid',
    permissions: ['skill:install'],
    effects: ['新增技能提示词'],
    toolNames: ['current_time'],
  };

  it('默认精简展示来源、版本与新增工具数，展开区包含权限、效果与签名', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="capability_install"
        permission="write"
        argsSummary='{"catalogId":"com.example.sample.skill"}'
        details={details}
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    const panel = screen.getByTestId('capability-install-details');
    expect(panel.textContent).toContain('示例技能：日报');
    expect(panel.textContent).toContain('来源：bundled');
    expect(panel.textContent).toContain('版本：1.0.0');
    expect(panel.textContent).toContain('将新增 1 个工具');
    expect(panel.textContent).toContain('签名：valid');
    expect(panel.textContent).toContain('权限：skill:install');
    expect(panel.textContent).toContain('效果：新增技能提示词');
    expect(panel.textContent).toContain('current_time');
  });

  it('非能力安装（无 details）不渲染详情块', () => {
    renderWithProviders(
      <ToolConfirmDialog
        open
        tool="mouse_click"
        permission="danger"
        argsSummary="{}"
        submitting={false}
        taskScopeAvailable
        onOpenChange={() => undefined}
        onSubmit={async () => true}
      />,
    );
    expect(screen.queryByTestId('capability-install-details')).not.toBeInTheDocument();
  });
});
