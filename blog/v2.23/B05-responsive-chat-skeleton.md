# 一条 768px 的正文列：聊天页骨架与响应式取舍

把聊天页放进 1280 宽的窗口，四列常驻——导航、240px 会话列、正文、256 到 288px 的形象栏——留给正文的只剩五百多像素。中文段落贴着边框折行，读三行就要重新找起点；换到 1920 的显示器，同一段文字又被拉成一百多个字一行，眼睛回扫的跨度比段落还长。

我们的桌面 AI 应用是本地优先、单人开发的私人助手，桌面壳里跑的是 Next.js 前端。这一轮只处理布局与空间感，不动数据流，也不引入任何 UI 框架。

## 先把「好看」变成三条可测的口径

审美讨论不出结论，所以先把目标写成三条能验收的数字：

- 正文列最大宽度 768px（`max-w-3xl`，即 48rem），并水平居中；
- 1280 窗口下，正文可用宽度不低于 720px；
- 1920 窗口下，正文不超过 768px，左右留白大致均衡。

768px 这个值不是随手取的。按 14px 正文计算，一行落在五十多个中文字符，接近纸质阅读的舒适区间；再宽，视线回扫会丢行；再窄，代码块和表格就得频繁横向滚动。

输入区必须和消息区同宽，否则消息在中间、输入框贴左，视线每次都要横移。所以 `max-w-3xl` 同时加在消息容器和 composer 上，两块用一个轴。

## 会话列：240px 到 48px 的图标条

会话列是最先被压缩的，因为它常驻但低频。收起后宽度 48px，只留两个按钮：展开、新建会话。

为什么是 48 而不是 0：完全隐藏之后，用户找不到回来的入口。留一条窄栏，既把 190 多像素让给正文，又保留可发现性。按钮本身 32px，四周各留 8px，正好落进 4/8/12/16 的间距尺度。

收起态不是另一套列表，只是另一种布局：外层 `aside` 用 `w-12` 和纵向排列，带 `data-collapsed` 属性，测试里直接断言这个属性，而不是去量像素。

## 两个侧栏，一套收起逻辑

会话列和形象栏都要能收起，如果各写一套状态，迟早会出现「一个记得、一个不记得」。抽出来的是一个通用 hook：

```ts
useCollapsiblePanel(key, resolveDefault)

// 初始化（惰性，只跑一次）
stored = localStorage.getItem(key)        // '1' / '0'
if (stored === '1') return true
if (stored === '0') return false
return resolveDefault?.() ?? false        // 从未手动操作过

// 切换
next = !collapsed
localStorage.setItem(key, next ? '1' : '0')
```

三条例规则值得说明。

**用户选择优先于窗口默认值。** 默认值只在从未写过时生效。用户在大屏上主动收起了形象栏，之后把窗口缩到 1200，不会被「窄屏默认收起」覆盖，也不会因为再放大就被迫展开。

**默认值由调用方给。** 会话列不给默认值（保持展开），形象栏传 `() => window.innerWidth < 1280`。同一个 hook，两种策略，不需要在 hook 里塞 `if (name === 'avatar')` 这类分支。

**存储失败要能继续跑。** 读写都包在 `try/catch` 里：隐私模式或禁用存储时，`localStorage` 会抛错，此时退化成「仅本会话生效」，而不是让整个聊天页白屏。

两个 key 各自独立，语义各自记忆。共用的是行为，不是状态。

## 阶段条：窄屏折成一行

阶段条横向铺着五个阶段胶囊、编辑、载入任务、模型选择，1280 以下会把正文再挤掉一截。所以窄屏折叠成单行：

```text
阶段  2/5 · 模型选型        ⌄
```

点开还原完整条，收起只在本次会话内生效——它是一次临时的「我要看空间」，不是长期偏好，不该写进 localStorage。

折叠不是隐藏，是换一套 DOM 和交互，所以不能用 CSS 断点完成，只能在 JS 里读媒体查询：

```ts
const [narrow, setNarrow] = React.useState(() =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 1279px)').matches,
);

React.useEffect(() => {
  if (typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia('(max-width: 1279px)');
  const sync = () => setNarrow(query.matches);
  query.addEventListener('change', sync);
  return () => query.removeEventListener('change', sync);
}, []);
```

这里有两处必须做的防御。

`jsdom` 没有实现 `matchMedia`。单测里直接调用会得到 `window.matchMedia is not a function`，整个聊天页测试直接挂掉。所以初始值里判断一次，`useEffect` 里再判断一次——少了后面那处，测试环境照样会崩。

监听要用 `addEventListener('change')` 而不是已废弃的 `addListener`，并且一定要在清理函数里移除，否则会话切换几次就会堆一串监听器。

## 滚动区的上下渐隐

列表硬切在容器边缘，视觉上像被裁掉。做法是给滚动容器加一层 `mask-image`：

```css
.scroll-fade-y {
  -webkit-mask-image: linear-gradient(
    to bottom, transparent 0, #000 16px,
    #000 calc(100% - 16px), transparent 100%
  );
  mask-image: linear-gradient(
    to bottom, transparent 0, #000 16px,
    #000 calc(100% - 16px), transparent 100%
  );
}
```

为什么用 mask 而不是在上下各盖一个渐变色块：色块会跟随滚动容器的层级，遮挡内容的同时也吃掉指针事件，滚动条附近还会出现一层灰。mask 只影响绘制，不参与命中测试。

代价是静态的：滚到最顶部时，第一条消息的顶部仍有一小段淡出。做「到顶就取消顶部渐隐」需要监听滚动再切类名，收益不抵复杂度，这一轮先接受。

## 没做的和验证过的

没做可拖拽分栏，没做按页面自定义断点，也没引入布局组件库。宽度只有三个来源：容器、两档断点、两个可收起的侧栏。

验证层面，聊天、形象栏与公共组件相关的单元测试共 126 例通过，覆盖收起态渲染、阶段条窄屏折叠、空态与骨架屏切换；行数门禁、类型检查和 Lint 全绿。

有一件事没做成：1280 / 1440 / 1920 三档截图巡检没跑——本机端口被占用，前端起不来。这条没有含糊过去，而是明确记进了遗留项。

下一篇讲动效：骨架屏、回到底部浮标，以及全局的 `prefers-reduced-motion` 降级。
