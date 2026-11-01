/**
 * @wbfm/core 根 barrel（v1.1 M2 域子路径化）：
 * 只做各域 barrel 的聚合，公开面与历史完全一致；新代码优先按域子路径导入：
 *   @wbfm/core/chat、@wbfm/core/tools、@wbfm/core/flow、@wbfm/core/services …
 * 根 barrel 在 v1.1 兼容期保留；各域导出名互斥，冲突在域 barrel 内解决。
 * 例外：voice 运行时域（@wbfm/core/voice，依赖 sherpa-onnx-node 原生绑定）有意不
 * 聚合进根 barrel，避免无关消费者被拉入原生模块图，只经域子路径公开。
 */
export * from './secrets/index';
export * from './services/index';
export * from './agent/index';
export * from './chat/index';
export * from './memory/index';
export * from './ingestion/index';
export * from './retrieval/index';
export * from './knowledge/index';
export * from './agents/index';
export * from './meeting/index';
export * from './emotion/index';
export * from './tools/index';
export * from './computer/index';
export * from './mcp/index';
export * from './serving/index';
export * from './skills/index';
export * from './backup/index';
export * from './reports/index';
export * from './share/index';
export * from './flow/index';
export * from './event/index';
export * from './scheduler/index';
export * from './work-signal/index';
// v2.8–v2.10 新增域：子路径导出在生产条件下指向根产物 dist/index.*，
// 必须同步聚合进根 barrel，否则 next start / standalone 会出现 symbol 缺失。
export * from './work-plan/index';
export * from './session-log/index';
export * from './capabilities/index';
export * from './governance/index';
export * from './diagnostics/index';
