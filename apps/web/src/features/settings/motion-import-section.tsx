'use client';

import { MOTION_MAX_BYTES } from '@wbfm/shared/constants';
import type { MotionAssetUploadResponse } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssetImportSection, type AssetExtraField } from './asset-import-section';

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

/**
 * v2.2 可选标注：动作段 / 心情档位 / 条目键 / 关系门槛。
 *
 * 同「条目键」的多个文件会被聚合成一个三段式动作（缺段按契约退化：缺 A 直接进 B、缺 C 回待机）；
 * 不填则按整段（single）处理，与 v2.1 行为一致。
 */
const EXTRA_FIELDS: AssetExtraField[] = [
  {
    name: 'segment',
    labelKey: 'avatar.motion.segmentLabel',
    kind: 'select',
    defaultValue: 'single',
    options: [
      { value: 'single', labelKey: 'avatar.motion.segmentSingle' },
      { value: 'a_start', labelKey: 'avatar.motion.segmentAStart' },
      { value: 'b_loop', labelKey: 'avatar.motion.segmentBLoop' },
      { value: 'c_end', labelKey: 'avatar.motion.segmentCEnd' },
    ],
  },
  {
    name: 'mood',
    labelKey: 'avatar.motion.moodLabel',
    kind: 'select',
    defaultValue: 'normal',
    options: [
      { value: 'good', labelKey: 'avatar.motion.moodGood' },
      { value: 'normal', labelKey: 'avatar.motion.moodNormal' },
      { value: 'low', labelKey: 'avatar.motion.moodLow' },
    ],
  },
  {
    name: 'entryKey',
    labelKey: 'avatar.motion.entryKeyLabel',
    kind: 'text',
    placeholderKey: 'avatar.motion.entryKeyPlaceholder',
  },
  {
    name: 'minRelationshipLevel',
    labelKey: 'avatar.motion.minLevelLabel',
    kind: 'select',
    defaultValue: '',
    options: [
      { value: '', labelKey: 'avatar.motion.optionNone' },
      { value: '0', labelKey: 'relationship.level.0' },
      { value: '1', labelKey: 'relationship.level.1' },
      { value: '2', labelKey: 'relationship.level.2' },
      { value: '3', labelKey: 'relationship.level.3' },
    ],
  },
];

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
        extraFields: EXTRA_FIELDS,
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
