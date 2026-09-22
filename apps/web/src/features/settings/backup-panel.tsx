'use client';

import * as React from 'react';
import { apiUpload, ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { BackupTrack, BackupPrecheck } from '@wbfm/shared';
import type { BackupRestoreResult } from '@wbfm/core';

const TRACK_OPTIONS: Array<{ value: BackupTrack; label: string; desc: string }> = [
  { value: 'conversations', label: '对话记录', desc: '全部对话与消息历史' },
  { value: 'knowledge', label: '知识库', desc: '知识库、文档与分片（向量不备份，恢复后需重建）' },
  { value: 'settings', label: '设置与凭证', desc: '默认模型、主题等；敏感凭证会被脱敏（[REDACTED]）' },
  { value: 'attachments', label: '图片附件', desc: '对话中的图片附件二进制文件' },
];

type RestoreResponse = { ok: true; precheck: BackupPrecheck; result: BackupRestoreResult };

export function BackupPanel() {
  const toast = useToast();
  const [selected, setSelected] = React.useState<BackupTrack[]>(['conversations', 'knowledge', 'settings', 'attachments']);
  const [exporting, setExporting] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const toggle = (track: BackupTrack) => {
    setSelected((prev) =>
      prev.includes(track) ? prev.filter((t) => t !== track) : [...prev, track],
    );
  };

  const exportDisabled = selected.length === 0 || exporting;

  const doExport = async () => {
    if (exportDisabled) return;
    setExporting(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tracks: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(
          body.error?.code ?? 'EXPORT_FAILED',
          body.error?.message ?? `导出失败（${res.status}）`,
          res.status,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition');
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? 'wbfm-backup.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('备份已导出');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    setRestoring(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiUpload<RestoreResponse>('/api/backup/restore', form);

      const r = resp.result;
      const parts: string[] = [];
      if (r.imported.conversations) parts.push(`${r.imported.conversations} 对话`);
      if (r.imported.messages) parts.push(`${r.imported.messages} 消息`);
      if (r.imported.knowledgeBases) parts.push(`${r.imported.knowledgeBases} 知识库`);
      if (r.imported.documents) parts.push(`${r.imported.documents} 文档`);
      if (r.imported.settings) parts.push('设置');
      if (r.imported.attachments) parts.push(`${r.imported.attachments} 附件`);

      const skippedParts: string[] = [];
      if (r.skipped.conversations) skippedParts.push(`${r.skipped.conversations} 对话（已存在或助手不存在）`);
      if (r.skipped.documents) skippedParts.push(`${r.skipped.documents} 文档`);

      let msg = `恢复完成：导入 ${parts.join('、') || '无'}`;
      if (skippedParts.length) msg += `，跳过 ${skippedParts.join('、')}`;

      toast.success(msg);

      // needs_reindex 提示
      if (r.imported.documents > 0) {
        toast.info(`${r.imported.documents} 个文档需重新索引向量（打开知识库手动重建）`);
      }

      // 脱敏警告
      if (resp.precheck.warnings.some((w) => w.includes('脱敏'))) {
        toast.info('敏感凭证已被脱敏，请在设置中重新填写');
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const details = error.details as { precheck?: BackupPrecheck } | undefined;
        if (details?.precheck?.warnings[0]) {
          toast.error(details.precheck.warnings[0]);
        }
      } else {
        toast.error(error instanceof ApiClientError ? error.message : '恢复失败');
      }
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="backup-panel">
      <h3 className="font-medium">数据备份与恢复</h3>
      <p className="text-xs text-muted-foreground">
        导出本地数据到 <code>.tar.gz</code> 归档，可跨机器迁移或作为备份恢复。知识库文档恢复后需重新索引向量。
      </p>

      {/* 导出区域 */}
      <div className="space-y-3 rounded-md border p-3">
        <Label>选择要导出的数据</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRACK_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-muted-foreground"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span>
                <span className="block font-medium leading-tight">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => void doExport()} disabled={exportDisabled}>
            {exporting ? '导出中...' : `导出备份（${selected.length} 轨）`}
          </Button>
        </div>
      </div>

      {/* 恢复区域 */}
      <div className="space-y-3 rounded-md border p-3">
        <Label>从归档恢复</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tar.gz,.tgz"
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground hover:file:bg-primary/90"
          onChange={onFileChange}
          disabled={restoring}
        />
        <p className="text-xs text-muted-foreground">
          支持 .tar.gz 格式，最大 500MB。恢复前会先检查版本兼容性与数据统计。
        </p>
      </div>
    </section>
  );
}
