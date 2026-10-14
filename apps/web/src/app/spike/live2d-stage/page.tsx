import { notFound } from 'next/navigation';
import { SpikeHarness } from './spike-harness';

/**
 * v1.9 M0 性能 spike 专用路由（非正式功能页）：
 * 仅当服务端环境变量 WBFM_SPIKE=1 时可访问，其余一律 404；
 * 生产构建会编译本路由，但未开启开关时不渲染任何 Live2D 资源。
 */
export const dynamic = 'force-dynamic';

export default function Live2dStageSpikePage() {
  if (process.env.WBFM_SPIKE !== '1') notFound();
  return <SpikeHarness />;
}
