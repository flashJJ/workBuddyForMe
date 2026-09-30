---
title: "单文件 HTML 导出：内联 CSS、data URL 图片与最小 markdown 渲染"
series: "WorkBuddy For Me v0.4 技术拆解"
number: "B05"
tags: ["workbuddy", "share", "html", "xss", "serializer"]
date: "2025-Q4"
---

## 导出格式的目标：一个文件就是终点

对话分享的产品决策在 B01 里讲过：不做在线链接，导出文件即最终产物。这个决策对 HTML 导出器提出了一条硬约束：

> 生成的 HTML 文件双击打开必须完整可读——不加载任何外部 CSS、字体、图片、JS。

这意味着：CSS 全部内联进 `<style>`、对话里的图片全部转成 data URL 内嵌、markdown 渲染在导出时完成而不是靠 JS 运行时渲染。**文件一旦生成，和应用、和网络、和这台机器都没有任何关系了**——用户把它扔到微信文件传输助手、邮件附件、U 盘里，三年后打开还是那个样子。

存档级耐久性是本地优先产品的本分。反过来，如果 HTML 依赖一个 CDN 的 highlight.js，三年后 CDN 挂了或者路径变了，分享出去的对话就成了残缺品。

---

## 两层架构：core 出快照，web 做序列化

分享链路刻意拆成两层，职责边界清晰：

```text
core 快照层（packages/core/src/share/）
  export-conversation.ts：从 DB 拉完整会话
    → 图片附件读文件转 data URL
    → sanitizeSnapshot 全字段脱敏（见 B04）
    → ConversationSnapshot（与存储无关的中间结构）
        │
        ▼
web 序列化层（apps/web/src/lib/share/）
  markdown-serializer.ts：snapshot → .md
  html-template.ts：      snapshot → 单文件 .html
```

core 层产出的 `ConversationSnapshot` 不依赖 DB 行结构、不依赖 Next.js——web 层的两个序列化器只消费这个纯数据结构。**同一份快照喂给两个序列化器**，保证 Markdown 和 HTML 两种格式的内容永远一致（措辞、脱敏、图片、工具轨迹），差异只在排版。

图片内嵌就发生在快照层：消息里引用的附件 ID 在导出时被解析、读盘、base64 编码成 `data:image/png;base64,...`。体积换自包含——一张 2MB 截图变成约 2.7MB 的 data URL，换来的是分享文件的零外部依赖。

---

## 最小 markdown 渲染：为什么不用 marked

HTML 模板里有一个看起来「重新造轮子」的决策：自己写了一个 ~40 行的最小 markdown 渲染器，而不是用 marked/markdown-it。

```typescript
/** 最小 markdown：围栏代码块 + 行内代码 + 空行分段 + 换行 */
function renderProse(markdown: string): string {
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  // 围栏代码块切分 → 块间文本按空行分段 → 段内 `code` 与换行
}
```

支持范围刻意收窄到四样：**围栏代码块、行内代码、空行分段、换行**。

理由有三：

1. **XSS 面收敛**。对话内容是模型生成的，本质上是**不可信输入**——模型完全可能在回答里输出 `<script>` 或 `<img onerror>`。成熟的 markdown 渲染器输出的是 HTML，要么信任它（危险），要么再过一遍 sanitize（DOMPurify 又大一层）。我们的渲染器反过来：**先 `escapeHtml` 全量转义，再在转义后的文本上做结构替换**——任何 HTML 标签在源头就已经死了，后面怎么拼都是安全的。
2. **零依赖**。marked 加上 sanitize 链条是几十 KB 的依赖，而我们需要的格式化能力模型输出里 95% 的情况用不到（模型对话主要是段落 + 代码块）。
3. **输出确定**。自家渲染器输出完全可控，HTML 模板里每种结构对应固定的 CSS 类，不会出现 marked 版本升级导致导出样式漂移。

代价也写在了 docstring 里：表格、列表这些「稍微复杂」的 markdown 语法在 HTML 导出里会退化成纯文本段落。这是可接受的取舍——Markdown 导出格式本身保留全部语法原文，需要富排版的用户可以拿 .md 文件去任何工具里渲染。

```typescript
function renderInline(text: string): string {
  return escapeHtml(text).replace(/`([^`\n]+)`/g, '<code>$1</code>');
}
```

这一行是整个渲染器的安全基石：转义在前、替换在后，顺序不能反。反过来的话，代码内容里的 `<` 会逃逸成真实标签——单测里有一条专门的用例：模型输出包含 `<img src=x onerror=alert(1)>` 的消息，导出 HTML 里必须是转义后的纯文本。

---

## 序列化的其余细节

**Markdown 序列化器**的职责是把对话结构翻译成 md 惯例：

- 角色标注：`## 👤 用户` / `## 🤖 助手`
- 工具调用过程渲染成引用块（`> 🔧 fetch_webpage(...)`），不混进正文流
- RAG 引用变文末脚注（`[^1]: 文档名 — 片段`），正文里保留角标
- 图片：Markdown 格式里 data URL 也内嵌（同样的自包含理由）

**HTML 模板**的排版决策：阅读宽度限 720px 居中（对话不是文档，长行毁阅读）、代码块深色底、用户/助手消息用左侧色条区分角色、工具轨迹默认折叠在 `<details>` 里（点开才看过程，正文保持干净）。

**水印**统一加在两个格式的文件尾部：`由 WorkBuddy For Me v0.4.0 生成 · 导出时间 2026-09-28`。水印的作用不是版权声明，而是**溯源**——接收方看到文件就知道出处与新旧，也方便我们自己判断「这个分享文件是哪个版本导出的」（B02 的 manifest 同理，版本信息永远跟着数据走）。

---

## API 与下载

导出 API 是一个 GET：

```text
GET /api/conversations/[id]/export?format=md|html
```

返回 `Content-Disposition: attachment` 文件流，文件名带会话标题（文件名非法字符清洗：`[\\/:*?"<>|]` 全部替换成 `-`）。用 GET 而不用 POST 的理由纯粹是用户体验：浏览器地址栏/`<a download>` 直接可触发下载，不用写 fetch + blob 的胶水代码。

分享入口在会话页头部，弹一个小菜单选格式。整个交互没有「分享设置」这种概念——格式即全部选项，其余（脱敏、内嵌、水印）都是不可关闭的默认行为。**安全默认值不该是选项。**

---

## 小结

单文件 HTML 导出的技术选型全是减法：自研 40 行渲染器替代 marked（XSS 面收敛 + 零依赖）、escape-before-replace 替代事后 sanitize、data URL 内嵌替代外部引用、GET 文件流替代前端 blob 胶水。核心判断只有一个——分享文件是**存档物**，存档物的第一美德是「不依赖任何还活着的东西」。

下一篇 B06 进入桌面端：electron-updater 接入实录——更新状态机怎么收敛、IPC 桥怎么设计、以及为什么开发态必须 no-op。
