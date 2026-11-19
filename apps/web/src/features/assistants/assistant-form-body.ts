import { QUALIFIED_TOOL_NAME_PATTERN } from '@wbfm/shared/constants';
import type { AssistantBody } from '@/lib/hooks/assistant';

/** 助手表单状态（与 AssistantFormDialog 内部表单结构一致） */
export interface AssistantFormShape {
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  /** v1.8：当前选用角色卡 id；'' = 默认卡/原文模式 */
  cardId: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  modelId: string;
  /** v1.5：多选知识库 id */
  knowledgeBaseIds: string[];
  enabledTools: string[];
  /** v2.4 M4：助手级技能 name（空数组=跟随全局已启用技能） */
  skillNames: string[];
  retrieveAlways: boolean;
  memoryEnabled: boolean;
  expressionEnabled: boolean;
  /** v1.7：人格四权重 0..1 */
  personalityFrankness: number;
  personalityTsundere: number;
  personalityShy: number;
  personalityTolerance: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 数值输入框可能停留在 '-'、'.' 或空串；回退到安全默认值，避免 JSON 序列化成 null */
function finiteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: string[], limit: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || value.length > maxLength || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * 表单状态 → API 请求体。
 * 未关联任何知识库时自动剔除 knowledge_search，避免后端 422；
 * 数值与文本按服务端契约收敛，避免输入框中间态（'-'、'.'、超长）触发整单校验失败。
 */
export function buildAssistantBody(form: AssistantFormShape): AssistantBody {
  const knowledgeBaseIds = uniqueStrings(form.knowledgeBaseIds, 10, 200);
  const enabledTools = uniqueStrings(
    form.enabledTools.filter((tool) => QUALIFIED_TOOL_NAME_PATTERN.test(tool)),
    20,
    200,
  ).filter((tool) => knowledgeBaseIds.length > 0 || tool !== 'knowledge_search');
  const maxTokensValue = finiteNumber(form.maxTokens, 0);
  const body: AssistantBody = {
    name: form.name.trim().slice(0, 60),
    emoji: form.emoji.trim().slice(0, 8) || null,
    color: /^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : null,
    systemPrompt: form.systemPrompt.slice(0, 8000),
    temperature: clamp(finiteNumber(form.temperature, 1), 0, 2),
    topP: clamp(finiteNumber(form.topP, 1), 0, 1),
    maxTokens:
      form.maxTokens.trim() && maxTokensValue > 0
        ? clamp(Math.round(maxTokensValue), 1, 1_000_000)
        : null,
    modelId: form.modelId || null,
    knowledgeBaseIds,
    enabledTools,
    skillNames: uniqueStrings(form.skillNames, 20, 64),
    retrieveAlways: form.retrieveAlways,
    memoryEnabled: form.memoryEnabled,
    expressionEnabled: form.expressionEnabled,
    personalityFrankness: form.personalityFrankness,
    personalityTsundere: form.personalityTsundere,
    personalityShy: form.personalityShy,
    personalityTolerance: form.personalityTolerance,
  };
  // v1.8：选中卡片走卡模式；未选卡时由后端按非空原文自动包 identity 卡，空原文显式回默认卡
  if (form.cardId) {
    body.cardId = form.cardId;
  } else if (!form.systemPrompt.trim()) {
    body.cardId = null;
    body.systemPrompt = '';
  }
  return body;
}
