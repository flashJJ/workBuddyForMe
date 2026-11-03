export type { Point, CubicCurve, RectLike } from './geometry';
export {
  buildCurve,
  clamp01,
  curvePath,
  distance,
  easeInOutCubic,
  pointOnCurve,
  rectCenter,
  seedFromString,
  segmentPath,
} from './geometry';
export { createLayerSvg, createTrail, lightColor, removeTrail, seedTrail, updateTrail } from './svg';
export {
  createLightLayer,
  type FlightResult,
  type LightAnchor,
  type LightEmitInput,
  type LightFlight,
  type LightLayer,
  type LightLayerOptions,
} from './light-layer';
export { RunningBorder, type RunningBorderProps } from './running-border';
