import { notFound } from 'next/navigation';
import { VrmSpikeHarness } from './spike-vrm-harness';

/**
 * v2.0 M0 VRM 性能 spike 专用路由（非正式功能页）：
 * 仅 WBFM_SPIKE=1 可访问，其余一律 404。样本模型由门控 /model 路由从
 * scripts/fixtures 提供（不进 public/安装包）。
 */
export const dynamic = 'force-dynamic';

export default function VrmStageSpikePage() {
  if (process.env.WBFM_SPIKE !== '1') notFound();
  return <VrmSpikeHarness />;
}
