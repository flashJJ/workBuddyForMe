'use client';

import { MOTION_MAX_BYTES } from '@wbfm/shared/constants';
import type { MotionAssetUploadResponse } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssetImportSection } from './asset-import-section';

/** 待机动作导入向导：上传 → 校验 → 免责声明确认 → 落库 */

interface MotionMetaPreview {
  animationCount: number;
  generator?: string;
}

function sniffMotionMeta(json: Record<string, unknown>): MotionMetaPreview {
  const animations = (json.animations ?? []) as unknown[];
  const asset = (json.asset ?? {}) as { generator?: string };
  return {
    animationCount: animations.length,
    generator: typeof asset.generator === 'string' ? asset.generator : undefined,
  };
}

export function MotionImportSection() {
  const { t } = useI18n();
  return (
    <AssetImportSection<MotionMetaPreview, MotionAssetUploadResponse>
      config={{
        i18nPrefix: 'avatar.motion',
        testIdPrefix: 'motion',
        extension: '.vrma',
        maxBytes: MOTION_MAX_BYTES,
        endpoint: '/api/motions',
        queryKey: ['motions'],
        sniff: sniffMotionMeta,
        pickName: (data) => data.motion.name,
        renderMeta: (meta) => (
          <>
            <div>{t('avatar.motion.metaAnimCount')}: {meta.animationCount}</div>
            {meta.generator && <div>{t('avatar.motion.metaGenerator')}: {meta.generator}</div>}
          </>
        ),
      }}
    />
  );
}
