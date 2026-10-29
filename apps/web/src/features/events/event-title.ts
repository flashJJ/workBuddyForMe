import type { MessageKey } from '@wbfm/shared/i18n';
import type { EventDefinition } from '@wbfm/shared/schemas';

/** v2.11：内置剧本用 i18n 键，能力包安装剧本用字面量标题 */
export function eventTitle(
  def: Pick<EventDefinition, 'title' | 'titleKey'>,
  t: (key: MessageKey) => string,
): string {
  if (def.title) return def.title;
  return def.titleKey ? t(def.titleKey as MessageKey) : '';
}
