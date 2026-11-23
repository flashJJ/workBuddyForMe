import { statSync, watch } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { FlowTriggerView } from '@wbfm/shared/types';
import type { WorkflowTriggerRepository } from '@wbfm/database';
import type { FileTriggerEvent, FireResult } from './trigger-service';

/**
 * v4.25 本地文件监听：
 * - 按启用中的文件触发器建立/释放监听；
 * - 扩展名白名单 + 忽略目录；
 * - 同路径防抖合并，触发后短窗口内去重；
 * - Windows/macOS 支持递归，其它平台降级为根目录。
 */

export interface FileWatchHandle {
  close(): void;
}

export interface FileWatchAdapter {
  watch(
    path: string,
    options: { recursive: boolean },
    listener: (eventType: 'rename' | 'change', filename: string | null) => void,
  ): FileWatchHandle;
  stat(path: string): { isDirectory(): boolean } | null;
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', '.next']);
const IGNORED_SUFFIXES = ['.tmp', '.swp'];

const defaultAdapter: FileWatchAdapter = {
  watch(path, options, listener) {
    return watch(path, { recursive: options.recursive }, (eventType, filename) =>
      listener(eventType, filename ? String(filename) : null),
    );
  },
  stat(path) {
    try {
      return statSync(path);
    } catch {
      return null;
    }
  },
};

export interface FlowFileWatcherDeps {
  triggers: WorkflowTriggerRepository;
  fire: (trigger: FlowTriggerView, file: FileTriggerEvent) => FireResult;
  onError?: (triggerId: string, message: string) => void;
  now?: () => Date;
  debounceMs?: number;
  adapter?: FileWatchAdapter;
  platform?: NodeJS.Platform;
  /** 全进程监听上限，避免异常配置拖垮进程 */
  watchLimit?: number;
}

export interface FlowFileWatcher {
  start(): void;
  reconcile(): void;
  dispose(): void;
  activeCount(): number;
  stats(): {
    active: boolean;
    watchingCount: number;
    lastEventAt: string | null;
    lastError: string | null;
  };
}

const DEFAULT_DEBOUNCE_MS = 800;
const SAME_PATH_WINDOW_MS = 2_000;
const DEFAULT_WATCH_LIMIT = 50;

function isIgnoredName(name: string): boolean {
  if (name.startsWith('.')) return true;
  if (name.startsWith('~$')) return true;
  return IGNORED_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix));
}

export function createFlowFileWatcher(deps: FlowFileWatcherDeps): FlowFileWatcher {
  const now = deps.now ?? (() => new Date());
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const adapter = deps.adapter ?? defaultAdapter;
  const platform = deps.platform ?? process.platform;
  const watchLimit = deps.watchLimit ?? DEFAULT_WATCH_LIMIT;
  const supportsRecursive = platform === 'win32' || platform === 'darwin';

  const entries = new Map<string, { handle: FileWatchHandle; key: string; trigger: FlowTriggerView }>();
  const pending = new Map<
    string,
    { trigger: FlowTriggerView; file: FileTriggerEvent; timer: ReturnType<typeof setTimeout> }
  >();
  const lastFired = new Map<string, number>();
  let started = false;
  let lastEventAt: string | null = null;
  let lastError: string | null = null;

  function reportError(triggerId: string, message: string): void {
    lastError = message;
    console.warn(`[flow-trigger] ${message}`);
    deps.onError?.(triggerId, message);
  }

  function fire(trigger: FlowTriggerView, file: FileTriggerEvent): void {
    const key = `${trigger.id}:${file.path}`;
    const last = lastFired.get(key) ?? 0;
    const at = now().getTime();
    if (at - last < SAME_PATH_WINDOW_MS) return;
    lastFired.set(key, at);
    deps.fire(trigger, { ...file, changedAt: new Date(at).toISOString() });
  }

  function schedule(trigger: FlowTriggerView, file: FileTriggerEvent): void {
    const key = `${trigger.id}:${file.path}`;
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);
    lastEventAt = now().toISOString();
    const timer = setTimeout(() => {
      pending.delete(key);
      fire(trigger, file);
    }, debounceMs);
    pending.set(key, { trigger, file, timer });
  }

  function handleEvent(
    trigger: FlowTriggerView,
    dir: string,
    eventType: 'rename' | 'change',
    filename: string | null,
  ): void {
    const config = trigger.config;
    if (!config || !filename) return;
    const segments = filename.split(/[\\/]+/).filter(Boolean);
    if (segments.some((segment) => IGNORED_DIRS.has(segment))) return;
    const name = basename(filename);
    if (!name || isIgnoredName(name)) return;
    const fullPath = join(dir, filename);
    const stat = adapter.stat(fullPath);
    if (!stat || stat.isDirectory()) return;
    const ext = extname(name).slice(1).toLowerCase();
    if (!config.extensions.includes(ext)) return;
    schedule(trigger, {
      path: fullPath,
      name,
      ext,
      eventType: eventType === 'change' ? 'change' : 'add',
      changedAt: now().toISOString(),
    });
  }

  function watchTrigger(trigger: FlowTriggerView): void {
    const config = trigger.config;
    if (!config) return;
    const recursive = config.recursive !== false && supportsRecursive;
    if (config.recursive !== false && !supportsRecursive) {
      reportError(trigger.id, '当前平台不支持递归监听，已降级为根目录');
    }
    const stat = adapter.stat(config.path);
    if (!stat || !stat.isDirectory()) {
      reportError(trigger.id, `监听目录不存在：${config.path}`);
      return;
    }
    try {
      const handle = adapter.watch(config.path, { recursive }, (eventType, filename) =>
        handleEvent(trigger, config.path, eventType, filename),
      );
      entries.set(trigger.id, { handle, key: JSON.stringify(config), trigger });
    } catch (error) {
      reportError(trigger.id, `建立监听失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function closeTrigger(triggerId: string): void {
    const entry = entries.get(triggerId);
    if (entry) {
      try {
        entry.handle.close();
      } catch {
        /* 释放失败不阻断其它触发器 */
      }
      entries.delete(triggerId);
    }
    for (const [key, item] of pending) {
      if (item.trigger.id !== triggerId) continue;
      clearTimeout(item.timer);
      pending.delete(key);
    }
  }

  function reconcile(): void {
    const enabled = deps.triggers.listEnabledByKind('file');
    const desired = new Map(enabled.map((trigger) => [trigger.id, trigger]));
    for (const id of [...entries.keys()]) {
      const next = desired.get(id);
      const currentKey = entries.get(id)?.key;
      if (!next || (next.config && JSON.stringify(next.config) !== currentKey)) {
        closeTrigger(id);
      }
    }
    for (const trigger of enabled) {
      if (entries.has(trigger.id)) continue;
      if (entries.size >= watchLimit) {
        reportError(trigger.id, `文件监听数量已达上限 ${watchLimit}`);
        continue;
      }
      watchTrigger(trigger);
    }
  }

  return {
    start() {
      started = true;
      reconcile();
    },
    reconcile,
    dispose() {
      started = false;
      for (const id of [...entries.keys()]) closeTrigger(id);
      for (const item of pending.values()) clearTimeout(item.timer);
      pending.clear();
      lastFired.clear();
    },
    activeCount() {
      return entries.size;
    },
    stats: () => ({
      active: started,
      watchingCount: entries.size,
      lastEventAt,
      lastError,
    }),
  };
}
