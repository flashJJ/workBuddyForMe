'use client';

import { VRM_MAX_BYTES } from '@wbfm/shared/constants';
import type { VrmAvatarUploadResponse } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssetImportSection } from './asset-import-section';

/** VRM 导入向导：上传 → 校验 → 许可确认 → 落库 */

interface VrmMetaPreview {
  name?: string;
  author?: string;
  licenseUrl?: string;
  vrmVersion: '0.x' | '1.0';
}

function sniffVrmMeta(json: Record<string, unknown>): VrmMetaPreview {
  const extensions = (json.extensions ?? {}) as Record<string, { meta?: Record<string, unknown> }>;
  const meta = (extensions.VRMC_vrm?.meta ?? extensions.VRM?.meta ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : undefined);
  return {
    name: str('name'),
    author: str('author'),
    licenseUrl: str('licenseUrl'),
    vrmVersion: extensions.VRMC_vrm ? '1.0' : '0.x',
  };
}

export function VrmImportSection() {
  const { t } = useI18n();
  return (
    <AssetImportSection<VrmMetaPreview, VrmAvatarUploadResponse>
      config={{
        i18nPrefix: 'avatar.vrm',
        testIdPrefix: 'vrm',
        extension: '.vrm',
        maxBytes: VRM_MAX_BYTES,
        endpoint: '/api/vrm-avatars',
        queryKey: ['vrm-avatars'],
        sniff: sniffVrmMeta,
        pickName: (data) => data.avatar.name,
        buildForm: (file, meta) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('name', meta?.name ?? file.name.replace(/\.vrm$/i, ''));
          return formData;
        },
        renderMeta: (meta) => (
          <>
            {meta.name && <div>{meta.name}</div>}
            {meta.author && <div>{t('avatar.vrm.metaAuthor')}: {meta.author}</div>}
            <div>{t('avatar.vrm.metaVersion')}: {meta.vrmVersion}</div>
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
          </>
        ),
      }}
    />
  );
}
