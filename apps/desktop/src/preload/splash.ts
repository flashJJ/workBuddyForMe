import { contextBridge, ipcRenderer } from 'electron';
import type { BootFailure, BootMode, BootPhaseEvent } from '../main/splash/boot-phases';

/**
 * v4.5 启动画面专用 preload：只暴露只读事件与两个无载荷动作，
 * 不开放 ipcRenderer / process / require。
 */
const boot = {
  onMode: (cb: (mode: BootMode) => void): (() => void) => {
    const handler = (_event: unknown, payload: BootMode) => cb(payload);
    ipcRenderer.on('boot:mode', handler);
    return () => ipcRenderer.removeListener('boot:mode', handler);
  },
  onPhase: (cb: (phase: BootPhaseEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: BootPhaseEvent) => cb(payload);
    ipcRenderer.on('boot:phase', handler);
    return () => ipcRenderer.removeListener('boot:phase', handler);
  },
  onDone: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('boot:done', handler);
    return () => ipcRenderer.removeListener('boot:done', handler);
  },
  onFail: (cb: (failure: BootFailure) => void): (() => void) => {
    const handler = (_event: unknown, payload: BootFailure) => cb(payload);
    ipcRenderer.on('boot:fail', handler);
    return () => ipcRenderer.removeListener('boot:fail', handler);
  },
  notifyExited: (): void => ipcRenderer.send('boot:exited'),
  skip: (): void => ipcRenderer.send('boot:skip'),
};

contextBridge.exposeInMainWorld('wbfmBoot', boot);
