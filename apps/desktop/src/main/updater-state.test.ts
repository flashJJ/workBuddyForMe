import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bumpLastCheck,
  DEFAULT_UPDATER_STATE,
  isUpdateChannel,
  normalizeUpdaterState,
  readUpdaterState,
  setChannel,
  writeUpdaterState,
  type UpdaterState,
} from './updater-state';

describe('updater-state', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'wbfm-upd-state-'));
    file = path.join(dir, 'updater-state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('isUpdateChannel / normalizeUpdaterState', () => {
    it('识别合法通道', () => {
      expect(isUpdateChannel('stable')).toBe(true);
      expect(isUpdateChannel('beta')).toBe(true);
      expect(isUpdateChannel('nightly')).toBe(false);
      expect(isUpdateChannel(undefined)).toBe(false);
    });

    it('合法对象保留字段', () => {
      const s: UpdaterState = { channel: 'beta', lastCheckAt: '2026-09-22T01:00:00.000Z' };
      expect(normalizeUpdaterState(s)).toEqual(s);
    });

    it('非法 channel 回落 stable，非法 lastCheckAt 回落 null', () => {
      expect(normalizeUpdaterState({ channel: 'rc', lastCheckAt: 'nope' })).toEqual({
        channel: 'stable',
        lastCheckAt: null,
      });
    });

    it('null / 非对象返回默认', () => {
      expect(normalizeUpdaterState(null)).toEqual(DEFAULT_UPDATER_STATE);
      expect(normalizeUpdaterState('x')).toEqual(DEFAULT_UPDATER_STATE);
    });
  });

  describe('readUpdaterState', () => {
    it('文件不存在返回默认', () => {
      expect(readUpdaterState(file)).toEqual(DEFAULT_UPDATER_STATE);
    });

    it('损坏 JSON 返回默认不抛错', () => {
      fs.writeFileSync(file, '{not json');
      expect(readUpdaterState(file)).toEqual(DEFAULT_UPDATER_STATE);
    });

    it('读取已写入状态', () => {
      writeUpdaterState(file, { channel: 'beta', lastCheckAt: '2026-09-22T01:00:00.000Z' });
      expect(readUpdaterState(file)).toEqual({ channel: 'beta', lastCheckAt: '2026-09-22T01:00:00.000Z' });
    });
  });

  describe('writeUpdaterState', () => {
    it('目录不存在时自动创建', () => {
      const deep = path.join(dir, 'nested', 'deeper', 'updater-state.json');
      writeUpdaterState(deep, DEFAULT_UPDATER_STATE);
      expect(fs.existsSync(deep)).toBe(true);
    });

    it('原子写：不残留 .tmp', () => {
      writeUpdaterState(file, DEFAULT_UPDATER_STATE);
      expect(fs.existsSync(`${file}.tmp`)).toBe(false);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(DEFAULT_UPDATER_STATE);
    });
  });

  describe('bumpLastCheck / setChannel', () => {
    it('bumpLastCheck 更新时间并保留通道', () => {
      setChannel(file, 'beta');
      const iso = '2026-09-22T02:00:00.000Z';
      const next = bumpLastCheck(file, iso);
      expect(next).toEqual({ channel: 'beta', lastCheckAt: iso });
      expect(readUpdaterState(file)).toEqual(next);
    });

    it('setChannel 仅切通道不重置时间', () => {
      const iso = '2026-09-22T03:00:00.000Z';
      bumpLastCheck(file, iso);
      const next = setChannel(file, 'beta');
      expect(next).toEqual({ channel: 'beta', lastCheckAt: iso });
    });
  });
});
