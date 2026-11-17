# 640×360 的无边框启动窗：Electron 首帧、安全开关与窗口生命周期

给桌面应用加启动画面，第一反应往往是“在主窗里先渲染一个 loading，再切到正式界面”。但我们的主窗要等本地服务健康后才创建，启动画面必须比主窗更早出现。于是只能单独开一个窗口。

这个窗口很小，却集中了 Electron 的几个关键取舍：窗口形态、首帧、安全配置和生命周期。

## 一、为什么是独立 BrowserWindow

备选方案有三个：

1. 主窗先创建，先显示 loading，服务就绪后再加载真实页面；
2. 用透明窗口叠在主窗上；
3. 独立的小窗口，加载本地静态 HTML。

方案一的问题是把启动画面绑进了主窗生命周期。主窗一旦创建，就要处理 `ready-to-show`、路由、服务未就绪时的错误页，启动画面反而变成主窗里的一个临时状态，后续很难拆干净。

方案二的问题更多：透明窗口在 Windows 上会带来点击穿透、阴影、DWM 合成和不同显卡驱动的差异；我们只需要一个不透明的小卡片，没有必要引入这些变量。

最终选择独立窗口，配置尽量“死板”：

```ts
new BrowserWindow({
  width: 640,
  height: 360,
  useContentSize: true,
  show: false,
  frame: false,
  transparent: false,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  skipTaskbar: true,
  center: true,
  backgroundColor: '#0F1115',
  webPreferences: {
    preload: splashPreload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: false,
  },
});
```

几个参数的理由：

- `useContentSize`：640×360 是内容区尺寸，不受窗口边框影响；
- `transparent: false`：避免透明窗的合成差异，背景色与 HTML 首帧一致；
- `skipTaskbar`：启动画面不是独立任务，不占任务栏；
- `center`：小窗居中，不记忆位置；
- `show: false`：等 `ready-to-show` 再显示，避免先出现白框。

## 二、首帧：本地文件 + 同色背景

启动画面不请求网络，所有资源都在安装包里：一个 HTML、一个 CSS、一个 JS、一个 SVG（内联）、一个可选的 MP4 和封面。

本地文件的好处是确定性强：不依赖本地服务是否已经起来，也不受代理、DNS、防火墙影响。坏处是路径在开发态和打包态不同：

```
打包态：resources/splash/index.html
开发态：源码树 resources/splash/index.html
```

我们用一个解析函数统一处理，并允许环境变量覆盖，方便 e2e 或排查时指向临时页面。路径解析是纯函数，单测可以直接断言打包/开发两种情况。

首帧还有一个细节：`BrowserWindow` 的 `backgroundColor` 必须和 HTML 的底色一致。否则窗口先显示背景色，再显示页面，会闪一下。我们把两边都固定成同一个深色值，并且让 HTML 的 `body` 不带外边距。

## 三、preload 只暴露五个动作

启动画面需要接收模式、阶段、完成、失败，以及告诉主进程“退场动画结束了”。它不需要文件系统、不需要网络、不需要任意 IPC。

preload 只暴露：

```ts
window.splashBridge = {
  onMode(cb),
  onPhase(cb),
  onDone(cb),
  onFail(cb),
  notifyExited(),
  skip(),
};
```

主进程侧对应的 IPC 也是单向为主：`boot:mode`、`boot:phase`、`boot:done`、`boot:fail`、`boot:exited`、`boot:skip`。渲染进程不能调用任意 channel，也不能读主进程对象。

HTML 里还有一条严格的 CSP：

```
default-src 'none';
script-src 'self' file:;
style-src 'self' file:;
img-src 'self' data: file:;
media-src 'self' file:;
connect-src 'none';
```

启动画面不需要 `connect-src`，所以直接设为 `none`。即使页面里混入了第三方脚本，也无法发请求。

## 四、页面未就绪时的事件补发

有一个容易踩的时序问题：主进程可能在页面 `did-finish-load` 之前就发出 `boot:phase`，这时 `webContents.send` 的消息会丢。

我们的处理是：

- 主进程缓存最后一次阶段事件；
- 页面 ready 后先补发 mode，再补发最后一次 phase；
- 后续阶段正常推送。

这样无论服务起得多快，页面都不会停在“等待中”。这也是为什么启动桥要维护 `pageReady` 和 `lastPhase` 两个状态，而不是简单地转发 IPC。

## 五、生命周期：单实例、二次启动、退出

启动窗也要遵守应用的单实例约束：

- 第二次启动时，如果启动窗还在，聚焦启动窗；如果主窗已出现，聚焦主窗；
- 用户点击启动窗关闭（虽然无边框，但仍有系统关闭路径）时，如果主窗已就绪就显示主窗，否则退出应用；
- `before-quit` 时销毁启动窗，避免残留窗口阻止进程退出；
- 主窗交接完成后，启动窗关闭并置空引用，后续阶段事件不再发送。

这些逻辑不复杂，但如果不写，容易出现“启动窗关不掉”“主窗出来了启动窗还在”“退出后进程残留”之类的小问题。

## 六、测试友好

窗口创建函数支持注入 `windowFactory`，测试可以传一个假窗口，断言：

- 窗口选项里的安全开关是否为 `true/false`；
- `ready-to-show` 后是否调用了显示；
- 阶段事件是否按顺序发送；
- 退场回调是否只触发一次；
- 用户关闭时是否走正确的分支。

启动窗是一个很小的模块，但它值得被单独测试。因为它处在启动关键路径上，任何未捕获的异常都会直接影响用户看到的第一帧。

## 七、小结

独立启动窗不是“多开一个窗口”这么简单，它要求把窗口形态、首帧、安全边界和生命周期都想清楚。我们的原则是：

- 窗口尽量死板，不透明、不可缩放、不占任务栏；
- 资源尽量本地，不依赖服务是否已经起来；
- 能力尽量窄，preload 只暴露必要动作；
- 事件尽量可补发，避免时序丢消息；
- 生命周期尽量可测，窗口工厂可注入。

做到这些，启动画面才是一个可靠的“旁路”，而不是新的故障点。
