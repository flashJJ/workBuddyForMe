// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SkillInfo } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { SkillsPanel } from './skills-panel';

function makeSkill(partial: Partial<SkillInfo> & { id: string; name: string }): SkillInfo {
  return {
    id: partial.id,
    name: partial.name,
    enabled: partial.enabled ?? true,
    sourcePath: `/data/skills/${partial.name}`,
    manifest: partial.manifest ?? {
      name: partial.name,
      description: '描述',
      version: '1.0.0',
      permissions: ['read'],
      promptTemplates: [{ name: 't', order: 0, content: '内容' }],
      allowedTools: ['knowledge_search'],
      examples: [],
      author: 'WorkBuddy 内置',
    },
    error: partial.error ?? null,
    exists: partial.exists ?? true,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('技能包面板（v0.6 M3）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('列表：描述/版本/权限徽章/形态摘要展示；缺失源文件夹标红', async () => {
    fetchMock.mockResolvedValue(
      ok([
        makeSkill({ id: '1', name: 'weekly-report' }),
        makeSkill({
          id: '2',
          name: 'broken',
          enabled: false,
          exists: false,
          error: '源文件夹不存在',
          manifest: null,
        }),
      ]),
    );
    renderWithProviders(<SkillsPanel />);

    const list = await screen.findByTestId('skill-list');
    const items = within(list).getAllByTestId('skill-item');
    expect(items).toHaveLength(2);

    expect(items[0]!.textContent).toContain('描述');
    expect(items[0]!.textContent).toContain('weekly-report');
    expect(items[0]!.textContent).toContain('v1.0.0');
    expect(items[0]!.textContent).toContain('读');
    expect(items[0]!.textContent).toContain('提示词 · 1 个工具');

    expect(items[1]!.textContent).toContain('broken');
    expect(items[1]!.textContent).toContain('源文件夹不存在');
    const badSwitch = within(items[1]!).getByRole('checkbox');
    expect(badSwitch).toBeDisabled();
  });

  it('停用/启用切换 PATCH 后重刷列表', async () => {
    // Response body 只能消费一次：每次调用构造新实例；用闭包状态模拟服务端启停流转
    let enabled = true;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        enabled = (JSON.parse(init.body as string) as { enabled: boolean }).enabled;
        return Promise.resolve(ok(makeSkill({ id: '1', name: 'my-skill', enabled })));
      }
      return Promise.resolve(ok([makeSkill({ id: '1', name: 'my-skill', enabled })]));
    });
    const user = userEvent.setup();
    renderWithProviders(<SkillsPanel />);

    const list = await screen.findByTestId('skill-list');
    const item = within(list).getByTestId('skill-item');
    const checkbox = within(item).getByRole('checkbox');
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/skills/1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('删除引用：确认弹窗后 DELETE 并刷新', async () => {
    fetchMock.mockResolvedValue(
      ok([
        makeSkill({ id: '1', name: 'my-skill' }),
        makeSkill({ id: '2', name: 'bad-json', manifest: null, error: 'JSON 解析失败' }),
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<SkillsPanel />);

    const list = await screen.findByTestId('skill-list');
    const first = within(list).getAllByTestId('skill-item')[0]!;
    const deleteBtn = within(first).getByRole('button', { name: '删除' });

    fetchMock.mockResolvedValue(ok({ id: '1' }));
    window.confirm = vi.fn().mockReturnValue(true);
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/skills/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
