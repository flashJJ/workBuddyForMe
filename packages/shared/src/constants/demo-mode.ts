/**
 * v2.4 M1 演示模式（零配置首启）冻结常量。
 *
 * 演示模式 = 内置一个 id 固定的 `demo` 供应商 + 两个 mock 模型，让「不填任何 Key」
 * 也能完成首次对话；对话/嵌入经 provider-adapter 注入进程内 mock，不外发、不下载。
 * 与 e2e 的 `WBFM_MOCK_AI=1` 复用同一套 mock 实现（packages/ai/src/mock-provider.ts）。
 */
export const DEMO_PROVIDER_ID = 'demo';
export const DEMO_PROVIDER_NAME = '演示模式（Demo）';
/** mock 供应商的占位 baseUrl（不参与真实请求，仅满足供应商记录必填） */
export const DEMO_BASE_URL = 'demo://local';
/** 演示模式自动建好的两个模型 id（与 mock provider 的 listModels 返回值对齐） */
export const DEMO_CHAT_MODEL_ID = 'mock-chat';
export const DEMO_EMBED_MODEL_ID = 'mock-embed';
