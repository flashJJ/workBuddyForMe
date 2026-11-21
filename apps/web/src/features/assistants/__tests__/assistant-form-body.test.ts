import { describe, expect, it } from 'vitest';
import { ASSISTANT_KNOWLEDGE_BASES_MAX, ASSISTANT_SKILL_NAMES_MAX } from '@wbfm/shared/constants';
import { buildAssistantBody, type AssistantFormShape } from '../assistant-form-body';
import { emptyAssistantForm } from '../assistant-form-state';

function form(patch: Partial<AssistantFormShape> = {}): AssistantFormShape {
  return { ...emptyAssistantForm(), name: '代码评审员', ...patch };
}

describe('buildAssistantBody（表单 → API 契约收敛）', () => {
  it('数值输入中间态回退到安全值，不产生 null/NaN', () => {
    const body = buildAssistantBody(
      form({ temperature: '-', topP: '.', maxTokens: '0' }),
    );
    expect(body.temperature).toBe(1);
    expect(body.topP).toBe(1);
    expect(body.maxTokens).toBeNull();
  });

  it('数值钳制在服务端允许区间内', () => {
    const body = buildAssistantBody(
      form({ temperature: '9', topP: '-1', maxTokens: '99999999' }),
    );
    expect(body.temperature).toBe(2);
    expect(body.topP).toBe(0);
    expect(body.maxTokens).toBe(1_000_000);
  });

  it('名称、emoji、颜色与提示词按契约裁剪', () => {
    const body = buildAssistantBody(
      form({
        name: `  ${'名'.repeat(80)}  `,
        emoji: '  🤖  ',
        color: 'default',
        systemPrompt: 'x'.repeat(9000),
      }),
    );
    expect(body.name).toHaveLength(60);
    expect(body.emoji).toBe('🤖');
    expect(body.color).toBeNull();
    expect(body.systemPrompt).toHaveLength(8000);
  });

  it('过滤非法/重复工具；没有知识库时剔除 knowledge_search', () => {
    const body = buildAssistantBody(
      form({
        knowledgeBaseIds: [],
        enabledTools: [
          'current_time',
          'current_time',
          'bad tool',
          'mcp:server:tool',
          'knowledge_search',
        ],
      }),
    );
    expect(body.enabledTools).toEqual(['current_time', 'mcp:server:tool']);
  });

  it('有关联知识库时保留 knowledge_search', () => {
    const body = buildAssistantBody(
      form({ knowledgeBaseIds: ['kb-1'], enabledTools: ['current_time', 'knowledge_search'] }),
    );
    expect(body.enabledTools).toEqual(['current_time', 'knowledge_search']);
  });

  it('内置工具 + 多个 MCP 工具超过旧的 20 上限时不被截断（B-61）', () => {
    const enabledTools = [
      'current_time',
      'web_search',
      'fetch_webpage',
      'screen_snapshot',
      'mouse_move',
      'mouse_click',
      'mouse_scroll',
      'keyboard_type',
      'keyboard_press',
      'window_list',
      'uia_list',
      'window_focus',
      'app_launch',
      'artifact_write',
      'diagram_render',
      'capability_search',
      'capability_install',
      'capability_list',
      'mcp:filesystem:read_file',
      'mcp:filesystem:read_text_file',
      'mcp:filesystem:read_media_file',
      'mcp:filesystem:write_file',
      'mcp:filesystem:append_file',
    ];
    const body = buildAssistantBody(form({ enabledTools }));
    expect(body.enabledTools).toEqual(enabledTools);
  });

  it('技能与知识库去重、裁剪长度和数量', () => {
    const body = buildAssistantBody(
      form({
        skillNames: [' meeting-notes ', 'meeting-notes', '', 'x'.repeat(65)],
        knowledgeBaseIds: ['kb-1', 'kb-1', 'kb-2'],
      }),
    );
    expect(body.skillNames).toEqual(['meeting-notes']);
    expect(body.knowledgeBaseIds).toEqual(['kb-1', 'kb-2']);
  });

  it('技能与知识库超出上限时按共享常量截断（B-62）', () => {
    const body = buildAssistantBody(
      form({
        skillNames: Array.from({ length: ASSISTANT_SKILL_NAMES_MAX + 3 }, (_, i) => `skill-${i}`),
        knowledgeBaseIds: Array.from(
          { length: ASSISTANT_KNOWLEDGE_BASES_MAX + 2 },
          (_, i) => `kb-${i}`,
        ),
      }),
    );
    expect(body.skillNames).toHaveLength(ASSISTANT_SKILL_NAMES_MAX);
    expect(body.knowledgeBaseIds).toHaveLength(ASSISTANT_KNOWLEDGE_BASES_MAX);
  });

  it('未选卡且提示词为空时显式回默认卡', () => {
    const body = buildAssistantBody(form({ cardId: '', systemPrompt: '   ' }));
    expect(body.cardId).toBeNull();
    expect(body.systemPrompt).toBe('');
  });
});
