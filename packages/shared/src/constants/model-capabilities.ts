import type { ModelCapability } from './enums';

/**
 * 按模型 ID 推断能力（v1.2：修复远端「+」添加一律标 chat 的问题）。
 *
 * 背景：OpenAI 兼容 /v1/models 与 Ollama /api/tags 只返回模型名，不带能力；
 * 历史上前端添加时无条件写 ['chat']，导致 qwen3-embedding 等嵌入模型被错标，
 * 默认向量模型下拉过滤不到。这里集中维护启发式规则，供添加表单/后端兜底共用。
 *
 * 规则优先级：embedding 命中即 embedding-only（嵌入模型不能对话）；
 * vision 模型（vl/llava 等）默认可对话 → chat+vision；其余 → chat。
 * 用户仍可在表单手动勾选覆盖（推断只作默认值）。
 */

/** 嵌入模型命名特征（大小写不敏感子串） */
const EMBEDDING_PATTERNS = [
  /embed/i, // qwen3-embedding、nomic-embed-text、jina-embeddings、arctic-embed
  /bge/i, // bge-m3 / bge-large / bge-small
  /gte[-_:]/i, // gte-large / gte_qwen2
  /m3e/i, // m3e-base / m3e-large
  /all-minilm/i,
];

/** 视觉模型命名特征 */
const VISION_PATTERNS = [
  /\bvl\b/i, // qwen2.5-vl / minicpm-v / qwen2-vl（词边界，避免误伤普通词）
  /vl\d*[-_:]/i, // qwen2.5vl:7b 这类无分隔符直接跟标签的写法
  /vision/i,
  /visual/i,
  /llava/i,
  /internvl/i,
  /minicpm[-_]?v/i,
];

export function inferModelCapabilities(modelId: string): ModelCapability[] {
  const id = modelId.trim();
  if (EMBEDDING_PATTERNS.some((re) => re.test(id))) {
    return ['embedding'];
  }
  if (VISION_PATTERNS.some((re) => re.test(id))) {
    return ['chat', 'vision'];
  }
  return ['chat'];
}
