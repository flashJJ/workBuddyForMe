'use client';

/**
 * P8.2：剧本调试面板（dev）。
 *
 * - 列出全部内置/剧本池场景，一键交给 Director 手动播放（pool.* 仅此处可播）；
 * - 轮询 `__petDebug`：活跃场景游标、最近 cue 日志、触发诊断；
 * - 只读观测，不参与 Director 调度；生产构建不渲染。
 */

import * as React from 'react';
import type {
  Cue,
  PetScriptGenerationUsage,
  PetScriptScheduleSummary,
  PetScriptStorySummary,
} from '@wbfm/shared/schemas';
import { getPetScriptDebug, type PetScriptDebugApi } from '../debug';

const POLL_MS = 300;
const LOG_LIMIT = 12;
const GROUP_ORDER = ['gen', 'pool', 'moment', 'touch', 'ambient', 'state'] as const;

export interface ScriptDebugPanelProps {
  getDebug?: () => PetScriptDebugApi | null;
  pollMs?: number;
  /** 面板位置上报：桌宠主进程把这块区域并入命中轮廓，穿透态下也能点 */
  onRectChange?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  /** P8.3：生成一条受限剧本 */
  onGenerate?: () => void;
  generating?: boolean;
  generationMessage?: string | null;
  usage?: PetScriptGenerationUsage | null;
  /** P8.4：剧情摘要（线索数/悬念/近期主题） */
  story?: PetScriptStorySummary | null;
  /** P8.5：每日自动生成开关与今日次数 */
  schedule?: PetScriptScheduleSummary | null;
  onToggleSchedule?: (enabled: boolean) => void;
}

function groupOf(sceneId: string): string {
  return sceneId.split('.')[0] ?? sceneId;
}

function cueLabel(cue: Cue): string {
  switch (cue.kind) {
    case 'pose':
      return `pose:${cue.preset}`;
    case 'gesture':
      return `gesture:${cue.gesture}`;
    case 'motion':
      return `motion:${cue.motion.replace(/^motion[.:]/, '')}`;
    case 'behavior':
      return `behavior:${cue.behavior.replace(/^behavior\./, '')}`;
    case 'prop':
      return `prop:${cue.prop}/${cue.action}`;
    case 'expression':
      return `expr:${cue.tag}`;
    case 'look':
      return `look:${cue.target}`;
    case 'line':
      return `line:${cue.pool}`;
    case 'speak':
      return `speak:${cue.text ?? cue.pool ?? ''}`;
    case 'wait':
      return `wait:${cue.ms}ms`;
    case 'branch':
      return 'branch';
    default:
      return cue.kind;
  }
}

export function ScriptDebugPanel({
  getDebug = getPetScriptDebug,
  pollMs = POLL_MS,
  onRectChange,
  onGenerate,
  generating = false,
  generationMessage,
  usage,
  story,
  schedule,
  onToggleSchedule,
}: ScriptDebugPanelProps) {
  const [api, setApi] = React.useState<PetScriptDebugApi | null>(null);
  const [, setVersion] = React.useState(0);
  const [lastPlay, setLastPlay] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const setRoot = React.useCallback((el: HTMLElement | null) => {
    rootRef.current = el;
  }, []);
  const rectCbRef = React.useRef(onRectChange);
  rectCbRef.current = onRectChange;

  const reportRect = React.useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    rectCbRef.current?.(
      rect && rect.width > 0 && rect.height > 0
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
    );
  }, []);

  // 展开/收起后立即同步矩形，避免 300ms 轮询窗口内点击落空
  React.useLayoutEffect(() => {
    reportRect();
  }, [open, api, reportRect]);

  React.useEffect(() => {
    const tick = () => {
      setApi(getDebug());
      setVersion((value) => value + 1);
      // 日志增长会改面板高度：轮询把实际矩形持续报给命中轮廓
      reportRect();
    };
    tick();
    const timer = setInterval(tick, pollMs);
    return () => {
      clearInterval(timer);
      rectCbRef.current?.(null);
    };
  }, [getDebug, pollMs, reportRect]);

  if (process.env.NODE_ENV === 'production' || !api) return null;

  const groups = new Map<string, string[]>();
  for (const id of api.scenes) {
    const group = groupOf(id);
    const list = groups.get(group);
    if (list) list.push(id);
    else groups.set(group, [id]);
  }
  const orderedGroups = [...groups.keys()].sort((a, b) => {
    const order = GROUP_ORDER as readonly string[];
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA < 0 ? order.length : indexA) - (indexB < 0 ? order.length : indexB);
  });

  const play = (id: string) => {
    setLastPlay(`${api.playScene(id) ? '播放' : '拒绝'} ${id}`);
  };
  const active = api.active;
  const logs = api.log.slice(-LOG_LIMIT).reverse();

  if (!open) {
    return (
      <button
        ref={setRoot}
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed right-2 top-2 z-50 rounded-md border border-white/15 bg-neutral-900/95 px-2 py-1 font-mono text-[10px] text-neutral-200 shadow-lg hover:bg-neutral-800"
      >
        剧本 {active.length > 0 ? `· ${active.length} 活跃` : ''}
      </button>
    );
  }

  return (
    <div
      ref={setRoot}
      className="pointer-events-auto fixed right-2 top-2 z-50 max-h-[55vh] w-64 overflow-auto rounded-md border border-white/15 bg-neutral-900/95 p-2 font-mono text-[10px] text-neutral-200 shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">剧本</span>
        <span className="flex items-center gap-2 text-neutral-400">
          活跃 {active.length} / {api.scenes.length}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded bg-white/10 px-1 py-0.5 hover:bg-white/20"
          >
            收起
          </button>
        </span>
      </div>

      <div className="mb-1 flex justify-between text-neutral-500">
        <span>events {api.events}</span>
        <span>handled {api.handled}</span>
        <span className="truncate">trig {api.lastTrigger ?? '—'}</span>
      </div>

      {onGenerate && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="rounded bg-emerald-500/30 px-1.5 py-0.5 hover:bg-emerald-500/50 disabled:opacity-40"
            >
              {generating ? '生成中…' : '生成剧本'}
            </button>
            {onToggleSchedule && (
              <button
                type="button"
                onClick={() => onToggleSchedule(!schedule?.enabled)}
                className={`rounded px-1.5 py-0.5 ${
                  schedule?.enabled
                    ? 'bg-sky-500/40 text-white hover:bg-sky-500/60'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {schedule?.enabled ? '自动：开' : '自动：关'}
              </button>
            )}
          </div>
          <span className="text-right text-neutral-500">
            {usage ? `${usage.calls}/${usage.callLimit} · ${usage.tokens} tok` : ''}
            {schedule?.enabled ? ` · 自动 ${schedule.runsToday}/${schedule.perDay}` : ''}
          </span>
        </div>
      )}
      {generationMessage && <div className="mb-1 text-amber-300">{generationMessage}</div>}
      {story && (
        <div
          className="mb-1 truncate text-neutral-400"
          title={
            [
              story.recentThemes.length > 0 ? `最近主题：${story.recentThemes.join(' / ')}` : '',
              story.recentProps.length > 0 ? `最近道具：${story.recentProps.join(' / ')}` : '',
            ]
              .filter(Boolean)
              .join('\n') || undefined
          }
        >
          线索 {story.openThreads} · 悬念 {story.cliffhanger ?? '无'}
        </div>
      )}

      <ul className="mb-1 space-y-0.5">
        {active.map((item) => (
          <li key={item.sceneId} className="flex justify-between gap-2">
            <span className="truncate text-emerald-300">{item.sceneId}</span>
            <span>
              {item.cursor}/{item.total}
            </span>
          </li>
        ))}
        {active.length === 0 && <li className="text-neutral-500">无活跃场景</li>}
      </ul>

      {orderedGroups.map((group) => (
        <div key={group} className="mb-1">
          <div className="mb-0.5 text-neutral-500">{group}</div>
          <div className="flex flex-wrap gap-1">
            {(groups.get(group) ?? []).map((id) => (
              <button
                key={id}
                type="button"
                title={id}
                onClick={() => play(id)}
                className="rounded bg-white/10 px-1.5 py-0.5 hover:bg-white/20"
              >
                {id.slice(group.length + 1)}
              </button>
            ))}
          </div>
        </div>
      ))}

      {lastPlay && <div className="mb-1 text-amber-300">{lastPlay}</div>}

      <div className="mb-0.5 text-neutral-500">Cue 日志（最近 {logs.length}）</div>
      <ul className="space-y-0.5">
        {logs.map((entry, index) => (
          <li
            key={`${entry.sceneId}:${entry.at}:${index}`}
            className="flex justify-between gap-2 text-neutral-400"
          >
            <span className="truncate">
              {entry.sceneId.slice(groupOf(entry.sceneId).length + 1)} · {cueLabel(entry.cue)}
            </span>
            <span>@{Math.round(entry.beatAt)}ms</span>
          </li>
        ))}
        {logs.length === 0 && <li className="text-neutral-500">暂无 cue</li>}
      </ul>
    </div>
  );
}
