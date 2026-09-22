'use client';

import * as React from 'react';
import type { FullUpdaterStatus, UpdateChannel, UpdateStatus } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';

const RELEASES_URL = 'https://github.com/flashJJ/workBuddyForMe/releases';

/** 取 preload 注入的 updater 桥；纯浏览器/SSR 返回 undefined */
function useUpdaterBridge() {
  return React.useMemo(() => (typeof window !== 'undefined' ? window.wbfm?.updater : undefined), []);
}

/** 拉取 + 订阅 updater 状态；无桥时返回 null（调用方降级渲染） */
function useUpdaterStatus() {
  const bridge = useUpdaterBridge();
  const [status, setStatus] = React.useState<FullUpdaterStatus | null>(null);

  React.useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.getStatus().then((s) => {
      if (active) setStatus(s);
    });
    const off = bridge.onEvent((payload: UpdateStatus) => {
      setStatus((prev) => (prev ? { ...prev, status: payload } : prev));
    });
    return () => {
      active = false;
      off();
    };
  }, [bridge]);

  const refresh = React.useCallback(async () => {
    if (!bridge) return;
    const s = await bridge.getStatus();
    setStatus(s);
  }, [bridge]);

  return { bridge, status, setStatus, refresh };
}

function formatTime(iso: string | null): string {
  if (!iso) return '尚未检查';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusText(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return '未检查';
    case 'checking':
      return '检查中…';
    case 'available':
      return `发现新版本 v${status.version}，正在下载…`;
    case 'not-available':
      return '已是最新版本';
    case 'downloading':
      return `下载中 ${status.percent}%`;
    case 'downloaded':
      return `v${status.version} 下载完成，重启以安装`;
    case 'error':
      return `更新失败：${status.message}`;
  }
}

export function AboutPanel() {
  const toast = useToast();
  const { bridge, status, setStatus, refresh } = useUpdaterStatus();
  const [checking, setChecking] = React.useState(false);

  // 无桥（纯浏览器/SSR）：仅渲染提示，避免页面布局空洞
  if (!bridge || !status) {
    return (
      <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="about-panel">
        <h3 className="font-medium">关于</h3>
        <p className="text-xs text-muted-foreground">自动更新检查仅在桌面端可用。</p>
      </section>
    );
  }

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await bridge.check();
      await refresh();
      const cur = await bridge.getStatus();
      if (cur.status.state === 'not-available') toast.info('已是最新版本');
      else if (cur.status.state === 'error') toast.error(`更新检查失败：${cur.status.message}`);
    } finally {
      setChecking(false);
    }
  };

  const handleChannel = async (channel: UpdateChannel) => {
    const next = await bridge.setChannel(channel);
    setStatus(next);
    toast.info(`已切换到 ${channel === 'beta' ? 'Beta' : '稳定'} 通道`);
  };

  const handleInstall = () => {
    void bridge.install();
  };

  const downloaded = status.status.state === 'downloaded';

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="about-panel">
      <h3 className="font-medium">关于</h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="block text-xs text-muted-foreground">当前版本</span>
          <span className="font-mono" data-testid="about-version">
            v{status.version}
          </span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">上次检查</span>
          <span>{formatTime(status.lastCheckAt)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="updater-channel">更新通道</Label>
        <Select
          id="updater-channel"
          data-testid="updater-channel"
          value={status.channel}
          onChange={(e) => void handleChannel(e.target.value as UpdateChannel)}
          disabled={!status.enabled}
        >
          <option value="stable">稳定版（Stable）</option>
          <option value="beta">测试版（Beta）</option>
        </Select>
        {!status.enabled && (
          <p className="text-xs text-muted-foreground">开发态不检查更新。</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void handleCheck()}
          disabled={!status.enabled || checking || downloaded}
          data-testid="updater-check"
        >
          {checking ? '检查中…' : '检查更新'}
        </Button>
        {downloaded && (
          <Button type="button" onClick={handleInstall} data-testid="updater-install">
            重启以安装
          </Button>
        )}
        <span className="text-sm text-muted-foreground" data-testid="updater-status">
          {statusText(status.status)}
        </span>
      </div>

      {status.status.state === 'error' && (
        <p className="text-xs text-muted-foreground">
          可前往{' '}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-primary underline">
            Release 页面
          </a>{' '}
          手动下载。
        </p>
      )}
    </section>
  );
}
