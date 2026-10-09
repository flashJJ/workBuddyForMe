import { contextBridge, ipcRenderer } from 'electron';
import type { WbfmPetBridge } from '@wbfm/shared/pet';
import type { WbfmUpdaterBridge } from '@wbfm/shared/updater';

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
  focusMain: () => ipcRenderer.send('pet:focus-main'),
  dragBegin: () => ipcRenderer.send('pet:drag-begin'),
  dragTo: () => ipcRenderer.send('pet:drag-to'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  relayPerformance: (event) => ipcRenderer.send('pet:relay', event),
  onPerformance: (cb) =>
    subscribe('pet:performance', (payload) => cb(payload as Parameters<typeof cb>[0])),
  onOpenChange: (cb) => subscribe('pet:open-changed', (payload) => cb(Boolean(payload))),
};

contextBridge.exposeInMainWorld('wbfm', {
  token,
  baseUrl,
  isManaged: Boolean(token),
  updater,
  commandPalette,
  shortcuts,
  pet,
});
