'use client';

import * as React from 'react';
import type { FullUpdaterStatus, UpdateChannel, UpdateStatus } from '@wbfm/shared/updater';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { openShortcutsOverlay } from '@/features/shortcuts/use-shortcuts-host';
import { reopenOnboarding } from '@/features/onboarding/use-onboarding-host';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

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

/** v1.2 M5：关于面板快捷入口（重放向导 / 快捷键浮层 / 帮助中心锚点），两个渲染分支共用 */
function AboutQuickLinks() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="about-quick-links">
      <Button type="button" variant="outline" size="sm" onClick={reopenOnboarding} data-testid="about-replay-wizard">
        {t('about.replayWizard')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openShortcutsOverlay}
        data-testid="about-shortcuts"
      >
        {t('shortcuts.title')}
      </Button>
      <a
        href="#help-center"
        className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-accent"
        data-testid="about-help"
      >
        {t('about.helpCenter')}
      </a>
    </div>
  );
}

export function AboutPanel() {
  const { t } = useI18n();
  const intl = useIntl();
  const toast = useToast();
  const { bridge, status, setStatus, refresh } = useUpdaterStatus();
  const [checking, setChecking] = React.useState(false);

  const statusText = (state: UpdateStatus): string => {
    switch (state.state) {
      case 'idle':
        return t('about.status.idle');
      case 'checking':
        return t('about.status.checking');
      case 'available':
        return t('about.status.available', { version: state.version });
      case 'not-available':
        return t('about.status.notAvailable');
      case 'downloading':
        return t('about.status.downloading', { percent: state.percent });
      case 'downloaded':
        return t('about.status.downloaded', { version: state.version });
      case 'error':
        return t('about.status.error', { message: state.message });
    }
  };

  // 无桥（纯浏览器/SSR）：仅渲染提示，避免页面布局空洞
  if (!bridge || !status) {
    return (
      <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="about-panel">
        <h3 className="font-medium">{t('about.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('about.desktopOnly')}</p>
        <AboutQuickLinks />
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
      if (cur.status.state === 'not-available') toast.info(t('about.upToDate'));
      else if (cur.status.state === 'error') {
        toast.error(t('about.checkFailed', { message: cur.status.message }));
      }
    } finally {
      setChecking(false);
    }
  };

  const handleChannel = async (channel: UpdateChannel) => {
    const next = await bridge.setChannel(channel);
    setStatus(next);
    toast.info(
      t('about.channelSwitched', {
        channel: channel === 'beta' ? t('about.channelBeta') : t('about.channelStable'),
      }),
    );
  };

  const handleInstall = () => {
    void bridge.install();
  };

  const downloaded = status.status.state === 'downloaded';

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="about-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{t('about.title')}</h3>
      </div>

      <AboutQuickLinks />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="block text-xs text-muted-foreground">
            {t('about.currentVersion')}
          </span>
          <span className="font-mono" data-testid="about-version">
            v{status.version}
          </span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">{t('about.lastCheck')}</span>
          <span>
            {status.lastCheckAt
              ? intl.formatDateTime(status.lastCheckAt)
              : t('about.lastCheckNever')}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="updater-channel">{t('about.channelLabel')}</Label>
        <Select
          id="updater-channel"
          data-testid="updater-channel"
          value={status.channel}
          onChange={(e) => void handleChannel(e.target.value as UpdateChannel)}
          disabled={!status.enabled}
        >
          <option value="stable">{t('about.channelStableOption')}</option>
          <option value="beta">{t('about.channelBetaOption')}</option>
        </Select>
        {!status.enabled && (
          <p className="text-xs text-muted-foreground">{t('about.devModeHint')}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void handleCheck()}
          disabled={!status.enabled || checking || downloaded}
          data-testid="updater-check"
        >
          {checking ? t('about.checking') : t('about.checkUpdate')}
        </Button>
        {downloaded && (
          <Button type="button" onClick={handleInstall} data-testid="updater-install">
            {t('about.installAndRestart')}
          </Button>
        )}
        <span className="text-sm text-muted-foreground" data-testid="updater-status">
          {statusText(status.status)}
        </span>
      </div>

      {status.status.state === 'error' && (
        <p className="text-xs text-muted-foreground">
          {t('about.releaseHintBefore')}{' '}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-primary underline">
            {t('about.releaseLink')}
          </a>{' '}
          {t('about.releaseHintAfter')}
        </p>
      )}

      <Live2DLicenseNotice />
    </section>
  );
}
