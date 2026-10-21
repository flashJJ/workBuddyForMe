'use client';

import { TemplateGallery, type TemplateGalleryItem } from '@/components/common/template-gallery';
import { TemplateLauncher } from '@/components/common/template-launcher';
import { useI18n } from '@/lib/i18n/use-i18n';
import { STARTER_TEMPLATES } from '@/lib/templates/starter-templates';

const ASSISTANT_TEMPLATES = STARTER_TEMPLATES.filter((template) => template.kind === 'assistant');

/** 「以此开始」= 预填新建助手表单（不直接落库，改完再保存；M0 D5） */
function toItem(
  template: (typeof ASSISTANT_TEMPLATES)[number],
  actionLabel: string,
): TemplateGalleryItem {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    recommended: template.recommended,
    actionLabel,
  };
}

/** 助手预设内部按用途分组（M0 D6：唯一分组处） */
function useAssistantGroups() {
  const { t } = useI18n();
  const actionLabel = t('templates.start');
  const research = ASSISTANT_TEMPLATES.filter((template) => template.id === 'assistant-research');
  const office = ASSISTANT_TEMPLATES.filter((template) => template.id !== 'assistant-research');
  return [
    { label: t('templates.group.research'), items: research.map((item) => toItem(item, actionLabel)) },
    { label: t('templates.group.office'), items: office.map((item) => toItem(item, actionLabel)) },
  ];
}

type OnPick = (item: TemplateGalleryItem) => void;

/** 页面顶部常驻可折叠入口 */
export function AssistantsTemplateSection({ onPick }: { onPick: OnPick }) {
  const groups = useAssistantGroups();
  return (
    <TemplateLauncher count={ASSISTANT_TEMPLATES.length} testId="assistant-template-launcher">
      <TemplateGallery testId="assistant-template" groups={groups} onStart={onPick} />
    </TemplateLauncher>
  );
}

/** 空态展示区 */
export function AssistantsTemplateEmptyGallery({ onPick }: { onPick: OnPick }) {
  const groups = useAssistantGroups();
  return <TemplateGallery testId="assistant-template-empty" groups={groups} onStart={onPick} />;
}
