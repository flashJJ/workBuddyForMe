// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CharacterCardRecord } from '@wbfm/shared/character-card';
import { renderWithProviders } from '@/test/render';
import { CharacterCardsPanel } from './character-cards-panel';

function makeCard(partial: Partial<CharacterCardRecord> & { id: string }): CharacterCardRecord {
  return {
    source: 'custom',
    name: partial.id,
    description: '',
    rawMarkdown: '---\nname: x\n---\n',
    parsed: {
      name: partial.id,
      description: '',
      defaultEmotion: 'neutral',
      voice: null,
      identity: '',
      traits: [],
      speakingStyle: [],
      boundaries: [],
    },
    defaultEmotion: 'neutral',
    voice: null,
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const CARDS = [
  makeCard({ id: 'capable-colleague', source: 'builtin', name: '干练同事', description: '结果导向' }),
  makeCard({ id: 'c1', name: '我的卡', description: '自写人格' }),
];

describe('v1.8 角色卡库面板', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(ok(CARDS));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('内置/自建分区渲染：内置卡只有复制与导出，自建卡有编辑/删除', async () => {
    renderWithProviders(<CharacterCardsPanel />);
    const builtinList = await screen.findByTestId('character-card-builtin-list');
    const customList = screen.getByTestId('character-card-custom-list');
    expect(within(builtinList).getAllByTestId('character-card-row-capable-colleague')).toHaveLength(1);
    expect(customList.textContent).toContain('我的卡');

    const builtinRow = within(builtinList).getByTestId('character-card-row-capable-colleague');
    expect(within(builtinRow).queryByText('编辑')).toBeNull();
    expect(within(builtinRow).getByText('复制为自建卡')).toBeInTheDocument();
    expect(screen.getByText(/只导入你信任的卡/)).toBeInTheDocument();
  });

  it('新建卡：编辑器保存成功后 POST 原文并关闭', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(ok(CARDS))
      .mockResolvedValueOnce(ok(makeCard({ id: 'c2', name: '新卡' }), 201));
    renderWithProviders(<CharacterCardsPanel />);
    await screen.findByTestId('character-card-builtin-list');

    await user.click(screen.getByTestId('character-card-create'));
    const editor = screen.getByTestId('character-card-md');
    await user.clear(editor);
    await user.type(editor, '---\nname: 新卡\n---\n\n## 我是谁\n测试身份');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/character-cards',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('character-card-md')).not.toBeInTheDocument());
  });

  it('解析失败：422 诊断带行号内联展示，不关闭编辑器', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(ok(CARDS)).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '角色卡解析失败，请按诊断修改后重试',
            details: [{ code: 'frontmatterMissing', message: '文件必须以 --- 开头', line: 1 }],
          },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWithProviders(<CharacterCardsPanel />);
    await screen.findByTestId('character-card-builtin-list');

    await user.click(screen.getByTestId('character-card-create'));
    await user.clear(screen.getByTestId('character-card-md'));
    await user.type(screen.getByTestId('character-card-md'), '没有 frontmatter');
    await user.click(screen.getByRole('button', { name: '保存' }));

    const errors = await screen.findByTestId('character-card-errors');
    expect(errors.textContent).toContain('第 1 行');
    expect(errors.textContent).toContain('文件必须以');
    expect(screen.getByTestId('character-card-md')).toBeInTheDocument();
  });

  it('删除自建卡：确认后 DELETE，取消则不请求', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(ok(CARDS))
      .mockResolvedValue(ok({ id: 'c1' }));
    renderWithProviders(<CharacterCardsPanel />);
    const customList = await screen.findByTestId('character-card-custom-list');

    await user.click(within(customList).getByRole('button', { name: '删除：我的卡' }));
    // 先取消
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(within(customList).getByRole('button', { name: '删除：我的卡' }));
    const confirmDelete = async () => {
      const matches = await screen.findAllByRole('button', { name: '删除' });
      matches[matches.length - 1]!.click();
    };
    await confirmDelete();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/character-cards/c1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
