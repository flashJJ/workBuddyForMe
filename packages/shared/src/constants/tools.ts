/** 工具/MCP/Skill 域：内置工具枚举、MCP 护栏、技能包限制与工具调用安全护栏 */

/** v0.2 内置工具（默认只读）；助手通过 enabledTools 白名单授权（v0.7 新增 screen_snapshot） */
export const TOOL_NAMES = [
  'current_time',
  'knowledge_search',
  'fetch_webpage',
  'screen_snapshot',
  // v0.7 M2 键鼠 / 窗口 / UIA
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
  'window_list',
  'uia_list',
  'window_focus',
  'app_launch',
] as const;
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
