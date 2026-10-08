'use client';

import type { DebugToolInfo } from '@wbfm/core/tools';
import { Badge } from '@/components/ui/badge';
import { useToolDebugList } from '@/lib/hooks/use-tool-debug';
import { useFlows } from '@/lib/hooks/use-flows';
import { Field, JsonObjectEditor, Select, str, type NodeConfigFormProps } from './form-primitives';

const PERMISSION_LABEL: Record<string, string> = {
  read: '只读',
  write: '写入（需授权）',
  danger: '高危（需授权）',
};

interface ToolGroup {
  label: string;
  items: DebugToolInfo[];
}

/** 聚合工具目录：内置 / MCP / 已发布流程 */
function useToolCatalog(): { groups: ToolGroup[]; flowNames: Set<string> } {
  const debug = useToolDebugList();
  const flows = useFlows();
  const all = debug.data ?? [];
  const groups: ToolGroup[] = [];
  const builtin = all.filter((t) => t.source === 'builtin');
  if (builtin.length) groups.push({ label: '内置工具', items: builtin });
  for (const server of new Set(all.filter((t) => t.source.startsWith('mcp:')).map((t) => t.source))) {
    groups.push({ label: `MCP · ${server.slice(4)}`, items: all.filter((t) => t.source === server) });
  }
  const published = (flows.data ?? []).filter((w) => w.status === 'published');
  if (published.length) {
    groups.push({
      label: '流程工具',
      items: published.map((w) => ({
        name: `flow:${w.id}`,
        source: 'flow',
        permission: 'read' as const,
        description: w.description || `已发布流程：${w.name}`,
        parameters: {},
      })),
    });
  }
  return { groups, flowNames: new Set(published.map((w) => `flow:${w.id}`)) };
}

export function ToolForm({ config, patch }: NodeConfigFormProps) {
  const { groups } = useToolCatalog();
  const toolName = str(config.toolName);
  const selected = groups.flatMap((g) => g.items).find((t) => t.name === toolName);
  const args = (config.args ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-3">
      <Field label="工具">
        <Select value={toolName} onChange={(e) => patch({ toolName: e.target.value })}>
          <option value="">请选择工具</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {selected && (
        <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2">
          <div className="flex items-center gap-2">
            <Badge variant={selected.permission === 'read' ? 'outline' : 'warning'}>
              {PERMISSION_LABEL[selected.permission] ?? selected.permission}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{selected.source}</span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{selected.description}</p>
        </div>
      )}
      <Field
        label="工具参数（JSON）"
        hint="参数值可写引用字符串，运行前自动插值；高危工具试运行时会内联请求授权"
      >
        <JsonObjectEditor value={args} onChange={(nextArgs) => patch({ args: nextArgs })} />
      </Field>
    </div>
  );
}
