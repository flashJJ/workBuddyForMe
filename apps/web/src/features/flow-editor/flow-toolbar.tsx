'use client';

import Link from 'next/link';
import { ArrowLeft, Globe, Play, Save, ShieldCheck } from 'lucide-react';
import type { FlowStatus, WorkflowView } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_BADGE: Record<FlowStatus, { label: string; variant: 'outline' | 'success' | 'default' }> = {
  draft: { label: '草稿', variant: 'outline' },
  published: { label: '已发布', variant: 'success' },
  disabled: { label: '已停用', variant: 'outline' },
};

interface FlowToolbarProps {
  workflow: WorkflowView;
  version: number;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  running: boolean;
  diagnosticCount: number | null;
  onSave: () => void;
  onValidate: () => void;
  onPublish: () => void;
  onServing: () => void;
  onRun: () => void;
}

export function FlowToolbar({
  workflow,
  version,
  dirty,
  saving,
  publishing,
  running,
  diagnosticCount,
  onSave,
  onValidate,
  onPublish,
  onServing,
  onRun,
}: FlowToolbarProps) {
  const badge = STATUS_BADGE[workflow.status];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
      <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="返回列表">
        <Link href="/flows">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{workflow.name}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-[11px] text-muted-foreground">v{version}</span>
          {dirty && <span className="text-[11px] text-warning">未保存</span>}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {diagnosticCount !== null && (
          <Button variant="ghost" size="sm" onClick={onValidate} title="重新校验">
            {diagnosticCount === 0 ? (
              <span className="text-xs text-success">校验通过</span>
            ) : (
              <span className="text-xs text-destructive">{diagnosticCount} 个问题</span>
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onValidate}>
          校验
        </Button>
        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
          <Save className="h-3.5 w-3.5" />
          保存
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPublish}
          disabled={publishing || version === 0 || dirty}
          title={dirty ? '请先保存改动' : version === 0 ? '请先保存流程图' : '发布为可被对话调用的工具'}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          发布
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onServing}
          disabled={workflow.status !== 'published'}
          title={workflow.status === 'published' ? '管理本地 API / MCP 对外暴露' : '发布后可开启对外服务'}
        >
          <Globe className="h-3.5 w-3.5" />
          对外服务
        </Button>
        <Button size="sm" onClick={onRun} disabled={running || version === 0 || dirty}>
          <Play className="h-3.5 w-3.5" />
          试运行
        </Button>
      </div>
    </header>
  );
}
