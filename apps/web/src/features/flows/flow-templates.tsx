'use client';

import { TemplateGallery, type TemplateGalleryItem } from '@/components/common/template-gallery';
import { TemplateLauncher } from '@/components/common/template-launcher';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { useFlowMutations } from '@/lib/hooks/use-flows';
import { templatesOfKind } from '@/lib/templates/starter-templates';

const FLOW_TEMPLATES = templatesOfKind('flow');

/** 「以此开始」= 复制为可编辑草稿（保留节点图、另存新 id；M0 D5） */
function useFlowTemplateStart() {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useFlowMutations();

  return async (item: TemplateGalleryItem) => {
    try {
      await mutations.clone.mutateAsync({
        id: item.id,
        name: t('templates.cloneSuffix', { name: item.name }),
      });
      toast.success(t('templates.toast.cloned', { name: item.name }));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'templates.toast.cloneFailed' }));
    }
  };
}

function items(actionLabel: string): TemplateGalleryItem[] {
  return FLOW_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    recommended: template.recommended,
    actionLabel,
  }));
}

/** 列表顶部常驻可折叠入口 */
export function FlowsTemplateLauncher() {
  const { t } = useI18n();
  const onStart = useFlowTemplateStart();
  return (
    <div className="mb-4">
      <TemplateLauncher count={FLOW_TEMPLATES.length} testId="flow-template-launcher">
        <TemplateGallery
          testId="flow-template-side"
          groups={[{ items: items(t('templates.start')) }]}
          onStart={onStart}
        />
      </TemplateLauncher>
    </div>
  );
}

/** 空态展示区 */
export function FlowsTemplateEmptyGallery() {
  const { t } = useI18n();
  const onStart = useFlowTemplateStart();
  return (
    <div className="mt-4 w-full max-w-4xl">
      <TemplateGallery
        testId="flow-template-empty"
        groups={[{ items: items(t('templates.start')) }]}
        onStart={onStart}
      />
    </div>
  );
}
