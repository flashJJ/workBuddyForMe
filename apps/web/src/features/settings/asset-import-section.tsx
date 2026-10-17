'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { apiUpload } from '@/lib/api/client';
import type { MessageKey } from '@wbfm/shared/i18n';

/**
 * 资源导入向导的通用外壳（VRM 模型 / 待机动作 VRMA 共用）。
 *
 * 流程一致：选文件 → 扩展名/体积校验 → 本地嗅探 GLB JSON chunk → 免责声明确认 →
 * 上传落库 → 失效列表缓存。差异（扩展名/上限/接口/meta 渲染/表单字段）由 config 提供。
 */

/** 可选的上传标注字段（渲染在元数据预览与免责声明之间，值并入上传 FormData） */
export interface AssetExtraField {
  /** FormData 字段名 */
  name: string;
  labelKey: MessageKey;
  kind: 'select' | 'text';
  /** select 选项；value 为空串表示「不设/无」 */
  options?: Array<{ value: string; labelKey: MessageKey }>;
  /** 初值（select / text 共用） */
  defaultValue?: string;
  /** text 占位提示 */
  placeholderKey?: MessageKey;
}

export interface AssetImportConfig<TMeta, TResponse> {
  /** i18n 前缀（如 'avatar.vrm'）：需提供 importTitle/importHint/fileLabel/metaTitle/
   * disclaimerTitle/disclaimerText/disclaimerConfirm/importSuccess/importFailed/unsupportedType/tooLarge */
  i18nPrefix: string;
  /** data-testid 前缀（如 'vrm'）→ `<prefix>-import-section` / `-file-input` / `-disclaimer-checkbox` / `-import-confirm` */
  testIdPrefix: string;
  /** 允许的扩展名（小写含点，如 '.vrm'） */
  extension: string;
  /** 体积上限（字节） */
  maxBytes: number;
  /** 上传接口 */
  endpoint: string;
  /** 上传成功后失效的 queryKey */
  queryKey: readonly unknown[];
  /** 从 GLB JSON chunk 提取展示元数据；非目标格式返回 null */
  sniff: (json: Record<string, unknown>) => TMeta | null;
  /** 渲染元数据展示区 */
  renderMeta: (meta: TMeta) => React.ReactNode;
  /** 从上传响应取展示名（用于成功提示） */
  pickName: (response: TResponse) => string;
  /** 组装上传表单；缺省仅带 file（另会附加 extraFields 的取值） */
  buildForm?: (file: File, meta: TMeta | null) => FormData;
  /** 可选上传标注字段（如 VRMA 的动作段/档位/条目键/关系门槛） */
  extraFields?: AssetExtraField[];
}

/** 读取 GLB 的 JSON chunk（本地快速嗅探，不做完整校验） */
function readGlbJsonChunk(buffer: ArrayBuffer): Record<string, unknown> | null {
  try {
    const dv = new DataView(buffer);
    const jsonLength = dv.getUint32(12, true);
    const jsonBytes = new Uint8Array(buffer, 20, jsonLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AssetImportSection<TMeta, TResponse>({
  config,
}: {
  config: AssetImportConfig<TMeta, TResponse>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [meta, setMeta] = React.useState<TMeta | null>(null);
  const [disclaimerChecked, setDisclaimerChecked] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const key = (suffix: string) => `${config.i18nPrefix}.${suffix}` as MessageKey;

  /** 标注字段初值（每次成功上传后复位） */
  const initialExtras = (): Record<string, string> =>
    Object.fromEntries((config.extraFields ?? []).map((field) => [field.name, field.defaultValue ?? '']));
  const [extras, setExtras] = React.useState<Record<string, string>>(initialExtras);

  const uploadMutation = useMutation({
    mutationFn: (payload: { file: File; meta: TMeta | null; extras: Record<string, string> }) => {
      const formData = config.buildForm?.(payload.file, payload.meta) ?? new FormData();
      if (!config.buildForm) formData.append('file', payload.file);
      for (const [name, value] of Object.entries(payload.extras)) {
        if (value) formData.append(name, value);
      }
      return apiUpload<TResponse>(config.endpoint, formData);
    },
    onSuccess: (data) => {
      toast.success(t(key('importSuccess'), { name: config.pickName(data) }));
      setFile(null);
      setMeta(null);
      setDisclaimerChecked(false);
      setExtras(initialExtras());
      if (fileInputRef.current) fileInputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: config.queryKey });
    },
    onError: (err) => {
      toast.error(t(key('importFailed'), { message: err instanceof Error ? err.message : String(err) }));
    },
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(config.extension)) {
      toast.error(t(key('unsupportedType')));
      return;
    }
    if (selected.size > config.maxBytes) {
      toast.error(t(key('tooLarge')));
      return;
    }
    setFile(selected);
    setMeta(null);
    const reader = new FileReader();
    reader.onload = () => {
      const json = readGlbJsonChunk(reader.result as ArrayBuffer);
      setMeta(json ? config.sniff(json) : null);
    };
    reader.readAsArrayBuffer(selected);
  };

  const onImport = () => {
    if (!file || !disclaimerChecked) return;
    uploadMutation.mutate({ file, meta, extras });
  };

  const prefix = config.testIdPrefix;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid={`${prefix}-import-section`}>
      <div>
        <h4 className="text-sm font-medium">{t(key('importTitle'))}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{t(key('importHint'))}</p>
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={config.extension}
            className="hidden"
            data-testid={`${prefix}-file-input`}
            onChange={onFileChange}
          />
          <span className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            {t(key('fileLabel'))}
          </span>
          {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
        </label>

        {meta && (
          <div className="space-y-1 rounded border p-2 text-xs">
            <div className="font-medium">{t(key('metaTitle'))}</div>
            {config.renderMeta(meta)}
          </div>
        )}

        {file && config.extraFields && config.extraFields.length > 0 && (
          <div
            className="space-y-2 rounded border p-2 text-xs"
            data-testid={`${prefix}-extra-fields`}
          >
            {config.extraFields.map((field) => (
              <label key={field.name} className="flex items-center gap-2">
                <span className="text-muted-foreground">{t(field.labelKey)}</span>
                {field.kind === 'select' ? (
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    data-testid={`${prefix}-${field.name}`}
                    value={extras[field.name] ?? ''}
                    onChange={(e) =>
                      setExtras((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  >
                    {field.options?.map((option) => (
                      <option key={option.value || '__none'} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="w-40 rounded-md border px-2 py-1 text-xs"
                    data-testid={`${prefix}-${field.name}`}
                    placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                    value={extras[field.name] ?? ''}
                    onChange={(e) =>
                      setExtras((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        )}

        {file && (
          <div className="space-y-2 rounded border p-2">
            <div className="text-xs font-medium">{t(key('disclaimerTitle'))}</div>
            <p className="text-xs text-muted-foreground">{t(key('disclaimerText'))}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                data-testid={`${prefix}-disclaimer-checkbox`}
                checked={disclaimerChecked}
                onChange={(e) => setDisclaimerChecked(e.target.checked)}
              />
              <span className="text-xs">{t(key('disclaimerConfirm'))}</span>
            </label>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              data-testid={`${prefix}-import-confirm`}
              disabled={!disclaimerChecked || uploadMutation.isPending}
              onClick={onImport}
            >
              {uploadMutation.isPending ? '...' : t(key('importTitle'))}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
