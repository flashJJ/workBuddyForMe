import type { ModelCapability } from './enums';

/**
 * v2.4 P0-1（T3）：常用 OpenAI 兼容厂商预置目录。
 * 只存 `baseUrl` 与模型名建议 + Key 申请直达；**不写价格、不做计费承诺**（页脚免责）。
 * 选厂商只是把表单填好，仍需用户自带 Key，也不引入账号与代管。
 */
export interface ProviderPresetModel {
  modelId: string;
  capabilities: ModelCapability[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  /** API Key 申请直达页 */
  keyUrl: string;
  models: ProviderPresetModel[];
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
];
