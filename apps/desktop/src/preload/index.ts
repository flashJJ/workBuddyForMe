import { contextBridge, ipcRenderer } from 'electron';
import type { WbfmPetBridge } from '@wbfm/shared/pet';
import type { WbfmStageBridge } from '@wbfm/shared/stage';
import type { WbfmUpdaterBridge } from '@wbfm/shared/updater';
import type { WbfmNotifyBridge } from '@wbfm/shared/notify';
import type { WbfmAwarenessBridge } from '@wbfm/shared/awareness';
import type { WbfmDialogBridge } from '@wbfm/shared/dialog';
import type {
  WbfmBackgroundBridge,
  WbfmBackgroundFile,
  WbfmBackgroundPickResult,
} from '@wbfm/shared/background';
import type { WbfmSearchBridge } from '@wbfm/shared/search';

/**
 * sandbox:true 的 preload 只能 require('electron')（外加 events/timers/url 等最小内置），
 * 任何第三方依赖都会在加载阶段抛 `module not found`，preload 整体失效 →
 * window.wbfm 不存在 → 渲染层拿不到托管 token → 所有 API 401（B-59）。
 * 因此这里不能从 @wbfm/shared/pet 取运行时符号（其依赖树含 zod），
 * 常量与校验内联，事实源仍是 packages/shared/src/schemas/pet/commands.ts。
 */
const PET_CHAT_REQUEST_CHANNEL = 'pet:chat-request';
const PET_CHAT_PROMPT_KEYS = ['greet', 'comfort', 'play'] as const;

function isPetChatPromptKey(value: unknown): value is (typeof PET_CHAT_PROMPT_KEYS)[number] {
  return typeof value === 'string' && (PET_CHAT_PROMPT_KEYS as readonly string[]).includes(value);
}

/**
 * 最小 preload：
 * - 暴露托管服务的 baseUrl 与一次性 token（生产态注入）
 * - 暴露 updater 桥（ipcRenderer 白名单通道），不开放任何 Node 能力
 *   （sandbox:true 下 require 仅有 electron 的 polyfill）
 */
function readArg(name: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const token = readArg('wbfm-token');
const baseUrl = readArg('wbfm-base-url');

const updater: WbfmUpdaterBridge = {
  getStatus: () => ipcRenderer.invoke('updater:get-status'),
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  setChannel: (channel) => ipcRenderer.invoke('updater:set-channel', channel),
  onEvent: (cb) => {
    const handler = (_event: unknown, payload: Parameters<typeof cb>[0]) => cb(payload);
    ipcRenderer.on('updater:event', handler);
    return () => ipcRenderer.removeListener('updater:event', handler);
  },
};

/**
 * 命令面板桥（M5）：主进程 globalShortcut(Ctrl+K) 触发 command-palette:open，
 * 渲染进程通过 onOpen 订阅并打开面板。
 */
const commandPalette = {
  onOpen: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('command-palette:open', handler);
    return () => ipcRenderer.removeListener('command-palette:open', handler);
  },
};

/**
 * 快捷键浮层桥（v1.2 M5）：主进程 globalShortcut(Ctrl+/) 触发 shortcuts:open。
 */
const shortcuts = {
  onOpen: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('shortcuts:open', handler);
    return () => ipcRenderer.removeListener('shortcuts:open', handler);
  },
};

/** 订阅主进程单向广播，返回取消订阅 */
function subscribe(channel: string, cb: (payload: unknown) => void): () => void {
  const handler = (_event: unknown, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/**
 * 桌宠桥（M4 伴身）：主窗用 open/close/isOpen/relayPerformance/onOpenChange；
 * /pet 窗用 reportHover/focusMain/onPerformance。白名单最小权限，无任何壳能力。
 */
const pet: WbfmPetBridge = {
  open: (modelId) => ipcRenderer.invoke('pet:open', modelId),
  close: () => ipcRenderer.invoke('pet:close'),
  isOpen: () => ipcRenderer.invoke('pet:is-open') as Promise<boolean>,
  reportHover: (hovering) => ipcRenderer.send('pet:hover', hovering),
  reportHitProxy: (proxy) => ipcRenderer.send('pet:hit-proxy', proxy),
  focusMain: (path) => ipcRenderer.send('pet:focus-main', path),
  dragBegin: () => ipcRenderer.send('pet:drag-begin'),
  dragTo: () => ipcRenderer.send('pet:drag-to'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  reportCompanionSettings: (settings) => ipcRenderer.send('pet:companion-settings', settings),
  relayPerformance: (event) => ipcRenderer.send('pet:relay', event),
  onModelChange: (cb) => subscribe('pet:model-changed', (payload) => cb(String(payload))),
  confirmModel: (modelId) => ipcRenderer.send('pet:model-applied', modelId),
  onQuickAction: (cb) =>
    subscribe('pet:quick-action', (payload) => cb(payload as Parameters<typeof cb>[0])),
  onPerformance: (cb) =>
    subscribe('pet:performance', (payload) => cb(payload as Parameters<typeof cb>[0])),
  onOpenChange: (cb) => subscribe('pet:open-changed', (payload) => cb(Boolean(payload))),
  onChatRequest: (cb) =>
    subscribe(PET_CHAT_REQUEST_CHANNEL, (payload) => {
      if (isPetChatPromptKey(payload)) cb(payload);
    }),
};

/**
 * 舞台桥（v1.9）：主窗 open/isOpen/onOpenChange；舞台窗 close/capture。
 */
const stage: WbfmStageBridge = {
  open: (target?: { runId?: string; meetingId?: string; theater?: boolean }) =>
    ipcRenderer.invoke('stage:open', target) as Promise<boolean>,
  openMeeting: (meetingId: string) =>
    ipcRenderer.invoke('stage:open', { meetingId }) as Promise<boolean>,
  close: () => ipcRenderer.invoke('stage:close'),
  toggleFullscreen: () => ipcRenderer.invoke('stage:toggle-fullscreen') as Promise<boolean>,
  isOpen: () => ipcRenderer.invoke('stage:is-open') as Promise<boolean>,
  capture: () =>
    ipcRenderer.invoke('stage:capture') as Promise<{ saved: boolean; canceled?: boolean }>,
  onOpenChange: (cb) => subscribe('stage:open-changed', (payload) => cb(Boolean(payload))),
};

/**
 * v1.7 系统通知桥：角色化提醒无演出出口时的兜底（白名单单一通道）。
 */
const notify: WbfmNotifyBridge = {
  show: (payload) => ipcRenderer.invoke('notify:show', payload),
};

/**
 * v2.0 M3 系统事件感知桥：默认关闭，渲染端按用户授权 setEnabled；
 * 主进程仅在武装后广播电源/空闲事件，白名单两通道。
 */
const awareness: WbfmAwarenessBridge = {
  setEnabled: (enabled) => ipcRenderer.invoke('awareness:set-enabled', enabled),
  onEvent: (cb) =>
    subscribe('awareness:event', (payload) => cb(payload as Parameters<typeof cb>[0])),
};

/**
 * v2.7 站内深链桥：主进程中继桌宠/通知的站内路径，主窗 App Router 接收后跳转。
 */
const appLinks = {
  onOpen: (cb: (path: string) => void): (() => void) =>
    subscribe('app:deep-link', (payload) => cb(String(payload))),
};

/**
 * v2.11 桌面目录选择桥：外部代理 cwd 选择（单通道，无其他壳能力）。
 */
const dialog: WbfmDialogBridge = {
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory') as Promise<string | null>,
};

/**
 * 联网搜索桥：一键用本机 Docker 拉起 SearXNG（不开放任意命令执行）。
 */
const search: WbfmSearchBridge = {
  deploySearxng: (port?: number) => ipcRenderer.invoke('search:deploy-searxng', port),
};

/**
 * v4.4 M2 背景文件桥：选择/列表/删除，仅主窗可用；
 * 真实路径不出主进程，渲染层只拿 id 与元数据。
 */
const background: WbfmBackgroundBridge = {
  pick: () => ipcRenderer.invoke('background:pick') as Promise<WbfmBackgroundPickResult>,
  list: () => ipcRenderer.invoke('background:list') as Promise<WbfmBackgroundFile[]>,
  remove: (id) => ipcRenderer.invoke('background:remove', id) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('wbfm', {
  token,
  baseUrl,
  isManaged: Boolean(token),
  updater,
  commandPalette,
  shortcuts,
  pet,
  stage,
  notify,
  awareness,
  appLinks,
  dialog,
  background,
  search,
});
