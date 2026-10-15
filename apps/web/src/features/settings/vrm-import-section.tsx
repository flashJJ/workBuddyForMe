'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { apiUpload } from '@/lib/api/client';
import type { VrmAvatarUploadResponse } from '@wbfm/shared/schemas';
import { VRM_MAX_BYTES } from '@wbfm/shared/constants';

/** VRM 导入向导：上传 → 校验 → 许可确认 → 落库 */
export function VrmImportSection() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [meta, setMeta] = React.useState<{
    name?: string;
    author?: string;
    licenseUrl?: string;
    vrmVersion?: string;
  } | null>(null);
  const [disclaimerChecked, setDisclaimerChecked] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; name: string }) => {
      const formData = new FormData();
      formData.append('file', payload.file);
      formData.append('name', payload.name);
      return apiUpload<VrmAvatarUploadResponse>('/api/vrm-avatars', formData);
    },
    onSuccess: (data) => {
      toast.success(t('avatar.vrm.importSuccess', { name: data.avatar.name }));
      setFile(null);
      setMeta(null);
      setDisclaimerChecked(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['vrm-avatars'] });
    },
    onError: (err) => {
      toast.error(t('avatar.vrm.importFailed', { message: err instanceof Error ? err.message : String(err) }));
    },
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.vrm')) {
      toast.error(t('avatar.vrm.unsupportedType'));
      return;
    }
    if (selected.size > VRM_MAX_BYTES) {
      toast.error(t('avatar.vrm.tooLarge'));
      return;
    }
    setFile(selected);
    // 本地快速嗅探 meta（不依赖服务端）
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const dv = new DataView(buf);
        const jsonLength = dv.getUint32(12, true);
        const jsonBytes = new Uint8Array(buf, 20, jsonLength);
        const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
          extensions?: Record<string, { meta?: Record<string, unknown> }>;
        };
        const m = (json.extensions?.VRMC_vrm?.meta ?? json.extensions?.VRM?.meta ?? {}) as Record<string, unknown>;
        setMeta({
          name: (m.name as string | undefined) ?? undefined,
          author: (m.author as string | undefined) ?? undefined,
          licenseUrl: (m.licenseUrl as string | undefined) ?? undefined,
          vrmVersion: json.extensions?.VRMC_vrm ? '1.0' : '0.x',
        });
      } catch {
        setMeta(null);
      }
    };
    reader.readAsArrayBuffer(selected);
  };

  const onImport = () => {
    if (!file || !disclaimerChecked) return;
    uploadMutation.mutate({ file, name: meta?.name ?? file.name.replace(/\.vrm$/i, '') });
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="vrm-import-section">
      <div>
        <h4 className="text-sm font-medium">{t('avatar.vrm.importTitle')}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{t('avatar.vrm.importHint')}</p>
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            className="hidden"
            data-testid="vrm-file-input"
            onChange={onFileChange}
          />
          <span className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            {t('avatar.vrm.fileLabel')}
          </span>
          {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
        </label>

        {meta && (
          <div className="space-y-1 rounded border p-2 text-xs">
            <div className="font-medium">{t('avatar.vrm.metaTitle')}</div>
            {meta.name && <div>{meta.name}</div>}
            {meta.author && (
              <div>
                {t('avatar.vrm.metaAuthor')}: {meta.author}
              </div>
            )}
            {meta.vrmVersion && (
              <div>
                {t('avatar.vrm.metaVersion')}: {meta.vrmVersion}
              </div>
            )}
            {meta.licenseUrl && (
              <div>
                {t('avatar.vrm.metaLicense')}:{' '}
                <a
                  href={meta.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {meta.licenseUrl}
                </a>
              </div>
            )}
          </div>
        )}

        {file && (
          <div className="space-y-2 rounded border p-2">
            <div className="text-xs font-medium">{t('avatar.vrm.disclaimerTitle')}</div>
            <p className="text-xs text-muted-foreground">{t('avatar.vrm.disclaimerText')}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                data-testid="vrm-disclaimer-checkbox"
                checked={disclaimerChecked}
                onChange={(e) => setDisclaimerChecked(e.target.checked)}
              />
              <span className="text-xs">{t('avatar.vrm.disclaimerConfirm')}</span>
            </label>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              data-testid="vrm-import-confirm"
              disabled={!disclaimerChecked || uploadMutation.isPending}
              onClick={onImport}
            >
              {uploadMutation.isPending ? '...' : t('avatar.vrm.importTitle')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
