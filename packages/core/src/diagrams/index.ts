/** v2.18 M2：结构化图表（数据 schema + SVG 模板渲染） */
export {
  DIAGRAM_TYPES,
  DIAGRAM_SIZES,
  diagramInputSchema,
  type DiagramInput,
  type DiagramType,
  type DiagramSize,
  type RenderedDiagram,
} from './types';
export { renderDiagram } from './renderer';
