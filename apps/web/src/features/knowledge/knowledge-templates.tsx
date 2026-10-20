'use client';

import { STARTER_KNOWLEDGE_BASES } from '@wbfm/shared/constants';
import { TemplateGallery, type TemplateGalleryItem } from '@/components/common/template-gallery';
import { TemplateLauncher } from '@/components/common/template-launcher';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';
import { templatesOfKind } from '@/lib/templates/starter-templates';

const KB_TEMPLATES = templatesOfKind('knowledge');

/** 「以此开始」= 复制为自建库（内置只读，副本可改名/可删；M0 D5） */
function useKnowledgeTemplateStart() {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useKnowledgeMutations();

  return async (item: TemplateGalleryItem) => {
    const seed = STARTER_KNOWLEDGE_BASES.find((kb) => kb.id === item.id);
    try {
      await mutations.create.mutateAsync({
        name: t('templates.cloneSuffix', { name: item.name }),
        description: seed?.description ?? item.description,
        chunkSize: seed?.chunkSize,
        chunkOverlap: seed?.chunkOverlap,
      });
      toast.success(t('templates.toast.cloned', { name: item.name }));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'templates.toast.cloneFailed' }));
    }
  };
}

function items(actionLabel: string): TemplateGalleryItem[] {
  return KB_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    recommended: template.recommended,
    actionLabel,
  }));
}

/** 侧栏顶部常驻可折叠入口（紧凑单列） */
export function KnowledgeTemplateLauncher() {
  const { t } = useI18n();
  const onStart = useKnowledgeTemplateStart();
  return (
    <TemplateLauncher count={KB_TEMPLATES.length} testId="kb-template-launcher">
      <TemplateGallery
        compact
        testId="kb-template-side"
        groups={[{ items: items(t('templates.start')) }]}
        onStart={onStart}
      />
    </TemplateLauncher>
  );
}

/** 空态展示区（仅空态露一次） */
export function KnowledgeTemplateEmptyGallery() {
  const { t } = useI18n();
  const onStart = useKnowledgeTemplateStart();
  return (
    <div className="mt-4 w-full max-w-2xl">
      <TemplateGallery
        testId="kb-template-empty"
        groups={[{ items: items(t('templates.start')) }]}
        onStart={onStart}
      />
    </div>
  );
}
