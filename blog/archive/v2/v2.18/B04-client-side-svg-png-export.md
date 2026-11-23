# 把内联 SVG 变成 PNG：不引服务端 Chromium 的客户端导出

我们的桌面 AI 应用（本地优先、单人开发）里，图表已经能在对话卡片里预览了。但「能看」和「能用」是两回事：用户真正想做的是把这张架构图贴进周报、拖进幻灯片、发到群里。到这一步，SVG 文件往往还不够——很多场景只收 PNG。

导出这件事有两个常见解法：服务端起一个 Chromium 截图，或者引入一个 SVG 栅格化库。两个都要往生产依赖里塞一个几十到上百 MB 的东西，而我们只处理自己模板产出的内联 SVG，形状完全可控。于是选了第三条路：浏览器端自己做。

## 一、先把范围钉死

| 产物 | 可导出 SVG | 可导出 PNG | 说明 |
|---|---|---|---|
| 图表 HTML（含内联 SVG） | 是 | 是 | 只取第一个内联 SVG |
| 纯 SVG 产物 | 是 | 是 | 直接解析根节点 |
| Markdown | 否 | 否 | 卡片上不显示导出入口 |
| 通用 HTML（无 SVG） | 否 | 否 | 提示「产物中没有可导出的 SVG」 |

范围钉死之后，实现就只有一个入口：从 HTML 里捞出那段 SVG。多图产物不递归合并——一张图一个产物，这是模板侧就约定好的。

## 二、提取：不是字符串切片那么简单

从 HTML 取第一个 `<svg>`，最直接的想法是正则截取。能跑，但脆：属性顺序、命名空间前缀、自闭合写法都可能让截出来的片段变成非法 XML。

实际做法是从 HTML 文本里定位第一个 SVG 的起止标签，截取后交给浏览器的 XML 解析器，验证它能被解析成根节点。不能解析就报错，不猜。

拿到根节点后还要补三样东西：

1. **`xmlns`**：HTML 里的 SVG 可以省略命名空间，独立 SVG 文件不能。缺了它，多数软件打开是一片空白。
2. **明确的宽度与高度**：优先用根节点自带的 `width`/`height`；没有就从 `viewBox` 的宽高补；都没有就用模板约定的默认尺寸。
3. **自包含的样式**：模板本身用内联 presentation 属性（`fill`、`stroke`、`font-size`），不依赖 HTML 外层 CSS。所以序列化出去以后，脱离页面也不会掉样式。

```ts
// 说明性伪代码
const svg = extractFirstSvg(htmlText);        // 定位 → 解析 → 失败即报错
svg.setAttribute('xmlns', SVG_NS);
if (!svg.getAttribute('width')) {
  const [, , w, h] = svg.getAttribute('viewBox').split(/\s+/);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
}
const serialized = new XMLSerializer().serializeToString(svg);
```

序列化用的是浏览器自带的 `XMLSerializer`，不手拼字符串。手拼的坑在于中文标题、`&`、引号转义——一旦漏一个，导出的文件就是坏的。

## 三、PNG：Image + Canvas + toBlob

SVG 到 PNG 的路径只有三步，但对细节很敏感：

```ts
// 说明性伪代码
await document.fonts.ready;                   // 先等字体，否则量到的是回退字形
const blobUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
const img = await loadImage(blobUrl);         // 解码失败要能捕获
const canvas = document.createElement('canvas');
canvas.width  = img.naturalWidth  * 2;         // 2 倍图
canvas.height = img.naturalHeight * 2;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';                    // 白底，透明背景在文档里会变黑
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
const png = await new Promise(r => canvas.toBlob(r, 'image/png'));
URL.revokeObjectURL(blobUrl);
```

四个细节值得单独解释：

- **等字体**：`document.fonts.ready` 之前绘制，中文可能落到回退字体，字宽变化会让排版错位。等一次的成本是几十毫秒，不等就是一张错版图。
- **2 倍图**：模板宽度固定在 960、1280、1080 几档，两倍之后仍远低于浏览器的画布上限，但放进幻灯片和视网膜屏时足够清晰。
- **白底**：SVG 默认透明。透明 PNG 粘进深色主题的文档会变成一团黑影，白底是最安全的默认值。
- **释放 Blob URL**：不释放就是一次导出泄漏一个对象的生命周期，长会话里会累积。

## 四、下载：为什么不用 `<a href>` 直链

导出结果通过 Blob URL 加锚点 `download` 属性落盘，和既有的文件下载工具保持同一套写法。不用产物路由的直链，原因在桌面端：直链导航带不上请求头里的令牌，会直接 401；而且锚点下载能保留用户当前所在页面，不会把应用顶走。

文件名策略是「保留原基名，只换扩展名」：`architecture.html` 导出为 `architecture.svg` 与 `architecture.png`。中文标题不塞进文件名，避免不同文件系统下的编码差异。

## 五、两端一套实现

Web 与桌面共用同一个预览页。桌面壳加载的就是同一份界面，导出逻辑跑在渲染进程的客户端代码里，主进程一行没改。

这样做的好处很直接：导出的 PNG 在两端像素级一致，不存在「网页端正常、桌面端字体不对」这类分叉问题。代价是没有桌面原生的「另存为」对话框——锚点下载落到系统默认下载目录。这是一个有意识的取舍：为了一个对话框引入主进程 IPC 与文件系统权限，收益不划算。

## 六、交互状态别省

导出是异步的，用户很可能连点。卡片的处理是：导出期间两个按钮同时禁用并显示进度状态；成功后恢复；失败给统一提示。

失败文案刻意不区分网络失败与解码失败——对用户来说都是「这次没导出来，重试一下」。但内部要能区分，否则排查时只能猜。

## 七、已知边界

| 边界 | 说明 |
|---|---|
| Canvas 尺寸上限 | 各浏览器有最大画布限制，当前模板宽度远低于上限 |
| 跨机器字形差异 | 图内不内嵌自定义字体，PNG 用系统字体栈渲染，换机器可能轻微不同 |
| 多 SVG 产物 | 只导第一个，多图请拆成多个产物 |
| 外链资源 | 含外部字体或图片的 HTML 不在导出范围，预览阶段也会被安全策略拦掉 |

## 八、验证

导出工具七例：HTML 提取、SVG 根节点提取与尺寸补齐、Markdown 拒绝、无 SVG 拒绝、坏 XML 拒绝、文件名生成、Blob 下载与 URL 释放、2 倍栅格化、Canvas 不可用报错。卡片七例：预览与下载的旧行为不回归，加上 SVG 导出、PNG 导出、无 SVG 提示、异常提示、Markdown 隐藏入口。整块前端覆盖层二十六例全绿。

下一篇讲内容包：当交付物不是一张图，而是一整本书，怎么保证导进来的东西和作者写的一字不差。
