'use client';

import * as React from 'react';
import { Live2dCanvas } from '@/features/avatar/live2d-canvas';
import type { ExpressionTag } from '@/features/avatar/expression-parser';
import { collectEnvironment, FrameMetrics, type ScenarioMetrics } from '../live2d-stage/spike-metrics';
import { mountVrm, type VrmHandle, type VrmLoadResult } from './vrm-canvas';
import { buildSniffFixtures, sniffVrm, type VrmSniffResult } from './vrm-sniff';

/**
 * v2.0 M0 VRM 真机工装（非产品代码，WBFM_SPIKE=1 门控）。
 * 场景：
 * - S1 单 VRM（three 管线，10MB VRM1 样本；首帧 + 稳态帧率/内存）
 * - S2 混排（1 VRM + 2 Live2D，three 与 PIXI 双 canvas 同屏全负载）
 * - S0 校验链负例（glTF 魔数 + VRM 扩展识别，伪装文件全拒）
 */

const WARMUP_MS = 12_000;
const MEASURE_MS = 15_000;
const TEARDOWN_MS = 3_000;
const EXPRESSION_CYCLE_MS = 3_000;
const MODEL_URL = '/spike/vrm-stage/model/VRM1_Constraint_Twist_Sample.vrm';
const EXPRESSIONS: ExpressionTag[] = ['neutral', 'joy', 'sadness', 'anger'];
/** Live2D 表情词表比 VRM 预设宽；工装只用 4 种交集，其余在 VRM 侧回落 neutral */
const VRM_EXPRESSIONS = ['neutral', 'joy', 'sadness', 'anger'] as const;
type VrmExpression = (typeof VRM_EXPRESSIONS)[number];
const toVrmExpression = (tag: ExpressionTag): VrmExpression =>
  (VRM_EXPRESSIONS as readonly string[]).includes(tag) ? (tag as VrmExpression) : 'neutral';

interface ScenarioResult {
  key: string;
  vrmCount: number;
  live2dCount: number;
  load?: { firstFrameMs: number; vrmVersion: string; box: VrmLoadResult['box'] };
  metrics: ScenarioMetrics;
}

interface SpikeReport {
  warmupMs: number;
  measureMs: number;
  environment: Record<string, string | number>;
  sniff: Array<{ fixture: string; result: VrmSniffResult }>;
  results: ScenarioResult[];
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function Live2dSlot(props: { modelId: string; phase: number; expression: ExpressionTag }) {
  const getLevel = React.useMemo(
    () => () => Math.max(0.02, 0.25 + 0.22 * Math.sin(performance.now() / 180 + props.phase)),
    [props.phase],
  );
  return (
    <div className="relative h-full flex-1" data-testid="spike-l2d-slot">
      <span className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {props.modelId}
      </span>
      <Live2dCanvas modelId={props.modelId} expression={props.expression} getLevel={getLevel} speaking />
    </div>
  );
}

export function VrmSpikeHarness() {
  const [status, setStatus] = React.useState('init');
  const [report, setReport] = React.useState<SpikeReport | null>(null);
  const [stage, setStage] = React.useState<'' | 's1' | 's2'>('');
  const [expressionTick, setExpressionTick] = React.useState(0);

  const threeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const handleRef = React.useRef<VrmHandle | null>(null);
  const runningRef = React.useRef(true);
  const resultsRef = React.useRef<ScenarioResult[]>([]);
  const sniffRef = React.useRef<SpikeReport['sniff']>([]);

  const expression = EXPRESSIONS[expressionTick % EXPRESSIONS.length]!;

  React.useEffect(() => {
    const timer = setInterval(() => setExpressionTick((n) => n + 1), EXPRESSION_CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

  // 口型正弦负载（VRM 句柄）
  React.useEffect(() => {
    if (stage === '') return;
    const id = setInterval(() => {
      handleRef.current?.setMouthLevel(0.35 + 0.3 * Math.sin(performance.now() / 200));
      handleRef.current?.setExpression(toVrmExpression(expression));
    }, 60);
    return () => clearInterval(id);
  }, [stage, expression]);

  React.useEffect(() => {
    let cancelled = false;

    const runScenario = async (key: 's1' | 's2', withLive2d: boolean, cameraX: number) => {
      setStage(key);
      setStatus(`warmup:${key}`);
      await wait(300); // 等 canvas 挂载
      if (cancelled || !threeCanvasRef.current) return;
      const load = await mountVrm(threeCanvasRef.current, MODEL_URL, cameraX);
      handleRef.current = load.handle;
      await wait(WARMUP_MS - 300);
      if (cancelled) return;
      setStatus(`measure:${key}`);
      // 混排双 WebGL context 若退化到 >1s/帧，慢帧也是取证对象（上限放宽到 10s）
      const metrics = new FrameMetrics(10_000);
      metrics.start();
      await wait(MEASURE_MS);
      const snapshot = metrics.stop();
      resultsRef.current.push({
        key,
        vrmCount: 1,
        live2dCount: withLive2d ? 2 : 0,
        load: { firstFrameMs: load.firstFrameMs, vrmVersion: load.vrmVersion, box: load.box },
        metrics: snapshot,
      });
      load.handle.dispose();
      handleRef.current = null;
      setStage('');
      setStatus(`teardown:${key}`);
      await wait(TEARDOWN_MS);
    };

    const run = async () => {
      // S0 校验链
      setStatus('sniff');
      const buf = await fetch(MODEL_URL).then((r) => r.arrayBuffer());
      const fixtures = buildSniffFixtures(buf);
      sniffRef.current = Object.entries(fixtures).map(([fixture, data]) => ({
        fixture,
        result: sniffVrm(data),
      }));
      await wait(500);

      await runScenario('s1', false, 0);
      if (!runningRef.current) return;
      await runScenario('s2', true, -0.42);

      setReport({
        warmupMs: WARMUP_MS,
        measureMs: MEASURE_MS,
        environment: collectEnvironment(),
        sniff: sniffRef.current,
        results: resultsRef.current,
      });
      setStatus('done');
    };

    void run();
    return () => {
      cancelled = true;
      runningRef.current = false;
      handleRef.current?.dispose();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-900 text-white">
      <div className="sr-only" data-testid="spike-status">
        {status}
      </div>
      {stage !== '' && (
        <>
          <canvas ref={threeCanvasRef} className="absolute inset-0 h-full w-full" data-testid="spike-vrm-canvas" />
          {stage === 's2' && (
            <div className="absolute inset-y-0 right-0 flex w-1/2">
              <Live2dSlot modelId="hiyori" phase={0} expression={expression} />
              <Live2dSlot modelId="mao" phase={2.1} expression={expression} />
            </div>
          )}
          <span className="absolute left-2 top-2 z-20 rounded bg-black/60 px-2 py-0.5 text-xs">
            {stage === 's1' ? '1 VRM' : '1 VRM + 2 Live2D'}
          </span>
        </>
      )}
      <pre
        className="pointer-events-none absolute left-2 top-10 z-30 max-w-[60vw] whitespace-pre-wrap rounded bg-black/70 p-2 text-[10px]"
        data-testid="spike-result"
      >
        {report ? JSON.stringify(report, null, 2) : status}
      </pre>
    </main>
  );
}
