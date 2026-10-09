'use client';

import * as React from 'react';
import type { McpToolInfo } from '@wbfm/shared/types';
import type { ToolName } from '@wbfm/shared/constants';
import type { MessageKey } from '@wbfm/shared/i18n';
import { TOOL_NAMES } from '@wbfm/shared/constants';
import { useI18n } from '@/lib/i18n/use-i18n';

const TOOL_LABEL_KEYS: Record<ToolName, MessageKey> = {
  current_time: 'assistants.tools.currentTime',
  knowledge_search: 'assistants.tools.knowledgeSearch',
  fetch_webpage: 'assistants.tools.fetchWebpage',
  screen_snapshot: 'assistants.tools.screenSnapshot',
  mouse_move: 'assistants.tools.mouseMove',
  mouse_click: 'assistants.tools.mouseClick',
  mouse_scroll: 'assistants.tools.mouseScroll',
  keyboard_type: 'assistants.tools.keyboardType',
  keyboard_press: 'assistants.tools.keyboardPress',
  window_list: 'assistants.tools.windowList',
  uia_list: 'assistants.tools.uiaList',
  window_focus: 'assistants.tools.windowFocus',
  app_launch: 'assistants.tools.appLaunch',
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
  const { t } = useI18n();
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
        {t('assistants.tools.legend')}
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
            <span>{t(TOOL_LABEL_KEYS[tool])}</span>
          </label>
        );
      })}
      {mcpGroups.map(([serverName, tools]) => (
        <div key={serverName} className="space-y-2 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('assistants.tools.mcpGroup', { name: serverName })}
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
            {t('assistants.tools.retrieveAlways')}
            <span className="ml-1 text-xs text-muted-foreground">
              {t('assistants.tools.retrieveAlwaysHint')}
            </span>
          </span>
        </label>
      )}
    </fieldset>
  );
}
