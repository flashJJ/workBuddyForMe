/**
 * v1.0 免手聆听性能取证：Ollama 首 token 延迟（TTFT）与生成速度。
 * 测 qwen2.5:14b 与 7b：短 prompt 与 ~1500 字上下文两档，各跑 2 次取第 2 次（热态）。
 * 运行：node packages/voice/spikes/bench-ollama-ttft.mjs
 */
const MODELS = ['qwen2.5:14b-instruct-q4_K_M', 'qwen2.5:7b'];
const BASE = 'http://127.0.0.1:11434/v1/chat/completions';

const SHORT = '你好';
const LONG =
  '你是我的桌面助手。以下是一些背景资料：\n' +
  'WorkBuddy 是本地优先的私人 AI 平台，支持多会话流式对话、知识库 RAG、工作流编排、桌面 Agent、本地语音 ASR/TTS 与 Live2D 桌宠。'.repeat(6) +
  '\n请根据上述资料回答：它支持语音吗？';

async function run(model, content) {
  const body = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: '用 1-2 句简短中文口语回答，不超过 60 字。' },
      { role: 'user', content },
    ],
  };
  const t0 = performance.now();
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let ttft = 0;
  let firstContentAt = 0;
  let chunks = 0;
  let chars = 0;
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data.trim() === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          chunks += 1;
          if (chunks === 1) {
            ttft = performance.now() - t0;
            firstContentAt = performance.now();
          }
          chars += delta.length;
        }
      } catch {
        /* 分片半包，忽略 */
      }
    }
  }
  const total = performance.now() - t0;
  const genMs = performance.now() - firstContentAt || 1;
  return { ttft: Math.round(ttft), total: Math.round(total), chars, cps: Math.round((chars / genMs) * 1000) };
}

for (const model of MODELS) {
  for (const [tag, text] of [['short', SHORT], ['longCtx', LONG]]) {
    await run(model, text).catch(() => null); // 冷启/预热丢弃
    const r = await run(model, text);
    console.log(
      `${model.padEnd(28)} ${tag.padEnd(8)} TTFT=${String(r.ttft).padStart(5)}ms  total=${String(r.total).padStart(5)}ms  chars=${String(r.chars).padStart(3)}  gen=${r.cps}字/s`,
    );
  }
}
process.exit(0);
