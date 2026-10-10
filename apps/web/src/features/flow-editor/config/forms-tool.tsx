'use client';

import type { DebugToolInfo } from '@wbfm/core/tools';
import { Badge } from '@/components/ui/badge';
import { useToolDebugList } from '@/lib/hooks/use-tool-debug';
import { useFlows } from '@/lib/hooks/use-flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Field, JsonObjectEditor, Select, str, type NodeConfigFormProps } from './form-primitives';

const PERMISSION_LABEL: Record<string, MessageKey> = {
  read: 'flowEditor.form.tool.permission.read',
  write: 'flowEditor.form.tool.permission.write',
  danger: 'flowEditor.form.tool.permission.danger',
};

function PermBadge({ permission }: { permission: string }) {
  const { t } = useI18n();
  const key = PERMISSION_LABEL[permission];
  return (
    <Badge variant={permission === 'read' ? 'outline' : 'warning'}>
      {key ? t(key) : permission}
    </Badge>
  );
}

interface ToolGroup {
  label: string;
  items: DebugToolInfo[];
}

/** 聚合工具目录：内置 / MCP / 已发布流程 */
function useToolCatalog(): { groups: ToolGroup[]; flowNames: Set<string> } {
  const { t } = useI18n();
  const debug = useToolDebugList();
  const flows = useFlows();
  const all = debug.data ?? [];
  const groups: ToolGroup[] = [];
  const builtin = all.filter((tool) => tool.source === 'builtin');
  if (builtin.length) groups.push({ label: t('flowEditor.form.tool.groupBuiltin'), items: builtin });
  for (const server of new Set(all.filter((tool) => tool.source.startsWith('mcp:')).map((tool) => tool.source))) {
    groups.push({ label: `MCP · ${server.slice(4)}`, items: all.filter((tool) => tool.source === server) });
  }
  const published = (flows.data ?? []).filter((w) => w.status === 'published');
  if (published.length) {
    groups.push({
      label: t('flowEditor.form.tool.groupFlows'),
      items: published.map((w) => ({
        name: `flow:${w.id}`,
        source: 'flow',
        permission: 'read' as const,
        description: w.description || t('flowEditor.form.tool.flowDesc', { name: w.name }),
        parameters: {},
      })),
    });
  }
  return { groups, flowNames: new Set(published.map((w) => `flow:${w.id}`)) };
}

export function ToolForm({ config, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const { groups } = useToolCatalog();
  const toolName = str(config.toolName);
  const selected = groups.flatMap((g) => g.items).find((tool) => tool.name === toolName);
  const args = (config.args ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.tool.toolLabel')}>
        <Select value={toolName} onChange={(e) => patch({ toolName: e.target.value })}>
          <option value="">{t('flowEditor.form.tool.toolPlaceholder')}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {selected && (
        <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2">
          <div className="flex items-center gap-2">
            <PermBadge permission={selected.permission} />
            <span className="text-[11px] text-muted-foreground">{selected.source}</span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{selected.description}</p>
        </div>
      )}
      <Field
        label={t('flowEditor.form.tool.argsLabel')}
        hint={t('flowEditor.form.tool.argsHint')}
      >
        <JsonObjectEditor value={args} onChange={(nextArgs) => patch({ args: nextArgs })} />
      </Field>
    </div>
  );
}
