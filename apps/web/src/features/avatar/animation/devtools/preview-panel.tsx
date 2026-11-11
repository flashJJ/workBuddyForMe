'use client';

/**
 * M0c T1.8：动效库 dev 预览面板。
 *
 * 只读观测 + 手动播放/停止，不参与 animate 调度（250ms 轮询快照）；
 * 通过 `NEXT_PUBLIC_WBFM_MOTION_PREVIEW=1` 挂到桌宠舞台，生产默认不渲染。
 */

import * as React from 'react';
import { BEHAVIORS } from '../behaviors';
import { getBehaviorDebug, type BehaviorDebugSnapshot } from '../observability';

const POLL_MS = 250;

export interface BehaviorPreviewPanelProps {
  onPlay: (id: string) => void;
  onStop: () => void;
  /** 默认读全局观测源（dev 探针安装后有效） */
  getSnapshot?: () => BehaviorDebugSnapshot | null;
  behaviors?: readonly { id: string; priority: number }[];
  pollMs?: number;
}

function shortId(id: string): string {
  return id.replace(/^behavior\./, '');
}

export function BehaviorPreviewPanel({
  onPlay,
  onStop,
  getSnapshot = getBehaviorDebug,
  behaviors = BEHAVIORS,
  pollMs = POLL_MS,
}: BehaviorPreviewPanelProps) {
  const [snapshot, setSnapshot] = React.useState<BehaviorDebugSnapshot | null>(null);

  React.useEffect(() => {
    const tick = () => setSnapshot(getSnapshot());
    tick();
    const timer = setInterval(tick, pollMs);
    return () => clearInterval(timer);
  }, [getSnapshot, pollMs]);

  const tracks = snapshot?.tracks ?? [];
  const transitions = snapshot?.transitions ?? [];

  return (
    <div className="pointer-events-auto fixed bottom-2 right-2 z-50 max-h-[70vh] w-72 overflow-auto rounded-md border border-white/15 bg-neutral-900/95 p-2 font-mono text-[10px] text-neutral-200 shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">动效库</span>
        <span className="text-neutral-400">
          {snapshot?.id ? shortId(snapshot.id) : '—'} / {snapshot?.phase ?? '—'} / w=
          {snapshot?.weight ?? 0}
        </span>
      </div>

      <div className="mb-1 flex flex-wrap gap-1">
        {behaviors.map((behavior) => (
          <button
            key={behavior.id}
            type="button"
            title={`${behavior.id}（priority ${behavior.priority}）`}
            onClick={() => onPlay(behavior.id)}
            className="rounded bg-white/10 px-1.5 py-0.5 hover:bg-white/20"
          >
            {shortId(behavior.id)}
          </button>
        ))}
        <button
          type="button"
          onClick={onStop}
          className="rounded bg-red-500/30 px-1.5 py-0.5 hover:bg-red-500/50"
        >
          停止
        </button>
      </div>

      <ul className="mb-1 space-y-0.5">
        {tracks.map((track, index) => (
          <li key={`${track.kind}:${track.ref ?? index}`} className="flex justify-between gap-2">
            <span className="truncate text-neutral-400">
              {track.kind}
              {track.ref ? ` · ${shortId(track.ref)}` : ''}
            </span>
            <span>{track.weight.toFixed(2)}</span>
          </li>
        ))}
        {tracks.length === 0 && <li className="text-neutral-500">无活跃轨道</li>}
      </ul>

      <div className="mb-0.5 text-neutral-500">过渡（最近 {transitions.length}）</div>
      <ul className="space-y-0.5">
        {transitions.map((transition, index) => (
          <li
            key={`${transition.id ?? 'none'}:${transition.atMs}:${index}`}
            className="flex justify-between gap-2 text-neutral-400"
          >
            <span className="truncate">
              {transition.id ? shortId(transition.id) : '结束'}
            </span>
            <span>
              {transition.phase ?? '—'} @{transition.atMs}ms
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface MotionPreviewOverlayProps {
  /** 桌宠 controllerRef（VRM 有 playBehavior/stopBehavior，Live2D 静默跳过） */
  controllerRef: React.MutableRefObject<unknown>;
}

/** dev 挂载壳：把面板按钮接到当前 controller 的分层行为能力上 */
export function MotionPreviewOverlay({ controllerRef }: MotionPreviewOverlayProps) {
  const play = React.useCallback(
    (id: string) => {
      const controller = controllerRef.current as { playBehavior?: (id: string) => boolean } | null;
      controller?.playBehavior?.(id);
    },
    [controllerRef],
  );
  const stop = React.useCallback(() => {
    const controller = controllerRef.current as { stopBehavior?: () => boolean } | null;
    controller?.stopBehavior?.();
  }, [controllerRef]);

  return <BehaviorPreviewPanel onPlay={play} onStop={stop} />;
}
