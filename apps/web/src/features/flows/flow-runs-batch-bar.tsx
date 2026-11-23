'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';

interface FlowRunsBatchBarProps {
  selectedCount: number;
  mode: 'snapshot' | 'latest';
  nodeMode: 'whole' | 'failed_node';
  pending: boolean;
  onModeChange: (mode: 'snapshot' | 'latest') => void;
  onNodeModeChange: (mode: 'whole' | 'failed_node') => void;
  onReplay: () => void;
  onClear: () => void;
}

/** v5.0 运行中心批量重放工具条（≤20） */
export function FlowRunsBatchBar(props: FlowRunsBatchBarProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-6 py-2 text-xs">
      <span className="font-medium">
        {t('flowRuns.batch.selected', { count: props.selectedCount })}
      </span>
      <SimpleSelect
        className="h-8 rounded-md border bg-ui-control px-2"
        value={props.mode}
        onValueChange={(value) => props.onModeChange(value as 'snapshot' | 'latest')}
      >
        <option value="snapshot">{t('flowRuns.batch.mode.snapshot')}</option>
        <option value="latest">{t('flowRuns.batch.mode.latest')}</option>
      </SimpleSelect>
      <SimpleSelect
        className="h-8 rounded-md border bg-ui-control px-2"
        value={props.nodeMode}
        onValueChange={(value) => props.onNodeModeChange(value as 'whole' | 'failed_node')}
      >
        <option value="failed_node">{t('flowRuns.batch.nodeMode.failedNode')}</option>
        <option value="whole">{t('flowRuns.batch.nodeMode.whole')}</option>
      </SimpleSelect>
      <Button
        size="sm"
        className="h-8"
        disabled={props.pending || props.selectedCount === 0}
        onClick={props.onReplay}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('flowRuns.batch.replay')}
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={props.onClear}>
        {t('flowRuns.batch.clear')}
      </Button>
    </div>
  );
}
