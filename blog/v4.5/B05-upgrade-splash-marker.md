# 覆盖安装后动画消失：一次版本标记与安装器行为的排查

启动画面和首启短片上线后，第一个真实反馈是：“覆盖安装新版本后，没有展示动画就进入了应用。”

这个描述很具体，但方向容易带偏。我们第一反应是启动画面没创建、视频路径不对、或者打包漏了资源。实际排查后，问题既不在动画，也不在视频，而在**两个被混在一起的事实**。

## 一、先看现场日志

启动链路有一条本地日志：`userData/boot-timing.log`，每次启动追加一行 JSON，记录模式和各阶段耗时。

现场有两条记录：

```json
{"mode":"full","stages":{"app-ready":84,"server-healthy":19127,"main-ready":21458},"totalMs":21896}
{"mode":"compact","stages":{"main-ready":1558},"totalMs":1600}
```

真实顺序是：

1. 安装器完成后自动拉起了应用，模式 `full`，但服务加载了 19 秒；
2. 用户看到的“第一次启动”其实是安装器自动拉起的进程，640×360 启动窗被安装完成页挡住了；
3. 用户随后手动启动，模式变成 `compact`，主窗 1.5 秒就绪，于是“没有动画”。

也就是说，动画**播放过**，但用户**没看见**。

## 二、根因：last-version 写得太早

启动时有一个版本标记文件 `last-version`，用于升级后清理旧 session 缓存。原来的逻辑在启动一开始就写入了当前版本：

```ts
const upgraded = last !== currentVersion;
if (upgraded) await clearStorageData();
writeFileSync(lastVersionPath, currentVersion);
```

同时，首启模式判定也依赖这个标记：

```ts
function introModeFor(lastVersion, currentVersion) {
  if (!lastVersion) return 'full';
  return lastVersion === currentVersion ? 'compact' : 'full';
}
```

问题在于：`last-version` 只能说明“这个版本启动过”，不能说明“用户看见过首启动画”。安装器自动拉起的那一刻，`last-version` 被写入，首启被消费掉；用户真正看到窗口时，已经是第二次启动。

## 三、修复：拆成两个标记

我们新增了 `intro-seen-version`，只在两个条件同时满足时写入：

1. 启动画面窗口真正触发过 `ready-to-show` 并显示；
2. 主窗已经 reveal，启动画面完成交接。

```ts
splash.onShown(() => {
  splashShown = true;
});

splash.onExited(() => {
  revealMainWindow(win);
  if (splashShown) writeIntroSeen(userDataDir, currentVersion);
});
```

首启模式改为只看 `intro-seen-version`：

```ts
function resolveIntroMode(userDataDir, currentVersion) {
  const seen = readFileSync(introSeenPath, 'utf8').trim();
  return seen === currentVersion ? 'compact' : 'full';
}
```

`last-version` 继续只负责 session 缓存清理，两个标记职责分离：

- `last-version`：这个版本启动过，可以清理上一次版本的缓存；
- `intro-seen-version`：这个版本的首启动画真正展示过，下次不用再播。

这个拆分还带来一个额外好处：如果启动画面 HTML 加载失败、窗口被隐藏、用户在画面出现前退出，`intro-seen-version` 不会写入，下次启动会补播，而不是永久丢失。

## 四、第二层修复：安装器不要自动拉起

即使标记修好了，安装器自动拉起仍然会制造“用户没看见”的场景：安装完成页盖住 640×360 小窗，用户以为安装完就进了应用。

我们在 NSIS 配置里关闭了完成后自动运行：

```yaml
nsis:
  runAfterFinish: false
```

代价是安装完成后需要用户手动打开应用。这个代价可以接受，因为：

- 安装完成页本身会提示“完成”，用户知道下一步；
- 首启动画需要用户注意力，自动拉起反而容易被挡住；
- 手动启动的第一次，`intro-seen-version` 一定还没写入，完整片会补播。

这不是“安装器行为”第一次影响产品体验。桌面应用的安装器、卸载器、快捷方式、自动更新，都是启动链路的一部分；只测应用内启动，不测安装器拉起，就容易漏掉这类问题。

## 五、验证方式

我们没有只靠“再装一次看看”，而是用临时 `userData` 构造升级场景：

1. 写入 `last-version=4.5.0`；
2. 不写 `intro-seen-version`；
3. 启动新版本；
4. 断言日志模式为 `full`；
5. 断言主窗 reveal 后 `intro-seen-version` 写入当前版本；
6. 再次启动，断言模式为 `compact`。

这条用例现在固定在单测里，不依赖真实安装器。安装器行为则由 `runAfterFinish: false` 的配置和一次手工覆盖安装验证。

## 六、经验

1. **“播放过”和“用户看见过”是两个事实**，需要两个标记；用一个版本号同时表达两件事，迟早会错。
2. **安装器是启动链路的一部分**。自动拉起、完成页、静默安装都会改变用户看到的第一帧。
3. **日志要记录模式**。如果只记录耗时，不看 `mode`，很容易误判“动画没播”。
4. **修复要能构造场景**。用临时数据目录复现升级，比反复卸载安装更快，也更适合回归。
5. **降级要保守**。无法确认用户看见时，宁可下次再播，也不要永久标记已看。

这类 bug 不复杂，但它提醒我们：桌面应用的“启动”不是从 `app.whenReady()` 开始的，而是从用户双击安装包那一刻就开始了。
