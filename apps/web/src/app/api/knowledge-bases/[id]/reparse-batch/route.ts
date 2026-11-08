import {
  createDocumentReparseRunner,
  type DocumentReparseRunner,
} from '@wbfm/core/services';
import { idParamSchema, reparseBatchActionSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import type { ServiceContainer } from '@/lib/server/container-types';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.29 P1：队列属于进程内 HTTP 层，按服务容器懒建单例，避免污染核心服务契约 */
const runners = new WeakMap<ServiceContainer, DocumentReparseRunner>();

function runnerFor(services: ServiceContainer): DocumentReparseRunner {
  let runner = runners.get(services);
  if (!runner) {
    runner = createDocumentReparseRunner({
      listPending: (kbId) => services.documents.listPendingReparse(kbId),
      hasSource: (id) => services.documents.hasSource(id),
      reparseNow: (id) => services.documents.reparseNow(id),
    });
    runners.set(services, runner);
  }
  return runner;
}

/** v2.29 P1：批量重解析状态（轮询） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.knowledgeBases.get(id);
  return jsonOk(runnerFor(services).status());
});

/** v2.29 P1：开始 / 暂停 / 继续 / 取消；队列为进程内单飞 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(reparseBatchActionSchema, await readJsonBody(request));
  services.knowledgeBases.get(id);
  const runner = runnerFor(services);
  const actions = {
    start: () => runner.start(id),
    pause: () => runner.pause(),
    resume: () => runner.resume(),
    cancel: () => runner.cancel(),
  };
  return jsonOk(actions[body.action]());
});
