// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { SkillInfo } from '@wbfm/shared/types';
import { AssistantSkillsField } from '../assistant-skills-field';

const { skills } = vi.hoisted(() => ({
  skills: [
    { id: 's1', name: 'skill-1', description: '技能 1' },
    { id: 's2', name: 'skill-2', description: '技能 2' },
  ],
}));

vi.mock('@/lib/hooks/capability', () => ({
  useSkills: () => ({
    data: skills.map((skill) => ({
      ...skill,
      enabled: true,
      sourcePath: `/skills/${skill.name}`,
      error: null,
      exists: true,
      manifest: {
        name: skill.name,
        description: skill.description,
        version: '1.0.0',
        permissions: [],
        promptTemplates: [],
        allowedTools: [],
        examples: [],
      },
    })) satisfies SkillInfo[],
  }),
}));

describe('AssistantSkillsField（上限保护）', () => {
  it('达到上限时禁用未勾选技能并提示，避免提交时被静默截断（B-62）', () => {
    render(
      <I18nProvider skipHydration>
        <AssistantSkillsField value={['skill-1']} limit={1} onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(screen.getByRole('checkbox', { name: /skill-1/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /skill-2/ })).toBeDisabled();
    expect(screen.getByText(/最多选择 1 个技能/)).toBeInTheDocument();
  });
});
