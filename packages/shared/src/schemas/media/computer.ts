import { z } from 'zod';

/**
 * v0.7 M1 屏幕感知契约：desktop 主进程控制通道 + screen_snapshot 工具。
 * 通道发现文件由 desktop 写入数据根目录，core 侧读取后走 127.0.0.1 + bearer token 调用。
 */

/** 控制通道发现文件名（位于数据根目录） */
export const COMPUTER_CHANNEL_FILE = 'computer-channel.json';

/** 截图缩放后最大边长（控制视觉 token 成本） */
export const SCREENSHOT_MAX_EDGE = 1568;

export const SCREEN_SNAPSHOT_SCOPES = ['fullscreen', 'region'] as const;
export type ScreenSnapshotScope = (typeof SCREEN_SNAPSHOT_SCOPES)[number];

/** 截图区域：源显示器物理像素坐标（相对显示器原点），desktop 先裁剪后缩放 */
export const screenSnapshotRegionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type ScreenSnapshotRegion = z.infer<typeof screenSnapshotRegionSchema>;

export const screenSnapshotArgsSchema = z
  .object({
    scope: z.enum(SCREEN_SNAPSHOT_SCOPES).default('fullscreen'),
    region: screenSnapshotRegionSchema.optional(),
  })
  .refine((v) => v.scope !== 'region' || v.region !== undefined, {
    message: 'scope=region 时必须提供 region',
    path: ['region'],
  });
export type ScreenSnapshotArgs = z.infer<typeof screenSnapshotArgsSchema>;

/** 控制通道发现文件内容（desktop 启动时写入，退出时删除） */
export interface ComputerChannelInfo {
  version: 1;
  url: string;
  token: string;
  pid: number;
  startedAt: string;
}

export const computerChannelInfoSchema = z.object({
  version: z.literal(1),
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  startedAt: z.string().min(1),
});

/** 控制通道截图响应（已裁剪+缩放后的成品图） */
export interface ScreenSnapshotResponse {
  imageBase64: string;
  mimeType: 'image/png';
  /** 成品图尺寸（≤ SCREENSHOT_MAX_EDGE） */
  width: number;
  height: number;
  /** 截图源区域在显示器上的物理像素尺寸与原点（用于坐标换算回真实屏幕） */
  sourceWidth: number;
  sourceHeight: number;
  originX: number;
  originY: number;
  /** 缩放比 = 成品图边长 / 源区域边长（等比） */
  scaleFactor: number;
}

/* ---------------- v0.7 M2 键鼠 / 窗口 / UIA 契约 ---------------- */

/** 键鼠坐标一律为真实屏幕物理像素（与截图换算后的坐标系一致） */
export const mouseMoveArgsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});
export type MouseMoveArgs = z.infer<typeof mouseMoveArgsSchema>;

export const MOUSE_BUTTONS = ['left', 'right', 'middle'] as const;
export type MouseButton = (typeof MOUSE_BUTTONS)[number];

export const mouseClickArgsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  button: z.enum(MOUSE_BUTTONS).default('left'),
  double: z.boolean().default(false),
});
export type MouseClickArgs = z.infer<typeof mouseClickArgsSchema>;

export const mouseScrollArgsSchema = z.object({
  /** 垂直滚动量：正向上负向下（行数） */
  dy: z.number().int().default(0),
  /** 水平滚动量：正向右负向左 */
  dx: z.number().int().default(0),
});
export type MouseScrollArgs = z.infer<typeof mouseScrollArgsSchema>;

export const keyboardTypeArgsSchema = z.object({
  text: z.string().min(1).max(4000),
});
export type KeyboardTypeArgs = z.infer<typeof keyboardTypeArgsSchema>;

/** 组合键可用键名（desktop 侧映射到 nut-js Key 枚举） */
export const KEY_NAMES = [
  'control', 'shift', 'alt', 'meta',
  'enter', 'escape', 'tab', 'space', 'backspace', 'delete',
  'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
] as const;
export type KeyName = (typeof KEY_NAMES)[number];

export const keyboardPressArgsSchema = z.object({
  /** 按键序列，如 ['control','s']；一次性按下再整体释放 */
  keys: z.array(z.enum(KEY_NAMES)).min(1).max(5),
});
export type KeyboardPressArgs = z.infer<typeof keyboardPressArgsSchema>;

/** 鼠标当前位置响应（校准与测试用） */
export interface MousePositionResponse {
  x: number;
  y: number;
}

/** 窗口信息（windows/list 返回） */
export interface WindowInfo {
  /** 窗口句柄（十进制字符串，避免 JS 大整数精度问题） */
  handle: string;
  title: string;
  processName: string;
  rect: { x: number; y: number; width: number; height: number };
  isForeground: boolean;
}

export interface WindowListResponse {
  windows: WindowInfo[];
}

export const windowFocusArgsSchema = z.object({
  /** 按标题子串匹配（不区分大小写），与 handle 二选一 */
  title: z.string().min(1).optional(),
  handle: z.string().min(1).optional(),
}).refine((v) => v.title !== undefined || v.handle !== undefined, {
  message: 'title 与 handle 至少提供一个',
});
export type WindowFocusArgs = z.infer<typeof windowFocusArgsSchema>;

export const appLaunchArgsSchema = z.object({
  /** 可执行文件名（notepad）或完整路径；不支持参数注入（禁止 shell 拼接） */
  target: z.string().min(1).max(260),
  /** 启动参数白名单：仅简单字符串，逐个传递不经过 shell */
  args: z.array(z.string().max(260)).max(8).default([]),
});
export type AppLaunchArgs = z.infer<typeof appLaunchArgsSchema>;

/** UIA 控件节点（UI Automation 树拍平后的元素） */
export interface UiaElement {
  /** 控件名称（按钮文本 / 编辑框标签等，可能为空） */
  name: string;
  /** 控件类型：Button/Edit/MenuItem/Text/Pane/... */
  controlType: string;
  /** AutomationId（可能为空） */
  automationId: string;
  /** 真实屏幕物理像素矩形 */
  rect: { x: number; y: number; width: number; height: number };
  /** 是否可交互（IsEnabled && !IsOffscreen） */
  interactable: boolean;
}

export const uiaListArgsSchema = z.object({
  /** 目标窗口标题子串（缺省取前台窗口） */
  windowTitle: z.string().min(1).optional(),
  /** 返回节点数上限（防控件树爆炸） */
  maxNodes: z.number().int().min(1).max(500).default(200),
});
export type UiaListArgs = z.infer<typeof uiaListArgsSchema>;

export interface UiaListResponse {
  /** 目标窗口标题（实际命中的窗口） */
  windowTitle: string;
  elements: UiaElement[];
  /** 控件树总节点数（截断前） */
  totalNodes: number;
}

/** 输入类路由统一成功响应 */
export interface InputActionResponse {
  ok: true;
}
