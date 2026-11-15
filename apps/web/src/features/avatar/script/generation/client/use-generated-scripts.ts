'use client';

import * as React from 'react';
import type {
  PetScriptGenerationResult,
  PetScriptGenerationUsage,
  PetScriptSceneMeta,
  PetScriptScheduleSummary,
  PetScriptStatusView,
  PetScriptStorySummary,
  PetScriptTickResult,
  Scene,
} from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';

/**
 * P8.3–P8.5：生成剧本队列（客户端）。
 *
 * - 启动时 GET 队列/用量/剧情/调度，并 tick 一次（到期才生成）；
 * - 之后每小时 tick 一次；页面关闭即停，不建服务端常驻定时器；
 * - `generate()` 手动生成；`toggleSchedule` 开/关每日自动（默认关）。
 * - 队列/剧情变化会让 useScriptDirector 重建 Director（生成发生在空闲时）。
 */
export interface GeneratedScriptsState {
  scenes: Scene[];
  /** 阶段 3：队列场景的 theme/tags 与弱偏好（sceneId → meta） */
  sceneMeta: Record<string, PetScriptSceneMeta>;
  usage: PetScriptGenerationUsage | null;
  story: PetScriptStorySummary | null;
  schedule: PetScriptScheduleSummary | null;
  loading: boolean;
  ticking: boolean;
  message: string | null;
  generate: () => Promise<void>;
  tick: () => Promise<void>;
  toggleSchedule: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const TICK_MS = 60 * 60 * 1000;

export function useGeneratedScripts(enabled: boolean): GeneratedScriptsState {
  const [scenes, setScenes] = React.useState<Scene[]>([]);
  const [sceneMeta, setSceneMeta] = React.useState<Record<string, PetScriptSceneMeta>>({});
  const [usage, setUsage] = React.useState<PetScriptGenerationUsage | null>(null);
  const [story, setStory] = React.useState<PetScriptStorySummary | null>(null);
  const [schedule, setSchedule] = React.useState<PetScriptScheduleSummary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [ticking, setTicking] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const applyView = React.useCallback((view: PetScriptStatusView) => {
    setScenes(view.scenes);
    setSceneMeta(view.sceneMeta ?? {});
    setUsage(view.usage);
    setStory(view.story);
    setSchedule(view.schedule);
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      applyView(await apiGet<PetScriptStatusView>('/api/pet/script'));
    } catch {
      // 生成器不可用（未配置模型/接口离线）时保持本地池
    }
  }, [applyView]);

  const tick = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await apiPost<PetScriptTickResult>('/api/pet/script/tick', {});
      applyView(result);
      if (result.triggered) {
        setMessage(
          result.reason === 'ok'
            ? `自动生成 ${result.scenes[0]?.id ?? ''}（${result.usage.tokens} tok）`
            : `自动生成回落：${result.issues[0] ?? result.reason}`,
        );
      }
    } catch {
      // 心跳失败静默；下一次 10 分钟后再试
    }
  }, [enabled, applyView]);

  const generate = React.useCallback(async () => {
    if (!enabled || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await apiPost<PetScriptGenerationResult>('/api/pet/script', {});
      setScenes(result.scenes);
      setSceneMeta(result.sceneMeta ?? {});
      setUsage(result.usage);
      setStory(result.story);
      setMessage(
        result.ok
          ? `已生成 ${result.scenes[0]?.id ?? ''}（${result.usage.tokens} tok）`
          : `回落本地池：${result.issues[0] ?? result.reason}`,
      );
    } catch (error) {
      setMessage(`生成失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [enabled, loading]);

  const toggleSchedule = React.useCallback(
    async (next: boolean) => {
      try {
        const result = await apiPost<{ schedule: PetScriptScheduleSummary }>(
          '/api/pet/script/schedule',
          { enabled: next },
        );
        setSchedule(result.schedule);
        setMessage(next ? '已开启每日自动生成' : '已关闭每日自动生成');
        if (next) await tick();
      } catch (error) {
        setMessage(`自动生成设置失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
    [tick],
  );

  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
    void tick();
    const timer = setInterval(() => void tick(), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh, tick]);

  const tickOnce = React.useCallback(async () => {
    if (ticking) return;
    setTicking(true);
    try {
      await tick();
    } finally {
      setTicking(false);
    }
  }, [ticking, tick]);

  return {
    scenes,
    sceneMeta,
    usage,
    story,
    schedule,
    loading,
    ticking,
    message,
    generate,
    tick: tickOnce,
    toggleSchedule,
    refresh,
  };
}
