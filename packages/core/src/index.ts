/**
 * @wbfm/core 根 barrel（v1.1 M2 域子路径化）：
 * 只做各域 barrel 的聚合，公开面与历史完全一致；新代码优先按域子路径导入：
 *   @wbfm/core/chat、@wbfm/core/tools、@wbfm/core/flow、@wbfm/core/services …
 * 根 barrel 在 v1.1 兼容期保留；各域导出名互斥，冲突在域 barrel 内解决。
 * 例外：voice 运行时域（@wbfm/core/voice，依赖 sherpa-onnx-node 原生绑定）有意不
 * 聚合进根 barrel，避免无关消费者被拉入原生模块图，只经域子路径公开。
 */
export * from './secrets';
export * from './services';
export * from './agent';
export * from './chat';
export * from './memory';
export * from './ingestion';
export * from './retrieval';
export * from './tools';
export * from './computer';
export * from './mcp';
export * from './serving';
export * from './skills';
export * from './backup';
export * from './share';
export * from './flow';
