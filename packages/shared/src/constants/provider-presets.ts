import type { ModelCapability } from './enums';
import type { ProviderProtocol } from './enums';

/**
 * v2.4 P0-1（T3）：常用 OpenAI 兼容厂商预置目录。
 * v2.17：扩展为厂商描述（发现策略 / Model ID 提示 / Key 作用域），供 UI 与服务端复用。
 * 只存 `baseUrl` 与模型名建议 + Key 申请直达；**不写价格、不做计费承诺**（页脚免责）。
 * 选厂商只是把表单填好，仍需用户自带 Key，也不引入账号与代管。
 */
export interface ProviderPresetModel {
  modelId: string;
  capabilities: ModelCapability[];
}

/** v2.17：模型发现策略；缺省按 openai-models 处理 */
export type VendorDiscovery = 'openai-models' | 'ollama-tags' | 'manual-only';

/** v2.17：Key 作用域；套餐 Key 不能与数据面 Key 混用 */
export type VendorKeyScope = 'data' | 'plan' | 'coding';

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  /** API Key 申请直达页 */
  keyUrl: string;
  models: ProviderPresetModel[];
  /** v2.17：协议；缺省 openai-compatible */
  protocol?: ProviderProtocol;
  /** v2.17：模型发现策略；缺省 openai-models */
  discovery?: VendorDiscovery;
  /** v2.17：不提供模型列表时，Model ID 该怎么填 */
  modelIdHint?: string;
  /** v2.17：套餐 Key 作用域 */
  keyScope?: VendorKeyScope;
  /** v2.17：展示给用户的补充说明 */
  notes?: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { modelId: 'deepseek-chat', capabilities: ['chat'] },
      { modelId: 'deepseek-reasoner', capabilities: ['chat'] },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: [
      { modelId: 'moonshot-v1-32k', capabilities: ['chat'] },
      { modelId: 'moonshot-v1-128k', capabilities: ['chat'] },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
    models: [
      { modelId: 'qwen-plus', capabilities: ['chat'] },
      { modelId: 'qwen-vl-plus', capabilities: ['chat', 'vision'] },
      { modelId: 'text-embedding-v3', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      { modelId: 'glm-4-plus', capabilities: ['chat'] },
      { modelId: 'embedding-3', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    models: [
      { modelId: 'Qwen/Qwen2.5-7B-Instruct', capabilities: ['chat'] },
      { modelId: 'BAAI/bge-m3', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    models: [{ modelId: 'openai/gpt-4o-mini', capabilities: ['chat', 'vision'] }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { modelId: 'gpt-4o-mini', capabilities: ['chat', 'vision'] },
      { modelId: 'text-embedding-3-small', capabilities: ['embedding'] },
    ],
  },
  {
    // 数据面：普通方舟 API Key；不提供模型列表时需在模型管理手填 Model ID
    id: 'volcengine-ark',
    name: '火山方舟（Ark）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey',
    models: [],
    discovery: 'openai-models',
    keyScope: 'data',
    modelIdHint: '可填 Model ID，或方舟推理接入点 ep-*',
    notes: '数据面 Key 不能与 Agent Plan / Coding Plan 套餐 Key 混用。',
  },
  {
    // Agent Plan 专属 Base URL 含 /plan，且必须使用套餐专属 Key，不能与普通方舟 Key 混用
    id: 'volcengine-agent-plan',
    name: '火山方舟 Agent Plan',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey',
    models: [],
    discovery: 'manual-only',
    keyScope: 'plan',
    modelIdHint: '请使用 Agent Plan 控制台给出的 Model ID',
    notes: '必须使用 Agent Plan 套餐专属 Key；Base URL 含 /plan。',
  },
  {
    id: 'volcengine-coding-plan',
    name: '火山方舟 Coding Plan',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey',
    models: [],
    discovery: 'manual-only',
    keyScope: 'coding',
    modelIdHint: '请使用 Coding Plan 控制台给出的 Model ID',
    notes: '必须使用 Coding Plan 套餐专属 Key；Base URL 含 /coding。',
  },
];
