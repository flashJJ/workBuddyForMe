import { contextBridge, ipcRenderer } from 'electron';
import type { WbfmUpdaterBridge } from '@wbfm/shared';

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

contextBridge.exposeInMainWorld('wbfm', {
  token,
  baseUrl,
  isManaged: Boolean(token),
  updater,
});
