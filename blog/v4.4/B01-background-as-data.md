# 把背景做成数据：三处界面、三种来源与一个解析器

我们的桌面 AI 应用是一个本地优先、单人开发的私人助手。它有三块需要“环境氛围”的界面：舞台与小剧场、主聊天窗口、桌宠悬浮窗。过去这三处各管各的——舞台读剧集自带的背景变体，聊天窗口没有背景，桌宠窗固定透明。用户拿到自己的图片或循环视频后，没有任何入口能放进去。

这一轮我们把背景变成一等能力。做法不是给每块界面写一套背景组件，而是先回答一个问题：背景到底是什么？

## 一、背景不是组件，是一条数据

最直接的实现是三个组件各自接收 `imageUrl` 或 `videoUrl`，再各自处理加载、循环和回退。这样写起来快，但会立刻遇到四个问题：

- 用户换了背景，重启后要能恢复；
- 本地文件与能力包资源需要不同的读取方式；
- 文件被删除后要有确定的回退；
- 三个界面的默认行为并不相同。

所以背景先被建模成设置里的一条数据：

```ts
type BackgroundSource =
  | { kind: 'builtin'; id: string }
  | { kind: 'image'; id: string }
  | { kind: 'video'; id: string };
```

只有 `kind + id`，没有绝对路径，没有 URL。设置再按作用域拆开：

```ts
interface BackgroundConfig {
  source: BackgroundSource;
  fit: 'cover' | 'contain';
  dim: number;   // 0–1
  blur: number;  // 0–20
  mode?: 'chat' | 'window'; // 仅主窗口
}

interface BackgroundSettings {
  main: BackgroundConfig;
  stage: BackgroundConfig;
  pet: BackgroundConfig;
}
```

作用域拆开之后，“舞台跟着剧集走、主窗口默认雨夜、桌宠保持透明”这三个不同默认值就有了各自的落点，不会互相污染。

## 二、解析器是唯一知道来源差异的地方

数据定好之后，渲染层不应该关心 id 指向的是内置视频、用户文件还是包内资源。我们用一个纯函数做解析：

```ts
function resolveBackground(config, context) {
  if (config.source.kind === 'builtin') {
    return BUILTINS[config.source.id] ?? NONE;
  }
  const file = context.files.find(f => f.id === config.source.id);
  if (file) return toResolved(file);
  const packItem = context.wallpapers.find(w => w.id === config.source.id);
  if (packItem) return toResolved(packItem);
  return context.fallback === false ? NONE : DEFAULT_BUILTIN;
}
```

顺序是固定的：内置 → 本地文件 → 包内资源。顺序固定带来两个好处：解析结果可预测，测试可以穷举；同一个 id 在多层出现时，行为不需要界面层再判断。

回退也不是一刀切：主窗口和舞台回退到内置视频，桌宠回退到透明。因为桌宠的背景一旦缺文件还强行铺一张图，会直接盖掉角色的透明边缘。

## 三、主窗口的“聊天/整屏”是同一个背景的两种铺法

主窗口有两种形态：聊天页只铺内容区，整屏模式铺满窗口。最直觉的做法是保存两份背景配置，但那样用户切一次模式就要重选一次背景。

我们的做法是让 `mode` 只决定布局，不决定资源：

- 聊天模式：背景层从侧边栏右侧开始，纵向铺满内容区；
- 整屏模式：背景层铺满整个窗口；
- 两种模式共用同一份 `source / fit / dim / blur`。

互斥的是“铺法”，不是“背景”。这条区分让设置页只需要一个来源选择器，用户心智也简单。

## 四、能力边界写在数据之外

同一份设置，在桌面端和纯 Web 模式下的可选来源不同：桌面端能选本地图片/视频，Web 只能选内置素材。我们没有在数据模型里加 `platform` 字段，而是让能力检查发生在入口：设置页在渲染期探测桌面桥是否存在，不存在时把“本地文件”分组标记为仅桌面端可用。

数据保持同一套，能力差异由运行时环境决定。这样从桌面端切到 Web 调试时，设置不会因为多了个字段而整体判为非法。

## 五、渲染层只认三种形态

解析器的输出被收敛成三种：

```ts
type ResolvedBackground =
  | { kind: 'none' }
  | { kind: 'gradient'; gradient: string }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string };
```

渲染组件只处理这三种形态。图片与视频共用同一套铺放、压暗与模糊参数；渐变不占文件体积，承担“有氛围但不抢角色”的默认场景。

把来源差异挡在解析器里，渲染层就只剩布局与性能两件事。下一篇文章展开说解析器为什么只存 id、不存路径。
