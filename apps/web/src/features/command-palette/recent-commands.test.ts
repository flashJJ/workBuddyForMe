// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readRecentCommands, recordRecentCommand } from './recent-commands';

describe('命令面板最近使用（v4.17）', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('最近执行的命令置顶且去重', () => {
    recordRecentCommand('nav:chat');
    recordRecentCommand('nav:settings');
    recordRecentCommand('nav:chat');
    expect(readRecentCommands()).toEqual(['nav:chat', 'nav:settings']);
  });

  it('最多保留 5 条', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) recordRecentCommand(id);
    expect(readRecentCommands()).toEqual(['f', 'e', 'd', 'c', 'b']);
  });

  it('本地存储损坏时降级为空列表', () => {
    window.localStorage.setItem('wbfm.commandPalette.recent', '{oops');
    expect(readRecentCommands()).toEqual([]);
  });
});
