import { join } from 'node:path';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowTriggerRepository,
} from '@wbfm/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlowFileWatcher, type FileWatchAdapter } from './file-watcher';

const DIR = join(process.cwd(), 'watch-test');

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const triggers = createWorkflowTriggerRepository(db);
  const wf = workflows.createWorkflow({ name: '文件事件' });
  const trigger = triggers.create({
    workflowId: wf.id,
    kind: 'file',
    name: '目录',
    config: { path: DIR, extensions: ['md'], recursive: true },
  });

  const listeners = new Map<
    string,
    (event: 'rename' | 'change', filename: string | null) => void
  >();
  const adapter: FileWatchAdapter = {
    watch(path, _options, listener) {
      listeners.set(path, listener);
      return { close: () => listeners.delete(path) };
    },
    stat(path) {
      if (path === DIR) return { isDirectory: () => true };
      if (path.startsWith(`${DIR}\\`) || path.startsWith(`${DIR}/`)) {
        return { isDirectory: () => false };
      }
      return null;
    },
  };
  const fired: Array<{ path: string; ext: string; eventType: string }> = [];
  const watcher = createFlowFileWatcher({
    triggers,
    adapter,
    platform: 'win32',
    fire: (_trigger, file) => {
      fired.push({ path: file.path, ext: file.ext, eventType: file.eventType });
      return { ok: true, runId: `run-${fired.length}` };
    },
  });
  const emit = (filename: string, event: 'rename' | 'change' = 'rename') => {
    listeners.get(DIR)?.(event, filename);
  };
  return { db, triggers, trigger, watcher, fired, emit };
}

describe('v4.25 文件监听器', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('启动建立监听，扩展名命中后防抖触发一次', () => {
    const { watcher, fired, emit } = setup();
    watcher.start();
    expect(watcher.activeCount()).toBe(1);

    emit('a.md');
    emit('a.md');
    vi.advanceTimersByTime(800);
    expect(fired).toEqual([{ path: join(DIR, 'a.md'), ext: 'md', eventType: 'add' }]);
  });

  it('扩展名与忽略目录不触发', () => {
    const { watcher, fired, emit } = setup();
    watcher.start();
    emit('a.txt');
    emit('node_modules/b.md');
    emit('.hidden.md');
    emit('~$draft.md');
    vi.advanceTimersByTime(800);
    expect(fired).toHaveLength(0);
  });

  it('禁用触发器后 reconcile 释放监听', () => {
    const { watcher, triggers, trigger } = setup();
    watcher.start();
    expect(watcher.activeCount()).toBe(1);
    triggers.update(trigger.id, { enabled: false });
    watcher.reconcile();
    expect(watcher.activeCount()).toBe(0);
  });

  it('dispose 幂等并清空监听', () => {
    const { watcher } = setup();
    watcher.start();
    watcher.dispose();
    watcher.dispose();
    expect(watcher.activeCount()).toBe(0);
  });
});
