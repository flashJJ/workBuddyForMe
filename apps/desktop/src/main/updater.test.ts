import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAutoUpdater, Updater, type IpcMainLike } from './updater';
import { readUpdaterState } from './updater-state';

/** 最小 BrowserWindow mock：仅 webContents.send 可被监听 */
interface SentPayload {
  channel: string;
  payload: unknown;
}

function makeWindow(): { window: { webContents: { send: (c: string, p: unknown) => void } }; sent: SentPayload[] } {
  const sent: SentPayload[] = [];
  return {
    sent,
    window: { webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) } },
  };
}

function makeIpc(): IpcMainLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    handle: (channel: string) => calls.push(channel),
  };
}

describe('Updater', () => {
  let dir: string;
  let stateFile: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'wbfm-upd-'));
    stateFile = path.join(dir, 'updater-state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeUpdater(enabled = true) {
    const auto = new MockAutoUpdater();
    const { window, sent } = makeWindow();
    const updater = new Updater({
      autoUpdater: auto,
      getVersion: () => '0.4.0',
      getMainWindow: () => window as never,
      stateFile,
      enabled,
    });
    return { auto, updater, sent };
  }

  describe('getFullStatus', () => {
    it('返回默认状态（stable + 未检查）', () => {
      const { updater } = makeUpdater();
      const s = updater.getFullStatus();
      expect(s).toMatchObject({
        version: '0.4.0',
        channel: 'stable',
        lastCheckAt: null,
        enabled: true,
      });
      expect(s.status).toEqual({ state: 'idle' });
    });

    it('enabled=false 反映开发态', () => {
      const { updater } = makeUpdater(false);
      expect(updater.getFullStatus().enabled).toBe(false);
    });
  });

  describe('attachEvents 转发', () => {
    it('checking-for-update → checking', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      auto.emit('checking-for-update');
      expect(sent[0]).toEqual({ channel: 'updater:event', payload: { state: 'checking' } });
    });

    it('update-available 记录 lastCheckAt 并带版本', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      auto.emit('update-available', { version: '0.4.1' });
      expect(sent[0]?.payload).toEqual({ state: 'available', version: '0.4.1' });
      expect(readUpdaterState(stateFile).lastCheckAt).toBeTruthy();
    });

    it('update-not-available 记录 lastCheckAt', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      auto.emit('update-not-available');
      expect(sent[0]?.payload).toEqual({ state: 'not-available' });
      expect(readUpdaterState(stateFile).lastCheckAt).toBeTruthy();
    });

    it('download-progress 取整百分比', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      auto.emit('download-progress', { percent: 42.7 });
      expect(sent[0]?.payload).toEqual({ state: 'downloading', percent: 43 });
    });

    it('update-downloaded 带版本', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      auto.emit('update-downloaded', { version: '0.4.1' });
      expect(sent[0]?.payload).toEqual({ state: 'downloaded', version: '0.4.1' });
    });

    it('error 转 message', () => {
      const { auto, updater, sent } = makeUpdater();
      updater.attachEvents();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      auto.emit('error', new Error('网络超时'));
      expect(sent[0]?.payload).toEqual({ state: 'error', message: '网络超时' });
      errSpy.mockRestore();
    });

    it('无窗口时不抛错', () => {
      const auto = new MockAutoUpdater();
      const updater = new Updater({
        autoUpdater: auto,
        getVersion: () => '0.4.0',
        getMainWindow: () => null,
        stateFile,
        enabled: true,
      });
      updater.attachEvents();
      expect(() => auto.emit('checking-for-update')).not.toThrow();
    });
  });

  describe('checkForUpdates', () => {
    it('enabled=false 直接 not-available，不调 checkForUpdates', async () => {
      const { auto, updater, sent } = makeUpdater(false);
      const spy = vi.spyOn(auto, 'checkForUpdates');
      await updater.checkForUpdates();
      expect(spy).not.toHaveBeenCalled();
      expect(sent[0]?.payload).toEqual({ state: 'not-available' });
    });

    it('enabled=true 调用 autoUpdater.checkForUpdates', async () => {
      const { auto, updater } = makeUpdater(true);
      const spy = vi.spyOn(auto, 'checkForUpdates').mockResolvedValue(undefined);
      await updater.checkForUpdates();
      expect(spy).toHaveBeenCalled();
    });

    it('checkForUpdates 抛错转 error 状态', async () => {
      const { auto, updater, sent } = makeUpdater(true);
      vi.spyOn(auto, 'checkForUpdates').mockRejectedValue(new Error('404'));
      await updater.checkForUpdates();
      expect(sent[0]?.payload).toEqual({ state: 'error', message: '404' });
    });
  });

  describe('setChannel', () => {
    it('切换 beta 落盘并同步 allowPrerelease', () => {
      const { updater } = makeUpdater();
      const next = updater.setChannel('beta');
      expect(next.channel).toBe('beta');
      expect(readUpdaterState(stateFile).channel).toBe('beta');
    });

    it('setChannel 后 allowPrerelease=true', () => {
      const { auto, updater } = makeUpdater();
      updater.setChannel('beta');
      expect(auto.allowPrerelease).toBe(true);
    });
  });

  describe('registerIpc', () => {
    it('注册五个 handler', () => {
      const { updater } = makeUpdater();
      const ipc = makeIpc();
      updater.registerIpc(ipc);
      expect(ipc.calls).toEqual([
        'updater:get-status',
        'updater:check',
        'updater:download',
        'updater:install',
        'updater:set-channel',
      ]);
    });
  });
});
