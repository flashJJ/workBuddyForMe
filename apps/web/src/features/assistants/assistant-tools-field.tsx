'use client';

import * as React from 'react';
import type { McpToolInfo, ToolName } from '@wbfm/shared';
import { TOOL_NAMES } from '@wbfm/shared';

const TOOL_LABELS: Record<ToolName, string> = {
  current_time: '当前时间（回答时间/日期类问题）',
  knowledge_search: '知识库检索（需先关联知识库）',
  fetch_webpage: '读取网页（模型可抓取链接内容）',
  screen_snapshot: '屏幕截图（需桌面端，视觉模型可解读）',
};

interface Props {
  /** v0.6：白名单元素可为 MCP 限定名（由外层渲染对应分组） */
  enabledTools: string[];
  knowledgeBaseId: string;
  retrieveAlways: boolean;
  /** 已连接 MCP 服务器的工具（按服务器分组展示） */
  mcpTools: McpToolInfo[];
  onToggleTool: (tool: string) => void;
  onRetrieveAlwaysChange: (value: boolean) => void;
}

/** 助手编辑表单中的工具白名单 + 自动检索开关区块 */
export function AssistantToolsField({
  enabledTools,
  knowledgeBaseId,
  retrieveAlways,
  mcpTools,
  onToggleTool,
  onRetrieveAlwaysChange,
}: Props) {
  const mcpGroups = React.useMemo(() => {
    const groups = new Map<string, McpToolInfo[]>();
    for (const tool of mcpTools) {
      const list = groups.get(tool.serverName) ?? [];
      list.push(tool);
      groups.set(tool.serverName, list);
    }
    return [...groups.entries()];
  }, [mcpTools]);

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        允许使用的工具（需模型支持工具调用）
      </legend>
      {TOOL_NAMES.map((tool) => {
        const disabled = tool === 'knowledge_search' && !knowledgeBaseId;
        return (
          <label
            key={tool}
            className={`flex items-center gap-2 text-sm ${
              disabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={enabledTools.includes(tool)}
              disabled={disabled}
              onChange={() => onToggleTool(tool)}
            />
            <span>{TOOL_LABELS[tool]}</span>
          </label>
        );
      })}
      {mcpGroups.map(([serverName, tools]) => (
        <div key={serverName} className="space-y-2 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            MCP 服务器「{serverName}」
          </p>
          {tools.map((tool) => (
            <label key={tool.qualifiedName} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={enabledTools.includes(tool.qualifiedName)}
                onChange={() => onToggleTool(tool.qualifiedName)}
              />
              <span>
                <span className="block font-mono leading-tight">{tool.name}</span>
                {tool.description && (
                  <span className="block text-xs text-muted-foreground">{tool.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      ))}
      {knowledgeBaseId && (
        <label className="flex cursor-pointer items-center gap-2 border-t pt-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={retrieveAlways}
            onChange={(e) => onRetrieveAlwaysChange(e.target.checked)}
          />
          <span>
            每轮自动检索知识库
            <span className="ml-1 text-xs text-muted-foreground">
              （关闭后仅在模型调用检索工具时检索）
            </span>
          </span>
        </label>
      )}
    </fieldset>
  );
}
