'use client';

import * as React from 'react';
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import type { VoiceModelKind } from '@wbfm/voice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ModelDownloadView } from './use-voice-model-downloads';

interface Props {
  kind: VoiceModelKind;
  name: string;
  description: string;
  totalBytes: number;
  view: ModelDownloadView;
  onStart: () => void;
  onCancel: () => void;
  /** testid 后缀（TTS 双引擎区分：tts-kokoro / tts-melo）；缺省用 kind */
  testIdKey?: string;
  /** 当前设置选中的引擎（在卡头标注「使用中」并高亮描边） */
  active?: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function StateBadge({ view }: { view: ModelDownloadView }) {
  if (view.ready)
    return (
      <Badge variant="success" data-testid="voice-model-state">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        已就绪
      </Badge>
    );
  if (view.status === 'downloading' || view.active)
    return (
      <Badge variant="warning" data-testid="voice-model-state">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        下载中 {Math.round(view.ratio * 100)}%
      </Badge>
    );
  if (view.status === 'error')
    return (
      <Badge variant="danger" data-testid="voice-model-state">
        <XCircle className="mr-1 h-3 w-3" />
        下载失败
      </Badge>
    );
  return (
    <Badge variant="outline" data-testid="voice-model-state">
      未下载
    </Badge>
  );
}

/** 单个语音模型（ASR/TTS）的下载管理卡：状态徽章 + 进度条 + 开始/取消/重试 */
export function VoiceModelCard({
  kind,
  name,
  description,
  totalBytes,
  view,
  onStart,
  onCancel,
  testIdKey,
  active = false,
}: Props) {
  const busy = view.active || view.status === 'downloading';
  const key = testIdKey ?? kind;
  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${active ? 'border-primary/60 ring-1 ring-primary/30' : ''}`}
      data-testid={`voice-model-card-${key}`}
      data-active={active || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{name}</span>
            {active && (
              <Badge variant="outline" className="shrink-0" data-testid={`voice-model-active-${key}`}>
                使用中
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <StateBadge view={view} />
      </div>

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(2, Math.round(view.ratio * 100))}%` }}
              data-testid="voice-model-progress"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatBytes(view.bytesDone)} / {formatBytes(view.bytesTotal || totalBytes)}
          </p>
        </div>
      )}

      {view.error && !busy && (
        <p className="break-all text-xs text-destructive" title={view.error}>
          {view.error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">约 {formatBytes(totalBytes)}</span>
        {view.ready ? (
          !busy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onStart}
              data-testid={`voice-model-redownload-${key}`}
            >
              重新下载
            </Button>
          )
        ) : busy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid={`voice-model-cancel-${key}`}
          >
            取消
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStart}
            data-testid={`voice-model-start-${key}`}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            {view.status === 'error' ? '重试' : '下载'}
          </Button>
        )}
      </div>
    </div>
  );
}
