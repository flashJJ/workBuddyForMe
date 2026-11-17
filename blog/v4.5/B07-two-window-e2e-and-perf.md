# 多了一个启动窗之后：e2e 与性能基线怎么改

给桌面应用加启动画面，代码上线只是第一步。真正麻烦的是测试：原来所有 e2e 都假设“应用启动后第一个窗口就是主窗”，现在第一个窗口可能是一个 640×360 的启动画面。

同时，性能基线也失真了：原来的 `firstWindow` 指标会变成“启动画面出现的时间”，不再是“主窗可交互的时间”。如果不改口径，性能报告会突然变得很好看，但用户体验并没有变。

这一轮我们主要改了两件事：让 e2e 找到正确的主窗，让性能基线同时记录首启和日常。

## 一、e2e 的第一个问题：窗口顺序不再固定

原来的测试大致是这样：

```ts
const app = await electron.launch({ args: ['.'] });
const page = await app.firstWindow();
await page.waitForSelector('[data-testid="chat-page"]');
```

加了启动画面后，`firstWindow()` 可能返回 splash，而且 splash 页面里没有聊天页选择器，测试会直接超时。

我们抽了一个统一辅助函数：

```ts
async function waitForMainWindow(app, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const win of app.windows()) {
      const url = win.url();
      if (url.includes('/splash/')) continue;
      return win;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('main window not found');
}
```

关键是按 URL 过滤，而不是按窗口顺序。启动画面 URL 带 `/splash/`，主窗是本地服务地址；即使 splash 先出现、后关闭，测试也不会拿错。

另外还有一个 `hasSplashWindow()`，用于启动画面专属的测试；普通 smoke/pet 测试则完全忽略 splash。

## 二、Playwright 的 attach 时序

Playwright 的 Electron 驱动是先启动应用，再 attach。启动画面创建得非常早，可能在 attach 完成之前就已经出现了，于是 `app.windows()` 里看不到它。

我们一开始用“等待第一个窗口”解决，但发现偶尔仍然漏检。最后的做法是给 e2e 一个环境变量：

```ts
WBFM_SPLASH_DELAY_MS=800
```

启动画面创建后延迟 800ms 再显示，让 Playwright 有时间 attach。这个延迟只在 e2e 环境生效，生产环境不读这个变量。

这不是“为了测试改产品”，而是给测试一个可观测窗口。类似的问题在 Electron 测试里很常见：不是功能错了，而是观测者来得太晚。

## 三、主窗隐藏带来的副作用

主窗为了交接，改成 `show: false`，等 `ready-to-show` 后再显示。这里踩了一个坑：代码里原来在创建后直接调用 `window.maximize()`，而某些平台上 `maximize()` 会让隐藏窗口提前显示。

修复方式是把“显示”和“最大化”收进一个函数：

```ts
function revealMainWindow(win, userDataDir) {
  if (win.isDestroyed()) return;
  win.maximize();
  win.show();
  win.focus();
}
```

创建主窗时只注册 `ready-to-show`，不主动显示；启动画面交接时再调用 `revealMainWindow`。这样窗口什么时候可见只有一个入口，测试也更容易断言。

## 四、性能基线：从单次到两次

原来的性能脚本只跑一次启动，记录 `launchMs / firstWindowMs / chatVisibleMs`。现在需要区分：

- 首启：会播放 8 秒完整片，`mainVisibleMs` 会被视频时长拉长；
- 日常：精简模式，主窗就绪即退场，才是真正的启动性能。

脚本改成同一个临时数据根跑两次：

1. 第一次启动，写入首启标记之前的状态，记录 `firstRun`；
2. 第二次启动，复用同一个数据根，记录 `daily`；
3. 两次都采集 `splashVisibleMs / mainPageMs / mainVisibleMs / domContentLoadedMs / chatVisibleMs / splashClosedMs` 和内存。

这样首启和日常的口径不会混在一起。报告里也明确写出：首启的 `mainVisibleMs` 包含 8 秒品牌片，不是启动回退。

## 五、结果怎么看

同机实测：

```text
首启：splash 429ms / mainPage 2572ms / mainVisible 9094ms / chat 9281ms
日常：splash 493ms / mainPage 1900ms / mainVisible 2307ms / chat 2366ms
内存：694MB → 707MB，峰值 728MB
```

日常 2.3 秒是当前可复现值。对比旧版本时要注意构建批次：同机的旧安装包日常约 15.4 秒，明显高于历史记录里的 5.6 秒，说明那个安装产物本身有环境差异，不能当作纯代码对比。

这类“对比基线不可比”的情况，必须在报告里写清楚，否则很容易得出“新版本快了 6 倍”的错误结论。

## 六、e2e 覆盖了哪些点

打包态 12 项：

- smoke 5 项：启动、主窗、基础导航；
- splash 1 项：启动画面出现、阶段文案更新、主窗出现后关闭；
- pet 4 项：桌宠窗口与主窗共存；
- computer-input 2 项：输入链路不受第二窗口影响。

其中 splash 测试最关键的是断言顺序：

1. 启动画面存在；
2. 主窗在启动画面关闭前已经 `ready-to-show`；
3. 启动画面关闭后，主窗可见；
4. 没有残留的 splash 窗口。

这四条覆盖了交接的核心风险：先关后开、开后不关、关错窗口。

## 七、小结

多一个启动窗口，测试要改的不只是选择器：

- 用 URL 过滤窗口，不依赖顺序；
- 给测试一个 attach 窗口，不和生产逻辑混用；
- 把窗口显示收敛到一个入口，避免隐藏窗口被意外 show；
- 性能基线区分首启与日常，不用一个指标解释两种模式；
- 对比旧版本时标注构建批次，避免误读。

这些改动看起来是“测试适配”，实际上也在反过来约束产品实现：窗口生命周期越清晰，测试越稳定；指标口径越明确，性能回退越容易被发现。
