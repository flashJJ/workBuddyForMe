import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getDataRoot } from '@wbfm/config';
import { closeDatabase } from '@wbfm/database';
import { resetCompileQueueServiceForTest } from '@wbfm/core/knowledge';
import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { __setContainerForTest, getServices } from '@/lib/server/container';
import { stopServerScheduler } from '@/lib/server/server-scheduler';
import { resetVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

/** 运行日志与业务状态无关，且 Windows 下日志句柄未释放会导致删目录 EPERM */
const KEEP_ON_RESET = new Set(['logs']);

/** 清空数据根内容（保留根目录本身与 logs），返回失败条目 */
function clearDataRoot(): string[] {
  const failed: string[] = [];
  for (const entry of readdirSync(getDataRoot())) {
    if (KEEP_ON_RESET.has(entry)) continue;
    try {
      rmSync(join(getDataRoot(), entry), {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch (error) {
      failed.push(`${entry}: ${(error as Error).message}`);
    }
  }
  return failed;
}

/**
 * E2E 专用「恢复出厂」入口（仅 WBFM_MOCK_AI=1 挂载，生产环境恒 404）。
 *
 * 背景：所有 E2E 共用一个数据根，跨 spec 的残留（供应商/设置/能力包/场景）
 * 会造成顺序依赖与重试必败，此前只能逐条补清理补丁。这里一次性清空数据根
 * 并丢弃服务容器，下一次请求重建全新库，使任何 spec 单独或乱序运行都成立。
 *
 * 默认 hasOnboarded=true：避免每个 spec 都被首启向导遮罩拦截；
 * 需要首启态的用例自行 PUT /api/settings 复位（00-onboarding 已如此）。
 */
export const POST = defineRoute(({ request, services }) => {
  if (process.env.WBFM_MOCK_AI !== '1') throw ApiError.notFound('测试重置接口');
  // 顺序重要：先停定时器与数据库连接，避免删除目录时仍有句柄（Windows 会 EPERM）
  stopServerScheduler();
  // v4.24：定时调度器与数据库生命周期绑定，重置前必须停止，避免残留 tick 访问已关闭连接
  services.flowSchedules.scheduler.dispose();
  services.flowRunner.dispose();
  resetVoiceRuntime();
  // 编译队列是 core 模块级单例（绑定首次 deps），不重置会继续用旧库：上传后永远「待编译」
  resetCompileQueueServiceForTest();
  // 直接关容器持有的连接：Next 分块打包可能让 @wbfm/database 单例出现在不同
  // chunk（closeDatabase 关不到这里的实例），会留下 sqlite 文件句柄导致删库失败。
  services.db.close();
  closeDatabase();
  __setContainerForTest(null);
  const failed = clearDataRoot();
  if (failed.length > 0) {
    throw new ApiError('INTERNAL_ERROR', `数据根清理不完整：${failed.join('；')}`);
  }
  // 触发全新库：迁移 + 内置种子（起始知识库/示例流程/技能）重新就位
  const rebuilt = getServices();
  const onboarded = new URL(request.url).searchParams.get('onboarded') !== '0';
  if (onboarded) rebuilt.settings.update({ hasOnboarded: true });
  return jsonOk({ reset: true, onboarded });
});
