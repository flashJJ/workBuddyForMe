/** Flow Studio 域：可视化工作流护栏与命名常量 */

/**
 * v0.8 Flow Studio 可视化工作流护栏与命名常量。
 */
export const FLOW_NAME_MAX = 60;
export const FLOW_DESCRIPTION_MAX = 500;
/** 单流程节点/边上限（防御异常大图拖垮编译器与执行器） */
export const FLOW_MAX_NODES = 100;
export const FLOW_MAX_EDGES = 200;
/** 节点 id 必须标识符安全（参与模板引用 $nodes.<id>，亦作画布稳定锚点） */
export const FLOW_NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
