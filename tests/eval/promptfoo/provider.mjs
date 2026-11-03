import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const byId = new Map(cases.map((item) => [item.id, item]));

/**
 * v2.19 M5：Promptfoo mock provider。
 * 返回固定 golden 输出，用于锁定「解析/引用/对比/图检索/空结果」回归口径；
 * 不调用模型、不依赖网络，CI 可稳定运行。
 */
export default class WbfmRagGoldenProvider {
  id() {
    return 'wbfm-rag-golden';
  }

  async callApi(_prompt, context) {
    const caseId = context?.vars?.caseId;
    const item = byId.get(caseId);
    if (!item) return { error: `未知评测用例：${caseId}` };
    return {
      output: item.output,
      metadata: { caseId, query: item.query },
    };
  }
}
