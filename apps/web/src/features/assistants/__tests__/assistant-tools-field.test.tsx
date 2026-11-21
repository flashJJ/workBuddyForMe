// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { McpToolInfo } from '@wbfm/shared/types';
import { AssistantToolsField } from '../assistant-tools-field';

const mcpTools: McpToolInfo[] = [
  {
    serverName: 'filesystem',
    name: 'read_file',
    qualifiedName: 'mcp:filesystem:read_file',
    description: '读取文件',
    inputSchema: {},
  },
  {
    serverName: 'filesystem',
    name: 'list_directory',
    qualifiedName: 'mcp:filesystem:list_directory',
    description: '列出目录',
    inputSchema: {},
  },
];

function renderField(
  enabledTools: string[],
  onToggleTool: (tool: string) => void,
  toolLimit = 128,
) {
  return render(
    <I18nProvider skipHydration>
      <AssistantToolsField
        enabledTools={enabledTools}
        hasKnowledgeBases={false}
        retrieveAlways={false}
        mcpTools={mcpTools}
        toolLimit={toolLimit}
        onToggleTool={onToggleTool}
        onRetrieveAlwaysChange={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('AssistantToolsField（MCP 分组全选）', () => {
  it('未选中时点组头全选，逐个开启该 MCP 的全部工具', async () => {
    const user = userEvent.setup();
    const onToggleTool = vi.fn();
    renderField([], onToggleTool);

    await user.click(screen.getByTestId('mcp-select-all-filesystem'));

    expect(onToggleTool).toHaveBeenCalledTimes(2);
    expect(onToggleTool).toHaveBeenCalledWith('mcp:filesystem:read_file');
    expect(onToggleTool).toHaveBeenCalledWith('mcp:filesystem:list_directory');
  });

  it('部分选中时点组头只补齐缺失工具，不取消已选', async () => {
    const user = userEvent.setup();
    const onToggleTool = vi.fn();
    renderField(['mcp:filesystem:read_file'], onToggleTool);

    await user.click(screen.getByTestId('mcp-select-all-filesystem'));

    expect(onToggleTool).toHaveBeenCalledTimes(1);
    expect(onToggleTool).toHaveBeenCalledWith('mcp:filesystem:list_directory');
  });

  it('全选后再次点击组头，关闭该 MCP 的全部工具', async () => {
    const user = userEvent.setup();
    const onToggleTool = vi.fn();
    renderField(
      ['mcp:filesystem:read_file', 'mcp:filesystem:list_directory'],
      onToggleTool,
    );

    await user.click(screen.getByTestId('mcp-select-all-filesystem'));

    expect(onToggleTool).toHaveBeenCalledTimes(2);
    expect(onToggleTool).toHaveBeenCalledWith('mcp:filesystem:read_file');
    expect(onToggleTool).toHaveBeenCalledWith('mcp:filesystem:list_directory');
  });

  it('达到上限时禁用未勾选项并提示，避免提交时静默截断（B-61）', () => {
    renderField(['current_time'], () => undefined, 1);
    expect(screen.getByRole('checkbox', { name: /联网搜索/ })).toBeDisabled();
    expect(screen.getByText(/最多选择 1 个工具/)).toBeInTheDocument();
  });
});
