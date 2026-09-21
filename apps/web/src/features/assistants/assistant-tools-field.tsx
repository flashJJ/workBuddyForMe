'use client';

import * as React from 'react';
import type { ToolName } from '@wbfm/shared';
import { TOOL_NAMES } from '@wbfm/shared';

const TOOL_LABELS: Record<ToolName, string> = {
  current_time: '当前时间（回答时间/日期类问题）',
  knowledge_search: '知识库检索（需先关联知识库）',
  fetch_webpage: '读取网页（模型可抓取链接内容）',
};

interface Props {
  enabledTools: ToolName[];
  knowledgeBaseId: string;
  retrieveAlways: boolean;
  onToggleTool: (tool: ToolName) => void;
  onRetrieveAlwaysChange: (value: boolean) => void;
}

/** 助手编辑表单中的工具白名单 + 自动检索开关区块 */
export function AssistantToolsField({
  enabledTools,
  knowledgeBaseId,
  retrieveAlways,
  onToggleTool,
  onRetrieveAlwaysChange,
}: Props) {
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
