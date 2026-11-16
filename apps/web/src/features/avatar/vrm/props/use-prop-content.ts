'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/api/client';
import { PROPS, type PropRegistry, type PropSpec } from './prop-manifest';

interface PropContentPayload {
  version: string;
  props: PropSpec[];
}

/**
 * v4.3 M3：内置道具 + 已启用 prop-pack 的运行时注册表。
 * 读取失败只保留内置表，不阻塞角色渲染；安装/停用后下一次挂载生效。
 */
export function usePropContent(): {
  props: PropRegistry;
  version: string;
  ready: boolean;
} {
  const [packs, setPacks] = useState<PropRegistry>({});
  const [version, setVersion] = useState('none');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<PropContentPayload>('/api/prop-content')
      .then((value) => {
        if (cancelled || !isPropContent(value)) return;
        const next: Record<string, PropSpec> = {};
        for (const prop of value.props) next[prop.id] = prop;
        setPacks(next);
        setVersion(value.version);
      })
      .catch(() => {
        // 内容服务不可用时保持内置道具
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const props = useMemo(() => ({ ...PROPS, ...packs }), [packs]);
  return { props, version, ready };
}

function isPropContent(value: unknown): value is PropContentPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.version === 'string' && Array.isArray(record.props);
}
