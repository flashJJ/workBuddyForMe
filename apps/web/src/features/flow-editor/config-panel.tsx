'use client';

import * as React from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';
import { NODE_META } from './node-meta';
import type { FlowCanvasNode } from './graph-utils';
import { str } from './config/form-primitives';
import { StartForm, HumanForm, EndForm } from './config/forms-basic';
import { LlmForm, KnowledgeForm } from './config/forms-llm';
import { ToolForm } from './config/forms-tool';
import { ConditionForm } from './config/forms-condition';
import type { NodeConfigFormProps } from './config/form-primitives';

interface ConfigPanelProps {
  node: FlowCanvasNode | null;
  nodes: FlowCanvasNode[];
  onChangeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function ConfigPanel({ node, nodes, onChangeConfig, onDelete, onClose }: ConfigPanelProps) {
  const { t } = useI18n();
  if (!node) return null;
  const meta = NODE_META[node.type];
  const config = node.data.config;

  const formProps: NodeConfigFormProps = {
    nodeId: node.id,
    config,
    nodes,
    onChange: (next) => onChangeConfig(node.id, next),
    patch: (partial) => onChangeConfig(node.id, { ...config, ...partial }),
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-card/40">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <meta.icon className={`h-4 w-4 ${meta.accent}`} />
        <div className="flex-1">
          <p className="text-sm font-medium leading-tight">
            {t('flowEditor.form.panelTitle', { name: t(meta.label) })}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">{node.id}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t('flowEditor.form.nodeName')}</label>
          <Input
            value={str(config.label)}
            onChange={(e) => onChangeConfig(node.id, { ...config, label: e.target.value })}
            placeholder={t(meta.label)}
            className="h-8 text-sm"
          />
        </div>
        {node.type === 'start' && <StartForm {...formProps} />}
        {node.type === 'llm' && <LlmForm {...formProps} />}
        {node.type === 'knowledgeSearch' && <KnowledgeForm {...formProps} />}
        {node.type === 'tool' && <ToolForm {...formProps} />}
        {node.type === 'condition' && <ConditionForm {...formProps} />}
        {node.type === 'human' && <HumanForm {...formProps} />}
        {node.type === 'end' && <EndForm {...formProps} />}
      </div>

      {node.type !== 'start' && node.type !== 'end' && (
        <div className="border-t p-3">
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="h-4 w-4" />
            {t('flowEditor.form.deleteNode')}
          </Button>
        </div>
      )}
    </aside>
  );
}
