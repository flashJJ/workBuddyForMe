'use client';

import * as React from 'react';
import { Live2dCanvas } from '@/features/avatar/live2d-canvas';
import type { ExpressionTag } from '@/features/avatar/expression-parser';
import { collectEnvironment, FrameMetrics, type ScenarioMetrics } from './spike-metrics';

/**
 * v1.9 M0 多实例 Live2D 性能 spike 工装（非产品代码，路由 env 门控）。
 *
 * 三场景顺序自动跑，每个实例都带「待机动作（控制器内置）+ 表情轮换 + 口型驱动」全负载：
 * - C0 基线：0 实例（空页面主线程节拍）
 * - C1 方案 C：1 个 Live2D（当前发言者活，其余立绘的近似上界）
 * - C3 方案 A：3 个 Live2D 同页（左/中/右，三角色舞台）
 */

const WARMUP_MS = 12_000;
const MEASURE_MS = 15_000;
const TEARDOWN_MS = 3_000;
const EXPRESSION_CYCLE_MS = 3_000;

const SPIKE_MODELS = ['hiyori', 'mao', 'mark'] as const;
const EXPRESSIONS: ExpressionTag[] = ['neutral', 'joy', 'sadness', 'anger'];

interface Scenario {
  key: string;
  count: number;
}

const SCENARIOS: Scenario[] = [
  { key: 'C0-baseline', count: 0 },
  { key: 'C1-plan-c-single', count: 1 },
  { key: 'C3-plan-a-triple', count: 3 },
];

interface ScenarioResult {
  key: string;
  instanceCount: number;
  metrics: ScenarioMetrics;
}

interface SpikeReport {
  warmupMs: number;
  measureMs: number;
  workload: string;
  environment: Record<string, string | number>;
  results: ScenarioResult[];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 单槽位：口型电平按相位错开的正弦，模拟三人交替发言的持续负载 */
function SpikeSlot(props: { modelId: string; phase: number; expression: ExpressionTag }) {
  // 相位固定，getter 引用稳定（Live2dStage 的 rAF pump 依赖稳定回调）
  const getLevel = React.useMemo(
    () => () => {
      const v = 0.25 + 0.22 * Math.sin(performance.now() / 180 + props.phase);
      return Math.max(0.02, v);
    },
    [props.phase],
  );

  return (
    <div className="relative flex h-full w-full items-center justify-center" data-testid="spike-slot">
      <span className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {props.modelId}
      </span>
      <Live2dCanvas
        modelId={props.modelId}
        expression={props.expression}
        getLevel={getLevel}
        speaking
      />
    </div>
  );
}

export function SpikeHarness() {
  const [scenarioIndex, setScenarioIndex] = React.useState(-1);
  const [expressionTick, setExpressionTick] = React.useState(0);
  const [status, setStatus] = React.useState('init');
  const [report, setReport] = React.useState<SpikeReport | null>(null);
  const resultsRef = React.useRef<ScenarioResult[]>([]);
  const runningRef = React.useRef(true);

  const expression = EXPRESSIONS[expressionTick % EXPRESSIONS.length]!;

  React.useEffect(() => {
    const timer = setInterval(() => setExpressionTick((n) => n + 1), EXPRESSION_CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const environment = collectEnvironment();
      for (let i = 0; i < SCENARIOS.length; i += 1) {
        if (!runningRef.current) return;
        const scenario = SCENARIOS[i]!;
        setScenarioIndex(i);
        setStatus(`warmup:${scenario.key}`);
        // 挂载 + 等待模型下载/实例化/首个动作稳定
        await wait(WARMUP_MS);
        if (cancelled) return;
        setStatus(`measure:${scenario.key}`);
        const metrics = new FrameMetrics();
        metrics.start();
        await wait(MEASURE_MS);
        const snapshot = metrics.stop();
        resultsRef.current.push({
          key: scenario.key,
          instanceCount: scenario.count,
          metrics: snapshot,
        });
        setScenarioIndex(-1); // 卸载本场景实例
        setStatus(`teardown:${scenario.key}`);
        await wait(TEARDOWN_MS);
      }
      setReport({
        warmupMs: WARMUP_MS,
        measureMs: MEASURE_MS,
        workload: 'idle-motion + expression-cycle(3s) + sine-lipsync + gaze-ready',
        environment,
        results: resultsRef.current,
      });
      setStatus('done');
    };

    void run();
    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, []);

  const current = scenarioIndex >= 0 ? SCENARIOS[scenarioIndex]! : null;

  return (
    <main className="h-screen w-screen overflow-hidden bg-neutral-900 text-white">
      <div className="sr-only" data-testid="spike-status">
        {status}
      </div>
      <div className="flex h-full w-full">
        {current &&
          Array.from({ length: current.count }, (_, slot) => (
            <div key={SPIKE_MODELS[slot]!} className="h-full flex-1 border border-white/10">
              <SpikeSlot modelId={SPIKE_MODELS[slot]!} phase={(slot * Math.PI * 2) / 3} expression={expression} />
            </div>
          ))}
      </div>
      <pre
        className="pointer-events-none absolute left-2 top-2 z-20 max-w-[60vw] whitespace-pre-wrap rounded bg-black/70 p-2 text-[10px]"
        data-testid="spike-result"
      >
        {report ? JSON.stringify(report, null, 2) : status}
      </pre>
    </main>
  );
}
