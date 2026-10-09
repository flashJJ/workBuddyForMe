/** 对话域：分片/RAG 检索、上下文 token 预算、历史压缩与流式超时 */

/** 知识库默认分片参数 */
export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 80;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 4000;

/** RAG 默认检索条数 */
export const DEFAULT_TOP_K = 4;

/**
 * v0.5 Token 预算（对话历史按预算组装）：
 * 模型未配置 contextWindow 时的兜底上下文预算。
 */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 8192;
/**
 * 预算安全系数：字符粗估与模型真实 tokenizer 存在偏差（中文/JSON/代码普遍低估），
 * 所有区块按 contextWindow×0.9 做硬上限，给真实分词与消息结构留余量。
 */
export const CONTEXT_BUDGET_SAFETY_RATIO = 0.9;
/** RAG 资料块单段值得注入的最小 token 预算；剩余空间小于此值宁可不注入资料 */
export const RAG_CHUNK_MIN_TOKENS = 96;
/**
 * Ollama 运行时默认上下文窗口（num_ctx 默认值；与架构上限无关）。
 * /api/tags 的 details.context_length 是模型训练上限（如 qwen2.5=32768），
 * 不是服务端实际 num_ctx（默认 4096），模型发现时必须用此值，否则会向
 * 4096 窗口发 3 万 token 请求触发 exceed_context_size_error。
 */
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 4096;
/** 历史条数安全帽：token 预算裁剪之外的极端长会话兜底 */
export const HISTORY_MESSAGE_SAFETY_CAP = 200;
/** 为模型回答预留的输出 token（无上次真实 usage 时使用） */
export const OUTPUT_RESERVE_TOKENS = 2048;

/**
 * 回合后旁路任务（对话摘要压缩 + 长期记忆提取）的整体超时。
 * 这些任务在 done 之后异步执行，不阻塞用户；超时主动中止，防止后台 LLM 调用悬挂。
 */
export const POST_TURN_JOBS_TIMEOUT_MS = 120_000;
/**
 * 流式对话的块间空闲超时：响应头到达后，若该时长内没有任何增量数据则判上游挂起。
 * 连接超时只覆盖首字节，本常量覆盖生成中途卡死（本地模型高负载/长上下文场景）。
 */
export const CHAT_STREAM_IDLE_TIMEOUT_MS = 120_000;

/**
 * v0.5 对话自动压缩（递归摘要）：
 * 历史占用超过历史预算的该比例时触发摘要压缩；
 * 最近逐字消息保留历史预算的该比例（至少保护 COMPACTION_MIN_KEEP_MESSAGES 条）；
 * SUMMARY_BLOCK_RESERVE 为注入 system 的摘要块预留空间。
 */
export const COMPACTION_TRIGGER_RATIO = 0.7;
export const COMPACTION_KEEP_RATIO = 0.5;
export const COMPACTION_MIN_KEEP_MESSAGES = 4;
export const SUMMARY_BLOCK_RESERVE_TOKENS = 512;

/** 外部请求默认超时（ms），SSE 不设短超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/**
 * 聊天流式请求的连接建立超时（响应头到达前）：
 * 本地大模型冷加载（如 qwen2.5-vl 7B 约 6GB 装载）首字节可能超 60s，
 * 仅在响应头迟迟不到时才触发；连不上/DNS 失败仍会立即报错。
 */
export const CHAT_CONNECT_TIMEOUT_MS = 180_000;
