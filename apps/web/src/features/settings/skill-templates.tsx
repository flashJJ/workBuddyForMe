'use client';

import type { SkillInfo } from '@wbfm/shared/types';
import { TemplateGallery, type TemplateGalleryItem } from '@/components/common/template-gallery';
import { TemplateLauncher } from '@/components/common/template-launcher';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { useSkillMutations } from '@/lib/hooks/use-skills';
import { templatesOfKind } from '@/lib/templates/starter-templates';

const SKILL_TEMPLATES = templatesOfKind('skill');

/** 「以此开始」= 直接启用内置技能（技能是全局启停，内置不可删；M0 D5） */
function useSkillTemplateStart(skills: SkillInfo[] | undefined) {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useSkillMutations();

  return async (item: TemplateGalleryItem) => {
    const skill = (skills ?? []).find((entry) => entry.name === item.id);
    if (!skill) {
      toast.error(t('templates.toast.missing', { name: item.name }));
      return;
    }
    if (skill.enabled) {
      toast.success(t('templates.toast.enabledAlready', { name: item.name }));
      return;
    }
    try {
      await mutations.update.mutateAsync({ id: skill.id, body: { enabled: true } });
      toast.success(t('templates.toast.enabled', { name: item.name }));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'templates.toast.enableFailed' }));
    }
  };
}

function items(actionLabel: string): TemplateGalleryItem[] {
  return SKILL_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    recommended: template.recommended,
    actionLabel,
  }));
}

/** 面板顶部常驻可折叠入口 */
export function SkillsTemplateSection({ skills }: { skills: SkillInfo[] | undefined }) {
  const { t } = useI18n();
  const onStart = useSkillTemplateStart(skills);
  return (
    <TemplateLauncher count={SKILL_TEMPLATES.length} testId="skill-template-launcher">
      <TemplateGallery
        testId="skill-template"
        groups={[{ items: items(t('common.actions.enable')) }]}
        onStart={onStart}
      />
    </TemplateLauncher>
  );
}

/** 空态展示区（技能列表为空时） */
export function SkillsTemplateEmptyGallery({ skills }: { skills: SkillInfo[] | undefined }) {
  const { t } = useI18n();
  const onStart = useSkillTemplateStart(skills);
  return (
    <TemplateGallery
      testId="skill-template-empty"
      groups={[{ items: items(t('common.actions.enable')) }]}
      onStart={onStart}
    />
  );
}
