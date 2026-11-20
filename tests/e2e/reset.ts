import type { APIRequestContext } from '@playwright/test';

/**
 * 每个 spec 文件开始前调用：清空数据根并重建服务容器（仅 E2E mock 模式可用）。
 *
 * 所有 spec 共用一个数据根，跨文件残留（供应商/设置/能力包/场景）会造成
 * 顺序依赖与「重试必败」；把隔离下沉到服务端「恢复出厂」后，spec 内不再
 * 需要各自编写 beforeAll/afterAll 清理补丁。
 *
 * 语义是**文件级**的：同一文件内的 serial 步骤仍共享状态（这正是串行组需要的）。
 */
export async function resetE2eData(
  request: APIRequestContext,
  options: { onboarded?: boolean } = {},
): Promise<void> {
  const query = options.onboarded === false ? '?onboarded=0' : '';
  const response = await request.post(`/api/testing/reset${query}`);
  if (!response.ok()) {
    throw new Error(`E2E 数据重置失败：${response.status()} ${await response.text()}`);
  }
}
