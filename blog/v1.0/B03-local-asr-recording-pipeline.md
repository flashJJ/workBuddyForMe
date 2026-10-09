# 本地语音识别实录：从麦克风到 256ms 出文字的整条链路

上个版本整个仓库没有一行音频输入代码。所以「能听」这件事是从零搭的：浏览器采集、降采样、封装、上传，服务端解码、重采样、进引擎，最后文字回到对话框。

这一篇顺着这条链路走一遍，包括真机跑出来的数字、ITN 文本归一的实测效果，以及一个反直觉的选择——**ASR 我们敢用 int8 量化，TTS 却不敢，原因这篇先埋个伏笔**。

## 采集：getUserMedia 与一个 0 增益落地节点

录音入口是浏览器标准的 `getUserMedia`，约束写死成单声道：

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
});
const ctx = new AudioContext();
const source = ctx.createMediaStreamSource(stream);
```

采集节点用的是 ScriptProcessorNode。它是个老接口，名声不算好（回调跑在主线程），但对 16kHz 单声道的短句录音完全够用，而且行为在各浏览器上足够确定。这里有个关键接法——**必须挂一个增益为 0 的 GainNode 作为落地节点连到 destination**：

```ts
const processor = ctx.createScriptProcessor(4096, 1, 1);
const silent = ctx.createGain();
silent.gain.value = 0;          // 声音不真正播出来，避免啸叫
source.connect(processor);
processor.connect(silent);
silent.connect(ctx.destination); // 不落地到 destination，采集回调不会被调度
```

不连 destination，图不「活」，onaudioprocess 根本不触发；直连 destination，麦克风声音会外放立刻自激。0 增益落地节点两头都解决。这个坑在后面 VAD 用 AudioWorklet 时会以另一种面目再踩一次。

## 降采样与 WAV 封装

浏览器给的采样率通常是 44.1kHz 或 48kHz，而 SenseVoice 要的是 **16kHz 单声道 16-bit PCM**。采集到的每段 Float32 缓冲先做线性降采样：

```ts
// 说明性简化：按采样率比率抽点，抽取位置做线性插值
function downsample(buffer: Float32Array, fromRate: number, toRate = 16000) {
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(buffer.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    out[i] = lerp(buffer[i0], buffer[i0 + 1] ?? buffer[i0], pos - i0);
  }
  return out;
}
```

Float32（-1~1）转成 16-bit 小端整数，再加上 44 字节标准 WAV 头，就是一个任何音频工具都能打开的 WAV。封装和编解码都是 voice 包里的纯函数，不依赖 DOM，单测直接喂构造好的字节数组。

录音结束有一道 **最短 300ms 门限**：再短的片段多半是咳嗽、碰麦、喷麦，客户端直接拦下提示「说话时间太短」。

## 错误映射：没有设备和拒绝授权不是一回事

`getUserMedia` 抛错在真机上至少有三种用户语义，必须分开映射，不能统一弹「录音失败」：

- `NotFoundError`：这台机器没有麦克风——提示检查设备，而不是去改权限；
- `NotAllowedError`：权限被系统或用户拒绝——给出重新授权的引导；
- 其余异常：提示重启应用或检查设备占用。

设置面板另有 4 秒电平自检，让用户在下 228MB 模型之前先确认麦克风采集是通的。

## 上传与服务端：multipart、解码、必要时重采样

录音以 multipart 一次性上传到识别接口，没有引入任何新协议：

```text
POST /api/voice/asr
Content-Type: multipart/form-data
  wav: <二进制 WAV>   sampleRate: 16000
→ 200 { "text": "……", "lang": "zh" }
```

服务端拿到文件后走三步：WAV 解码出 PCM → 校验采样率与声道，不符合就重采样兜底 → 送识别引擎。16kHz 的校验是硬的，重采样只是防未来客户端漂移的保险。音频只写临时缓存，响应后即删，**不入库、不进备份轨**。

## 引擎：惰性单例，配置变更才重建

原生引擎加载模型很慢，必须长驻，但也不能在应用启动时就拖慢开机。折中是**惰性单例**：第一次识别请求到来时才初始化，之后复用：

```ts
let instance: AsrEngine | null = null;
let builtFrom: { threads: number; modelDir: string } | null = null;

async function getEngine(cfg) {
  if (instance && builtFrom &&
      builtFrom.threads === cfg.threads && builtFrom.modelDir === cfg.modelDir) {
    return instance;                              // 热路径：直接复用
  }
  instance?.dispose();                            // 配置变了：销毁重建
  instance = await AsrEngine.create(cfg);
  builtFrom = { threads: cfg.threads, modelDir: cfg.modelDir };
  return instance;
}
```

重建条件刻意收窄到两项真正影响引擎构造的配置：线程数和模型目录。语速之类与 ASR 无关的设置变化不触发重建，避免「改了个不相干的设置，下一句话多等三秒」。

## 真机数字与 ITN 实测

ASR 模型是 SenseVoice int8，2 个文件共 228MB。真机数据：

- **冷启动 3.2s**：首次加载模型；
- **热态 256ms 识别 4.6s 的音频**：约 18 倍实时，停顿即发的体验完全撑得住；
- 支持多语种，返回里带语言标识；
- **ITN（逆文本归一）实测**：口语念出的「二零二六年十月六日」，识别结果直接是「2026年10月6日」——数字、日期这类朗读形态自动归一成书写形态，不用上层再写规则。

## 为什么 ASR 选 int8

语音模型有 fp32 和 int8 两种量化形态，int8 体积更小、理论上更快，但量化是否真的提速，取决于 CPU 有没有对应的整数指令加速。

我们的真机是一颗较新的桌面 CPU，但**不带 AVX512-VNNI 指令集**。实测结论是分裂的：

- ASR 内核在这颗 CPU 上跑 int8 **不受影响**，延迟就是上面的 256ms，体积还省，于是 ASR 选 int8；
- TTS 内核跑 int8 反而严重退化，只有 fp32 的零头速度——这个故事下一篇细讲，它直接决定了 TTS 必须用 fp32 和 394MB 的模型体积。

「量化一定更快」是只在指令集对得上时才成立的假设，真机验收必须记录实际速率，不能只看「能出结果」。

## 按住说话：一个 disabled 引发的交互事故

语音入口是 composer 上的麦克风按钮，交互为按住说话（PTT）：pointerdown 开始录音、pointerup 结束并识别。实现上有两个细节：

1. **指针捕获**：按住后手指（或鼠标）滑出按钮区域也要继续录、抬起时正常结束，所以按下即 `setPointerCapture`，抬起事件监听在捕获目标上；
2. **按下的途中绝不能把按钮置成 disabled**。第一版在录音开始后把按钮切到禁用态改样式，结果按钮在 pointerup 前从命中目标上消失，抬起事件丢了，录音永远停不下来。正确做法是按钮始终可交互，用样式表达录音态，而不是用 disabled。

识别完成后文本自动进入对话，像打字输入一样发送；整个入口还受「朗读/麦克风开关」和「模型就绪状态」双门控，模型没下好时按钮根本不武装。

## 小结与预告

听这条链路没有任何花哨设计：标准采集、纯函数编解码、惰性单例、multipart 上传，复杂的部分全部被推到 sherpa-onnx 引擎背后；真正花时间的是 0 增益落地、300ms 门限、错误映射、disabled 丢事件这些「真机上才会发生」的边角。下一篇是这个系列最核心的一篇：文字流回来之后，怎么让它**一边生成一边被念出来**——语音旁路、流式切句、串行播放队列，以及 MeloTTS 换成 Kokoro 的完整选型实战。
