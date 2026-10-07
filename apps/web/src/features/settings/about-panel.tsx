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

/** v1.0 M3/M3.5：Live2D 组件与 5 套样本模型的第三方许可声明（随形象功能再分发所必需） */
const SAMPLE_MODELS = 'Haru（接待员晴）、Hiyori（百濑日和）、Mark（马克）、Mao（虹猫）、Wanko（汪子饼）';

function Live2DLicenseNotice() {
  return (
    <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground" data-testid="live2d-license">
      <p className="font-medium text-foreground">第三方许可</p>
      <p>
        虚拟形象使用 Live2D Cubism Core（© Live2D Limited，Live2D Proprietary Software
        License）与 pixi-live2d-display（MIT）渲染；内置角色 {SAMPLE_MODELS}
        的模型与贴图素材 © Live2D Limited，依 Live2D Cubism Web Samples 样本素材许可（Sample
        Content License / Free Material License）再分发，每套模型目录附带官方 LICENSE.md。
        商业使用请遵循 Live2D Cubism SDK 发布许可条款；本应用仅提供内置固定角色，不支持导入外部
        Live2D 模型（避免落入「可扩展性应用」付费许可类别）。
      </p>
      {/* Live2D 官方原创角色样本要求在作品中逐字标注此版权声明（见 sample-model-terms） */}
      <p lang="en" className="border-l-2 pl-2 leading-relaxed">
        This content uses sample data owned and copyrighted by Live2D Inc. The sample data are
        utilized in accordance with terms and conditions set by Live2D Inc. This content itself
        is created at the author&apos;s sole discretion.
      </p>
    </div>
  );
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
        <Live2DLicenseNotice />
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

      <Live2DLicenseNotice />
    </section>
  );
}
