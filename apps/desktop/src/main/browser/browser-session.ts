import { createHash, randomBytes } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import type {
  BrowserActionResponse,
  BrowserCloseResponse,
  BrowserOpenRequest,
  BrowserOpenResponse,
  BrowserReadResponse,
  BrowserSnapshotRequest,
  BrowserSnapshotResponse,
  BrowserTypeRequest,
} from '@wbfm/shared/schemas';
import { evaluateBrowserUrl, type BrowserDomainRules } from './browser-guard';

/**
 * v2.13 M5：隔离网页会话管理器（desktop 主进程）。
 * - 每个 runId 一个 BrowserWindow + 非持久 session 分区；
 * - 不导入主浏览器 Cookie，不持久登录态；禁止下载 / 弹窗 / 外部协议 / 新窗口；
 * - 导航与重定向逐次复核协议、私网与域名规则；终态 / 退出销毁窗口并清理缓存。
 */

const READ_DEFAULT = 8000;
const LOAD_TIMEOUT_MS = 20_000;
const SNAPSHOT_MAX_EDGE = 1568;

interface Entry {
  runId: string;
  partition: string;
  window: BrowserWindow;
  blocked: { domain?: string; reason: 'URL_REJECTED' | 'NAVIGATION_BLOCKED' } | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function urlInfo(url: string): { domain: string; urlHash: string } {
  try {
    const parsed = new URL(url);
    return { domain: parsed.hostname.toLowerCase(), urlHash: sha256(parsed.toString()) };
  } catch {
    return { domain: '', urlHash: sha256(url) };
  }
}

function rulesOf(request: BrowserOpenRequest): BrowserDomainRules {
  return { allow: request.allowDomains, deny: request.denyDomains };
}

export interface BrowserSessionManager {
  open(request: BrowserOpenRequest): Promise<BrowserOpenResponse>;
  read(request: { runId: string; maxChars: number }): Promise<BrowserReadResponse>;
  snapshot(request: BrowserSnapshotRequest): Promise<BrowserSnapshotResponse>;
  click(request: { runId: string; selector?: string; text?: string }): Promise<BrowserActionResponse>;
  type(request: BrowserTypeRequest): Promise<BrowserActionResponse>;
  close(runId: string): Promise<BrowserCloseResponse>;
  closeAll(): void;
}

export function createBrowserSessionManager(): BrowserSessionManager {
  const entries = new Map<string, Entry>();

  const destroy = async (entry: Entry): Promise<void> => {
    entries.delete(entry.runId);
    try {
      const ses = entry.window.webContents.session;
      if (!entry.window.isDestroyed()) entry.window.destroy();
      await ses.clearStorageData();
      await ses.clearCache();
    } catch {
      // 窗口/会话已销毁：终止路径无需报错
    }
  };

  const buildWindow = (request: BrowserOpenRequest, rules: BrowserDomainRules): Entry | null => {
    const partition = `wbfm-browser-${randomBytes(8).toString('hex')}`;
    const ses = session.fromPartition(partition);
    ses.on('will-download', (event) => event.preventDefault());
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    const window = new BrowserWindow({
      show: true,
      width: 1000,
      height: 720,
      title: 'WorkBuddy 隔离网页',
      webPreferences: {
        session: ses,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const entry: Entry = { runId: request.runId, partition, window, blocked: null };
    const guard = (target: string): boolean => {
      const check = evaluateBrowserUrl(target, rules);
      if (check.allowed) return true;
      entry.blocked = { reason: check.reason, ...(check.domain ? { domain: check.domain } : {}) };
      return false;
    };
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      if (!guard(target)) event.preventDefault();
    });
    window.webContents.on('will-redirect', (event, target) => {
      if (!guard(target)) event.preventDefault();
    });
    return entry;
  };

  const load = async (entry: Entry, url: string): Promise<BrowserOpenResponse> => {
    entry.blocked = null;
    let timer: NodeJS.Timeout | undefined;
    try {
      const loaded = await Promise.race([
        entry.window.loadURL(url),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('load_timeout')), LOAD_TIMEOUT_MS);
        }),
      ]);
      void loaded;
    } catch {
      await destroy(entry);
      const info = urlInfo(url);
      const blocked = entry.blocked as { reason: 'URL_REJECTED' | 'NAVIGATION_BLOCKED'; domain?: string } | null;
      if (blocked) {
        return { ok: false, error: blocked.reason, ...(blocked.domain ? { blockedDomain: blocked.domain } : {}), ...info };
      }
      return { ok: false, error: 'LOAD_FAILED', ...info };
    } finally {
      if (timer) clearTimeout(timer);
    }
    const blocked = entry.blocked as { reason: 'URL_REJECTED' | 'NAVIGATION_BLOCKED'; domain?: string } | null;
    if (blocked) {
      await destroy(entry);
      const info = urlInfo(url);
      return { ok: false, error: blocked.reason, ...(blocked.domain ? { blockedDomain: blocked.domain } : {}), ...info };
    }
    const finalUrl = entry.window.webContents.getURL() || url;
    const info = urlInfo(finalUrl);
    return {
      ok: true,
      sessionId: entry.partition,
      domain: info.domain,
      urlHash: info.urlHash,
      title: entry.window.getTitle().slice(0, 200),
      status: 200,
    };
  };

  const withEntry = <T>(
    runId: string,
    fallback: (error: 'NO_SESSION') => T,
    action: (entry: Entry) => Promise<T>,
  ): Promise<T> => {
    const entry = entries.get(runId);
    if (!entry) return Promise.resolve(fallback('NO_SESSION'));
    return action(entry);
  };

  return {
    async open(request) {
      const rules = rulesOf(request);
      const check = evaluateBrowserUrl(request.url, rules);
      if (!check.allowed) {
        return {
          ok: false,
          error: check.reason,
          ...(check.domain ? { blockedDomain: check.domain } : {}),
        };
      }
      const existing = entries.get(request.runId);
      if (existing && !existing.window.isDestroyed()) return load(existing, check.url.toString());
      const entry = buildWindow(request, rules);
      if (!entry) return { ok: false, error: 'LOAD_FAILED' };
      entries.set(request.runId, entry);
      return load(entry, check.url.toString());
    },

    read(request) {
      return withEntry<BrowserReadResponse>(request.runId, () => ({ ok: false, error: 'NO_SESSION' }), async (entry) => {
        const url = entry.window.webContents.getURL();
        const info = urlInfo(url);
        const raw = await entry.window.webContents.executeJavaScript(
          '(() => document.body ? document.body.innerText || "" : "")()',
          true,
        );
        const text = String(raw ?? '');
        const max = Math.min(Math.max(request.maxChars || READ_DEFAULT, 1), 20000);
        return {
          ok: true,
          ...info,
          title: entry.window.getTitle().slice(0, 200),
          text: text.slice(0, max),
          truncated: text.length > max,
        };
      });
    },

    snapshot(request) {
      return withEntry<BrowserSnapshotResponse>(request.runId, () => ({ ok: false, error: 'NO_SESSION' }), async (entry) => {
        const url = entry.window.webContents.getURL();
        const info = urlInfo(url);
        const image = await entry.window.webContents.capturePage();
        const size = image.getSize();
        const scale = Math.min(1, SNAPSHOT_MAX_EDGE / Math.max(size.width, size.height));
        const resized =
          scale < 1
            ? image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) })
            : image;
        const final = resized.getSize();
        return {
          ok: true,
          ...info,
          imageBase64: resized.toPNG().toString('base64'),
          mimeType: 'image/png' as const,
          width: final.width,
          height: final.height,
        };
      });
    },

    click(request) {
      return withEntry<BrowserActionResponse>(request.runId, () => ({ ok: false, error: 'NO_SESSION' }), async (entry) => {
        const info = urlInfo(entry.window.webContents.getURL());
        const matched = await entry.window.webContents.executeJavaScript(
          `((selector, text) => {
            const find = () => {
              if (selector) return document.querySelector(selector);
              const nodes = Array.from(document.querySelectorAll('button,a,input[type=submit],[role=button]'));
              return nodes.find((node) => ((node.innerText || node.value || '').trim().includes(text)));
            };
            const target = find();
            if (!target) return false;
            target.click();
            return true;
          })(${JSON.stringify(request.selector ?? null)}, ${JSON.stringify(request.text ?? '')})`,
          true,
        );
        return { ok: true, matched: Boolean(matched), ...info };
      });
    },

    type(request) {
      return withEntry<BrowserActionResponse>(request.runId, () => ({ ok: false, error: 'NO_SESSION' }), async (entry) => {
        const info = urlInfo(entry.window.webContents.getURL());
        const matched = await entry.window.webContents.executeJavaScript(
          `((selector, text, value, clear) => {
            const find = () => {
              if (selector) return document.querySelector(selector);
              const nodes = Array.from(document.querySelectorAll('input,textarea'));
              return nodes.find((node) => ((node.placeholder || node.getAttribute('aria-label') || '').includes(text)));
            };
            const target = find();
            if (!target) return false;
            target.focus();
            target.value = clear ? value : (target.value || '') + value;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })(${JSON.stringify(request.selector ?? null)}, ${JSON.stringify(request.text ?? '')}, ${JSON.stringify(request.value)}, ${request.clear ? 'true' : 'false'})`,
          true,
        );
        return { ok: true, matched: Boolean(matched), ...info };
      });
    },

    async close(runId) {
      const entry = entries.get(runId);
      if (!entry) return { ok: false, error: 'NO_SESSION' };
      await destroy(entry);
      return { ok: true };
    },

    closeAll() {
      for (const entry of entries.values()) {
        try {
          if (!entry.window.isDestroyed()) entry.window.destroy();
        } catch {
          // ignore
        }
      }
      entries.clear();
    },
  };
}
