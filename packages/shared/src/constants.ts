/** 跨模块共享常量 */

export const PROVIDER_PROTOCOLS = ['openai-compatible', 'ollama'] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

/** vision = 图片视觉理解（v0.3）；chat/embedding/vision 可叠加在同一模型上 */
export const MODEL_CAPABILITIES = ['chat', 'embedding', 'vision'] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['streaming', 'completed', 'error', 'stopped'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** v0.5 P1-2：助手消息用户反馈 */
export const MESSAGE_FEEDBACKS = ['up', 'down'] as const;
export type MessageFeedback = (typeof MESSAGE_FEEDBACKS)[number];

/** v0.4：partial = OCR 部分成功（超时/超页只识别了部分页面，文本可检索但不完整） */
export const DOCUMENT_STATUSES = ['pending', 'processing', 'indexed', 'failed', 'partial'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** v0.4 OCR 状态：null=非扫描件未走 OCR；running=识别中；done=完成；failed=失败；skipped=检测为扫描件但无可用引擎 */
export const OCR_STATUSES = ['running', 'done', 'failed', 'skipped'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

/** v0.4 OCR 引擎：vision=视觉模型逐页识别；tesseract=WASM 离线兜底 */
export const OCR_ENGINES = ['vision', 'tesseract'] as const;
export type OcrEngine = (typeof OCR_ENGINES)[number];

/** v0.3 文档来源：本地上传 / 网页剪藏 */
export const DOCUMENT_SOURCES = ['upload', 'webpage'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

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
/** 历史条数安全帽：token 预算裁剪之外的极端长会话兜底 */
export const HISTORY_MESSAGE_SAFETY_CAP = 200;
/** 为模型回答预留的输出 token（无上次真实 usage 时使用） */
export const OUTPUT_RESERVE_TOKENS = 2048;

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

/**
 * v0.5 长期记忆：
 * - 提问时按用户消息向量检索 MEMORY_TOP_K 条，L2 距离（单位向量）超过
 *   MEMORY_RECALL_MAX_DISTANCE 的丢弃——归一化向量 L2≈sqrt(2-2cos)，
 *   1.05 约等于余弦相似度 0.45。该值按小型本地嵌入模型（qwen3-embedding:0.6b）
 *   在 scripts/eval golden set 上实测校准：短中文问句与其记忆的余弦常在
 *   0.5~0.65 区间，0.78（cos 0.70）会导致几乎零召回；放宽后由 MEMORY_TOP_K
 *   限量、system 提示「无关无需提及」兜底降噪；
 * - 写入去重：与最近邻距离 ≤ MEMORY_DUPLICATE_MAX_DISTANCE（≈cos 0.94）
 *   视为同一记忆，更新合并而非新建；
 * - MEMORY_BLOCK_RESERVE 为注入 system 的记忆块预留空间。
 */
export const MEMORY_TOP_K = 3;
export const MEMORY_RECALL_MAX_DISTANCE = 1.05;
export const MEMORY_DUPLICATE_MAX_DISTANCE = 0.35;
export const MEMORY_BLOCK_RESERVE_TOKENS = 512;
/** 单次回合提取候选记忆的上限，防止小模型输出失控 */
export const MEMORY_EXTRACT_MAX_ITEMS = 5;
/** 重要性取值范围（模型打分） */
export const MEMORY_IMPORTANCE_MIN = 0;
export const MEMORY_IMPORTANCE_MAX = 1;

/**
 * v0.5 P1-1 遗忘策略（软归档，可在管理页恢复）：
 * - 归档条件：创建超过 MEMORY_DECAY_AFTER_DAYS 天、重要性低于
 *   MEMORY_DECAY_MIN_IMPORTANCE、且从未被召回（或上次召回也早于
 *   MEMORY_DECAY_ACCESS_STALE_DAYS 天）的 active 记忆；
 * - 后台衰减任务借回合成功后机会执行，两次运行至少间隔
 *   MEMORY_DECAY_INTERVAL_DAYS 天；
 * - 会话压缩摘要作为情景记忆（event）入库时使用的固定重要性。
 */
export const MEMORY_DECAY_MIN_IMPORTANCE = 0.4;
export const MEMORY_DECAY_AFTER_DAYS = 30;
export const MEMORY_DECAY_ACCESS_STALE_DAYS = 30;
export const MEMORY_DECAY_INTERVAL_DAYS = 7;
export const MEMORY_SUMMARY_IMPORTANCE = 0.6;

/** v0.2 内置工具（默认只读）；助手通过 enabledTools 白名单授权（v0.7 新增 screen_snapshot） */
export const TOOL_NAMES = ['current_time', 'knowledge_search', 'fetch_webpage', 'screen_snapshot'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * v0.6 MCP（Model Context Protocol）：
 * - 助手 enabledTools 从固定枚举放宽为字符串（内置名或 mcp:<server>:<tool>）；
 * - 服务器名即命名空间，必须标识符安全（工具名要回传给模型的 function-calling，
 *   需满足 [a-zA-Z0-9_-] 约束）；
 * - transport 本期实现 stdio，http（Streamable HTTP）为 M2 预留。
 */
export const MCP_TRANSPORTS = ['stdio', 'http'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/** 连接状态（设置页可视）：disconnected=未启动；connecting=握手中 */
export const MCP_SERVER_STATUSES = ['disconnected', 'connecting', 'connected', 'error'] as const;
export type McpServerStatus = (typeof MCP_SERVER_STATUSES)[number];

export const MCP_SERVER_NAME_MAX = 40;
export const MCP_SERVER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
/** MCP 工具原始名（协议未强制，登记为标识符安全，注册时把非法字符替换为 _） */
export const MCP_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
/** 助手 enabledTools 合法值：内置名（无冒号）或完整 mcp:<server>:<tool> */
export const QUALIFIED_TOOL_NAME_PATTERN =
  /^(?:[a-zA-Z0-9_-]{1,64}|mcp:[a-zA-Z0-9_-]{1,64}:[a-zA-Z0-9_-]{1,64})$/;

/**
 * v0.6 M3 本地技能包（声明式 Skill）：
 * 技能 = 数据根 skills/<name>/ 文件夹 + skill.json manifest；
 * name 唯一且标识符安全（亦作文件夹名与 API 引用键）。
 */
export const SKILL_MANIFEST_FILENAME = 'skill.json';
export const SKILL_NAME_MAX = 40;
export const SKILL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
export const SKILL_DESCRIPTION_MAX = 500;
export const SKILL_VERSION_MAX = 40;
/** 单段提示词模板长度上限（防失控注入撑爆上下文预算） */
export const SKILL_PROMPT_TEMPLATE_MAX = 4000;
export const SKILL_MAX_PROMPT_TEMPLATES = 10;
/** 单技能预绑定工具数上限（与助手 enabledTools 同样的选择准确率考量） */
export const SKILL_MAX_TOOLS = 20;
export const SKILL_MAX_EXAMPLES = 10;

/** stdio initialize 握手超时（进程冷启动如 npx 首次下载包可能较慢） */
export const MCP_CONNECT_TIMEOUT_MS = 30_000;
/** tools/list 超时 */
export const MCP_LIST_TIMEOUT_MS = 10_000;
/** MCP 工具调用默认超时（覆盖内置 TOOL_TIMEOUT_MS；文件检索类操作可能较慢） */
export const MCP_CALL_TIMEOUT_MS = 60_000;
/** stdio 子进程优雅退出等待（超时后强杀） */
export const MCP_EXIT_GRACE_MS = 3_000;
/** 单服务器工具数上限（防御异常服务器刷爆工具列表） */
export const MCP_MAX_TOOLS_PER_SERVER = 50;

/** 工具调用安全护栏常量 */
export const MAX_TOOL_ROUNDS = 5;
export const TOOL_TIMEOUT_MS = 15_000;
/** v0.6 M4：熔断——连续失败超过此值后自动停用工具 */
export const TOOL_BREAKER_FAILURE_THRESHOLD = 3;
/** v0.6 M4：熔断冷却时间（5 分钟后半开重试） */
export const TOOL_BREAKER_COOLDOWN_MS = 5 * 60_000;

/** 上传限制 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

/** v0.3 聊天图片附件限制 */
export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 浏览器侧压缩后最长边与 JPEG 质量（控制视觉 token） */
export const IMAGE_COMPRESS_MAX_EDGE = 1600;
export const IMAGE_COMPRESS_QUALITY = 0.85;

/** v0.4 图片型 PDF OCR 参数 */
/** 文字层密度阈值：平均每页字符数低于此值判定为扫描件 */
export const OCR_TEXT_DENSITY_THRESHOLD = 50;
/** 单页 OCR 超时（ms），超时跳过该页 */
export const OCR_PAGE_TIMEOUT_MS = 30_000;
/** 全文 OCR 总超时（ms），超时保留已识别页并标记 partial */
export const OCR_TOTAL_TIMEOUT_MS = 5 * 60_000;
/** OCR 处理页数软上限，超出部分不处理并标记 partial */
export const OCR_MAX_PAGES = 50;
/**
 * PDF 渲染缩放：
 * - 视觉 2x（A4 ≈1190×1684，约 144DPI）；
 * - tesseract 3x（≈288DPI 保识别率）。
 */
export const OCR_VISION_SCALE = 2;
export const OCR_TESSERACT_SCALE = 3;
/**
 * 送视觉模型的单页像素上限：约 2M 像素。
 * 视觉模型按像素计 image token（qwen2.5-vl 约 784px/token，此预算 ≈2550 token），
 * 限制总量可避免本地模型默认 4096 上下文（如 Ollama）直接返回 400；
 * 对超大画幅/非标准 MediaBox 的扫描件按比例缩回，标准 A4 在 2x 下不受影响。
 */
export const OCR_VISION_MAX_PIXELS = 2_000_000;

/** 外部请求默认超时（ms），SSE 不设短超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/**
 * 聊天流式请求的连接建立超时（响应头到达前）：
 * 本地大模型冷加载（如 qwen2.5-vl 7B 约 6GB 装载）首字节可能超 60s，
 * 仅在响应头迟迟不到时才触发；连不上/DNS 失败仍会立即报错。
 */
export const CHAT_CONNECT_TIMEOUT_MS = 180_000;
