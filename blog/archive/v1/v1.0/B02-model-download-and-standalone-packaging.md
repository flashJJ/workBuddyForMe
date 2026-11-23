# 600MB 模型不进安装包：首用下载、原子落盘与原生绑定打包记

做本地语音的第一道工程题不是推理，是**分发**。

ASR 模型 2 个文件 228MB，TTS 模型 377 个文件约 394MB，加起来超过 600MB。把它们塞进安装包，下载安装包的人要多等一倍时间，断网安装的用户还会被强迫联网；不塞，应用第一次打开时语音就是个空壳，模型从哪来、下到哪、下坏了怎么办，全都要有答案。

这篇讲三件事：模型首用下载器的设计、模型状态在磁盘和数据库之间分离踩的坑、sherpa-onnx 原生绑定怎么进产物且不需要 electron-rebuild。

## 首用下载：进应用数据目录，不进安装目录

结论先行：**模型一律首用时下载，落在应用数据目录（Electron 的 userData）下的模型目录**。安装目录在 Windows 上可能位于 Program Files，普通用户没有写权限；应用数据目录则是当前用户可写、升级不覆盖、卸载可选择保留的标准位置。

下载器在 voice 包里实现，对上层暴露的语义很简单：

```ts
// 说明性伪代码，省略了重试与日志
async function downloadModel(kind, modelId, opts) {
  const files = manifest.list(kind, modelId);      // 清单：相对路径 + 字节大小
  for (const f of files) {
    await downloadOne(f, opts.signal);             // 逐文件，可整体取消
  }
  if (!verifySizes(kind, modelId)) throw new Error('模型大小校验失败');
  repo.markReady(kind, modelId);
}
```

镜像源做了**两态**：默认走国内镜像，设置面板里可一键切到官方源。国内镜像的意义不用多说——清单里 377 个小文件的 TTS 模型，走慢源时光建连就能把人逼疯。

## 流式、可取消、原子改名

单文件下载有三个必须满足的要求，少一个都会在真机上出事故：

```ts
async function downloadOne(file, signal) {
  const target = path.join(modelDir, file.relPath);
  const tmp = `${target}.part`;                    // 临时文件
  await fs.mkdir(path.dirname(target), { recursive: true });
  const res = await fetch(mirror.url(file), { signal });
  const total = Number(res.headers.get('content-length'));
  // 流式写盘 + 进度回调，取消时 AbortError 冒泡，.part 留在盘上等下次重来
  await pipeWithProgress(res.body, tmp, (done) => onProgress(done, total));
  if (total != null && (await fs.stat(tmp)).size !== total) {
    throw new Error('大小不匹配，疑似半截下载');
  }
  await fs.rename(tmp, target);                    // 原子改名：盘上要么没有，要么完整
}
```

- **流式下载 + 进度**：不是 `await res.blob()` 一口气吃进内存，325MB 的主模型文件必须边收边落盘，进度实时回报到设置面板；
- **可取消**：用户切镜像、删模型、关面板都能 abort，中断的 `.part` 保留在盘上，下次继续或重来；
- **`.part` 临时文件，下完原子改名**：这是防「半截模型」的关键。引擎永远只在最终路径上看到完整文件——进程崩溃、断电、断网都不会留下一个看起来存在、实则残缺的模型被加载；
- **大小校验**：每个文件的字节数在模型清单里写死，落盘后逐个核对；全部文件通过，数据库状态才置 ready。

## 模型状态表：一张纯加法迁移

状态落在 v014 迁移新建的 `voice_models` 表，纯加法，老库直接启动升级：

```sql
CREATE TABLE voice_models (
  kind       TEXT CHECK(kind IN ('asr','tts')),
  model_id   TEXT,
  status     TEXT CHECK(status IN ('missing','downloading','ready','error')),
  bytes_total INTEGER,
  bytes_done  INTEGER,
  error       TEXT,
  updated_at  TEXT,
  PRIMARY KEY (kind, model_id)
);
```

四个状态覆盖了全部界面：missing 显示下载按钮、downloading 显示进度条（字节计数直接驱动）、ready 可以启用、error 展示原因并重试。CHECK 约束保证任何非法状态写不进库——这类约束是给未来的自己留的护栏。

语音设置本身没有新表，仍然走既有的 settings 键值存 JSON。

## 踩坑：文件在盘上，数据库说 missing

下载链路真机联调时遇到一个很有迷惑性的现象：**模型文件明明已经在磁盘上、大小也全对，但状态接口始终报 missing**。

根因是两种状态的权威来源本来就不同：文件在文件系统，状态在数据库，它们只在「下载成功」这一个点上同步。中途换过模型、手动清过库、或者先有文件后建表，两者就会漂移。

修法不是写复杂的对账逻辑，而是承认一个简单事实：**下载接口天然就该是幂等的**——

```ts
async function ensureReady(kind, modelId) {
  for (const f of manifest.list(kind, modelId)) {
    if (await sizeMatches(f)) continue;            // 盘上已有且大小匹配：跳过
    await downloadOne(f);                          // 缺谁下谁
  }
  verifySizes(kind, modelId);
  repo.markReady(kind, modelId);                   // 复验通过，DB 收敛
}
```

文件全部本地跳过时，这个调用秒回，只做一次全量复验然后把状态修正为 ready。所以遇到「盘上有、库里没有」，调一次下载接口即可，别误判成下载器坏了。

## 原生绑定打包：external、文件追踪、脚本兜底

sherpa-onnx 的 Node 绑定不是纯 JS：它带一个 `.node` 原生模块和一组 DLL。这类文件在 Next.js standalone 产物里最容易丢——bundler 默认不认识它们，trace 文件依赖时也可能漏掉运行时 dlopen 的那部分。

方案分三层，前两层是常规手段，第三层是兜底：

1. **external**：voice 包打包时把 sherpa-onnx 两个平台包声明为外部依赖，不打进 bundle，保持 `node_modules` 里的原始目录结构（DLL 之间的相对路径不能乱）；
2. **standalone 文件追踪**：让 Next 的产物追踪机制把这两个包纳入输出清单；
3. **打包脚本兜底归集**：桌面打包前的服务端归集脚本里显式列出这两个包，缺失就从源 `node_modules` 复制进产物，保证安装包里一个文件都不少。

真正让这件事变简单的是上个版本就定好的进程模型：**语音跑在内置 Node 服务进程，不跑在桌面壳主进程**。服务进程用的是与构建机同版本的真实官方 Node 运行时，原生模块的 ABI 天然匹配，所以根本不需要 electron-rebuild——这条为其他原生模块铺过的路，语音直接搭了便车。引擎模块还是惰性 `import()` 的：不启用语音、模型没就绪时，DLL 完全不加载。

## Live2D：完全不同的一条路

模型要首用下载，形象资源却反过来——它们太小了。5 套官方样本角色合计约 13MB，单套 0.66–4.7MB，自包含目录（模型、贴图、动作、表情、许可文件齐全），直接作为静态资源随 public 分发。

但「随包分发」不等于「首屏加载」。pixi.js、Live2D 运行库和 Cubism Core 这组重库（约 564KB 原始 / 157KB gzip）被切成**独立懒加载 chunk**：形象功能关闭时，对话页首屏对这些资源零请求；只有用户开启形象，动态导入才把 chunk 拉下来。桌面打包时，归集脚本会把 public 静态资源手工补齐进产物，路径与开发态保持一致。

## 小结

这一篇没有算法，全是分发层面的边角：首用下载划清安装与运行时的边界，`.part` 原子改名消灭半截模型，大小校验加 CHECK 约束让状态可信，幂等下载接口让磁盘与数据库自动收敛，external 加兜底归集让原生绑定老实进产物。地基打好之后，下一篇进入链路本身：浏览器里的声音，如何变成一行可识别的文字。
