/**
 * v2.20 M3 Light UI 图层：发射、暂停/恢复、销毁与并发上限。
 * 不用 React state 驱动每一帧；DOM 由 svg.ts 维护，调用方只拿 finished 结果。
 */
import { buildCurve, easeInOutCubic, type Point, rectCenter } from './geometry';
import { createEnvironment, type Environment, type LightLayerOptions } from './environment';
import { createLayerSvg, createTrail, removeTrail, seedTrail, updateTrail, type TrailNodes } from './svg';

export type { LightLayerOptions } from './environment';

export type LightAnchor = Element | Point | (() => Element | Point | null);

export interface LightEmitInput {
  id: string;
  source: LightAnchor;
  target: LightAnchor;
  /** 语义 token（primary/info/success/warning/destructive 等） */
  color: string;
  duration?: number;
  seed?: number;
  sourceKind?: 'model' | 'bubble';
}

export type FlightResult = 'arrived' | 'cancelled' | 'missing-anchor';

export interface LightFlight {
  finished: Promise<FlightResult>;
  cancel(): void;
}

export interface LightLayer {
  emit(input: LightEmitInput): LightFlight;
  pause(): void;
  resume(): void;
  destroy(): void;
}

const DEFAULT_DURATION = 1200;
const MAX_ACTIVE = 12;
const MIN_DURATION = 120;
const MAX_DURATION = 4000;

interface FlightState {
  id: string;
  curve: ReturnType<typeof buildCurve>;
  nodes: TrailNodes;
  duration: number;
  elapsed: number;
  settle: (result: FlightResult) => void;
}

const NOOP_LAYER: LightLayer = {
  emit: () => ({ finished: Promise.resolve('cancelled'), cancel: () => undefined }),
  pause: () => undefined,
  resume: () => undefined,
  destroy: () => undefined,
};

function clampDuration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_DURATION;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, value));
}

export function createLightLayer(
  root: HTMLElement = typeof document !== 'undefined' ? document.body : (undefined as unknown as HTMLElement),
  options: LightLayerOptions = {},
): LightLayer {
  if (typeof document === 'undefined' || !root) return NOOP_LAYER;

  const env: Environment = createEnvironment(options);
  const svg = createLayerSvg(root);
  const flights = new Map<string, FlightState>();
  let frameHandle: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  let hidden = typeof document !== 'undefined' && document.hidden === true;
  let paused = hidden;
  let userPaused = false;

  const origin = root === document.body
    ? { x: 0, y: 0 }
    : (() => {
        const rect = root.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      })();

  function resolveAnchor(anchor: LightAnchor): Point | null {
    let value: Element | Point | null;
    try {
      value = typeof anchor === 'function' ? anchor() : anchor;
    } catch {
      return null;
    }
    if (!value) return null;
    if (typeof value === 'object' && 'getBoundingClientRect' in value) {
      const element = value as Element;
      const rect = element.getBoundingClientRect();
      const rects = typeof element.getClientRects === 'function' ? element.getClientRects() : null;
      if ((rect.width < 1 || rect.height < 1) && (!rects || rects.length === 0)) return null;
      const center = rectCenter(rect);
      return { x: center.x - origin.x, y: center.y - origin.y };
    }
    const point = value as Point;
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  }

  function syncPause(): void {
    if (destroyed) return;
    const nextPaused = userPaused || hidden;
    if (nextPaused && !paused) {
      paused = true;
      if (frameHandle !== null) {
        env.cancelFrame(frameHandle);
        frameHandle = null;
      }
      lastTime = null;
      return;
    }
    if (!nextPaused && paused) {
      paused = false;
      startLoop();
    }
  }

  function tick(time: number): void {
    frameHandle = null;
    if (destroyed || paused) return;
    if (lastTime === null) lastTime = time;
    const delta = Math.max(0, time - lastTime);
    lastTime = time;

    const finished: string[] = [];
    for (const [id, flight] of flights) {
      flight.elapsed += delta;
      const progress = Math.min(1, flight.elapsed / flight.duration);
      updateTrail(flight.nodes, flight.curve, easeInOutCubic(progress));
      if (progress >= 1) finished.push(id);
    }
    for (const id of finished) {
      const flight = flights.get(id);
      if (!flight) continue;
      removeTrail(flight.nodes);
      flights.delete(id);
      flight.settle('arrived');
    }
    if (flights.size > 0) startLoop();
  }

  function startLoop(): void {
    if (destroyed || paused || frameHandle !== null || flights.size === 0) return;
    frameHandle = env.requestFrame(tick);
  }

  function cancelFlight(id: string): void {
    const flight = flights.get(id);
    if (!flight) return;
    removeTrail(flight.nodes);
    flights.delete(id);
    flight.settle('cancelled');
  }

  function emit(input: LightEmitInput): LightFlight {
    let settled = false;
    let resolveFinished: (result: FlightResult) => void = () => undefined;
    const finished = new Promise<FlightResult>((resolve) => {
      resolveFinished = resolve;
    });
    const settle = (result: FlightResult): void => {
      if (settled) return;
      settled = true;
      resolveFinished(result);
    };
    const flight: LightFlight = { finished, cancel: () => cancelFlight(input.id) };

    if (destroyed || flights.has(input.id) || flights.size >= MAX_ACTIVE) {
      settle('cancelled');
      return flight;
    }

    const duration = clampDuration(input.duration);
    const seed = Number.isFinite(input.seed) ? (input.seed as number) : env.random();

    const attempt = (retried: boolean): void => {
      if (settled) return;
      if (destroyed) {
        settle('cancelled');
        return;
      }
      const source = resolveAnchor(input.source);
      const target = resolveAnchor(input.target);
      if (!source || !target) {
        if (!retried) {
          env.requestFrame(() => attempt(true));
          return;
        }
        settle('missing-anchor');
        return;
      }
      if (env.reducedMotion()) {
        settle('arrived');
        return;
      }
      const curve = buildCurve(source, target, seed);
      const nodes = createTrail(svg, input.id, input.color);
      seedTrail(nodes, curve);
      flights.set(input.id, {
        id: input.id,
        curve,
        nodes,
        duration,
        elapsed: 0,
        settle: (result) => {
          settle(result);
          if (result !== 'cancelled') return;
          const active = flights.get(input.id);
          if (active) {
            removeTrail(active.nodes);
            flights.delete(input.id);
          }
        },
      });
      startLoop();
    };

    attempt(false);
    return flight;
  }

  const onVisibilityChange = (): void => {
    hidden = document.hidden;
    syncPause();
  };

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    emit,
    pause() {
      userPaused = true;
      syncPause();
    },
    resume() {
      userPaused = false;
      syncPause();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frameHandle !== null) {
        env.cancelFrame(frameHandle);
        frameHandle = null;
      }
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      for (const flight of flights.values()) {
        removeTrail(flight.nodes);
        flight.settle('cancelled');
      }
      flights.clear();
      svg.remove();
    },
  };
}
