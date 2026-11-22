'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  LONG_LIST_CHUNK,
  LONG_LIST_VIRTUALIZE_THRESHOLD,
  initialChunkStart,
} from './windowing';
import { useVirtualWindow } from './use-virtual-window';

interface Props {
  count: number;
  /** 设置开关关闭时退回 v4.19 的全量渲染 */
  enabled: boolean;
  /** 深链目标存在时强制全量挂载，保证目标可定位 */
  forceAll: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 会话变化时重置分块起点 */
  resetKey: string | null;
  renderItem: (index: number) => React.ReactNode;
  itemKey: (index: number) => string;
}

function MeasuredRow({
  id,
  measure,
  children,
}: {
  id: string;
  measure: (key: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => measure(id, el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, measure]);
  return <div ref={ref}>{children}</div>;
}

/**
 * v4.20：长会话渲染。
 * - 默认按需分块（最近 50 条），向上滚动或点按钮加载更早；
 * - 超过 200 条且开关开启时切换窗口化，overscan 10；
 * - forceAll（深链）时渲染全部，保证目标消息挂载。
 */
export function MessageRows({
  count,
  enabled,
  forceAll,
  containerRef,
  resetKey,
  renderItem,
  itemKey,
}: Props) {
  const { t } = useI18n();
  const virtual = enabled && !forceAll && count > LONG_LIST_VIRTUALIZE_THRESHOLD;
  const { window: visible, measure } = useVirtualWindow({
    active: virtual,
    count,
    itemKey,
    containerRef,
  });
  const [start, setStart] = React.useState(() => initialChunkStart(count));
  const loadingRef = React.useRef(false);

  React.useEffect(() => {
    setStart(initialChunkStart(count));
    // 只在切换会话时重置；追加消息不应改变已加载起点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  React.useEffect(() => {
    setStart((prev) => Math.min(prev, Math.max(0, count - 1)));
  }, [count]);

  React.useEffect(() => {
    if (forceAll) setStart(0);
  }, [forceAll]);

  const loadOlder = React.useCallback(() => {
    const el = containerRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setStart((prev) => Math.max(0, prev - LONG_LIST_CHUNK));
    requestAnimationFrame(() => {
      const node = containerRef.current;
      if (node) node.scrollTop += node.scrollHeight - prevHeight;
    });
  }, [containerRef]);

  React.useEffect(() => {
    if (virtual) return;
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop > 120 || start === 0 || loadingRef.current) return;
      loadingRef.current = true;
      loadOlder();
      requestAnimationFrame(() => {
        loadingRef.current = false;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [virtual, start, loadOlder, containerRef]);

  if (!enabled) {
    return <>{Array.from({ length: count }, (_, index) => renderItem(index))}</>;
  }

  if (virtual) {
    return (
      <>
        <div style={{ height: visible.top }} aria-hidden="true" />
        {Array.from({ length: Math.max(0, visible.end - visible.start) }, (_, offset) => {
          const index = visible.start + offset;
          const key = itemKey(index);
          return (
            <MeasuredRow key={key} id={key} measure={measure}>
              {renderItem(index)}
            </MeasuredRow>
          );
        })}
        <div style={{ height: visible.bottom }} aria-hidden="true" />
      </>
    );
  }

  return (
    <>
      {start > 0 ? (
        <div className="flex justify-center py-2">
          <button
            type="button"
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            data-testid="load-earlier-messages"
            onClick={loadOlder}
          >
            {t('chatMessages.list.loadEarlier', { count: start })}
          </button>
        </div>
      ) : null}
      {Array.from({ length: Math.max(0, count - start) }, (_, offset) => renderItem(start + offset))}
    </>
  );
}
