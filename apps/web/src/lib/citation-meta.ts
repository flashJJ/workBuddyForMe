/**
 * 引用元信息格式化（v1.3 M3）：静态层标签 + 页/段坐标。
 *
 * 纯函数，聊天 UI（useI18n 的 t）与分享导出（share-i18n 的 ShareTranslate）
 * 共用同一套 MessageKey，保证界面与导出文案一致。坐标全部可空：
 * 有页有段→「第 N 页 · 第 M 段」；仅有页/段→降级单坐标；都无→空串。
 */

import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import type { Citation } from '@wbfm/shared/types';

type Translate = (key: MessageKey, vars?: MessageVars) => string;

export interface CitationMeta {
  /** 静态知识层标签（实体知识/文档要点）；普通分片为空串 */
  kindLabel: string;
  /** 页/段定位文本；无坐标为空串 */
  location: string;
}

export function formatCitationMeta(
  citation: Pick<Citation, 'pageNo' | 'paragraphNo' | 'staticKind'>,
  t: Translate,
): CitationMeta {
  const kindLabel =
    citation.staticKind === 'entity'
      ? t('share.citeEntityLabel')
      : citation.staticKind === 'summary'
        ? t('share.citeSummaryLabel')
        : '';

  const page = citation.pageNo ?? null;
  const para = citation.paragraphNo ?? null;
  let location = '';
  if (page !== null && para !== null) {
    location = t('share.citeLocationPagePara', { page: String(page), para: String(para) });
  } else if (page !== null) {
    location = t('share.citeLocationPage', { page: String(page) });
  } else if (para !== null) {
    location = t('share.citeLocationPara', { para: String(para) });
  }
  return { kindLabel, location };
}
