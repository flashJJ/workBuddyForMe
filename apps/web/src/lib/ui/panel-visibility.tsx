'use client';

import * as React from 'react';
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

/** v2.16：设置页等长页面的可见性上下文；默认 true，页面外行为不变 */
const PanelVisibilityContext = React.createContext(true);

export function usePanelVisible(): boolean {
  return React.useContext(PanelVisibilityContext);
}

/** 可见性门控：首次进入视口后置 true 并保持，不卸载子节点 */
export function PanelVisibilityGate({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <PanelVisibilityContext.Provider value={visible}>{children}</PanelVisibilityContext.Provider>
    </div>
  );
}

/** 可见性感知的 useQuery：不可见时保留 query 定义但不发请求 */
export function useVisibleQuery<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const visible = usePanelVisible();
  return useQuery({
    ...options,
    enabled: visible && (options.enabled ?? true),
  });
}
