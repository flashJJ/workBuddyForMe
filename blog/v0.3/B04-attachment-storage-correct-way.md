---
title: "附件存储的正确姿势：落盘 + sha256 去重 + 威胁模型取舍"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B04"
tags: ["workbuddy", "storage", "attachment", "sha256", "security"]
date: "2025-Q4"
---

## 为什么图片不进数据库

第一个想法很诱人：把图片 base64 编码后直接存到 SQLite 的 BLOB 或者 TEXT 列里。代码 5 行搞定，查询 join 一下就拿出来了，不需要额外的文件系统路径管理。

但 v0.1 做文档上传的时候我们已经踩过这个坑——`documents` 表一开始也是存 BLOB，后来改了。原因在附件这里同样成立，甚至更严重：

1. **SQLite 单文件膨胀**：一张 3MB 的图 base64 后 4MB，存 10 张就是 40MB，数据库文件一下从几 MB 长到几百 MB，备份和同步都变重。
2. **全表扫描**：你只关心文本消息做全文检索，但 base64 图片的 TEXT 列也在被扫——拖慢所有查询。
3. **无法去重**：不同对话引用同一张图会被存成多份，数据库膨胀更快。
4. **ORM 映射开销**：better-sqlite3 查 BLOB 或大 TEXT 列会走 Buffer 解析，每次流式对话时 `buildImageMap` 要读取多张历史图片，IO 放大严重。

所以结论很明确：**二进制只落磁盘，数据库只存元数据和引用**。这篇讲整个 AttachmentService 的设计和实现细节。

---

## 完整设计

### 文件系统布局

```
<data-dir>/attachments/<id>.<ext>
```

`id` 是 SQLite 自动生成的主键（`INTEGER PRIMARY KEY AUTOINCREMENT`），`ext` 由 mimeType 映射：

| mimeType | ext |
|----------|-----|
| `image/png` | `.png` |
| `image/jpeg` | `.jpg` |
| `image/webp` | `.webp` |

为什么用数据库 id 而不是 sha256 做文件名？因为 sha256 文件名太长、不容易读（debug 时你会感谢 `att-123.png` 而不是 `7f3a...b2c.png`）。sha256 只在 DB 元数据里做去重查找，文件名用短 id。

### 数据库 schema

`packages/database/src/migrations/v003-multimodal.ts`：

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(content_hash)`);
```

注意 `content_hash` 列加了索引——`save()` 方法里 `findByHash` 靠它实现 sha256 去重。

### 服务层全貌

`packages/core/src/services/attachment-service.ts`：

```typescript
export function createAttachmentService(deps: ServiceDeps) {
  const repo = createAttachmentRepository(deps.db);
  const dir = getDataDir('attachments');
  mkdirSync(dir, { recursive: true });  // 服务自建即确保目录存在

  const validate = (input: AttachmentInput): void => {
    if (!ALLOWED_IMAGE_MIME.includes(input.mimeType)) {
      throw ApiError.validation(`不支持的图片类型：${input.mimeType}（仅支持 png / jpeg / webp）`);
    }
    if (input.buffer.byteLength === 0) throw ApiError.validation('图片内容为空');
    if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw ApiError.validation('图片超过 10MB 上限');
    }
  };

  return {
    save(input: AttachmentInput): Attachment {
      validate(input);
      const contentHash = hashBuffer(input.buffer);
      const existing = repo.findByHash(contentHash);       // sha256 去重
      if (existing) return mapAttachment(existing);          // 秒传，DB 已有

      const created = repo.create({
        filename: input.filename,
        mimeType: input.mimeType,
        byteSize: input.buffer.byteLength,
        contentHash,
      });
      writeFileSync(join(dir, attachmentStorageName(created.id, input.mimeType)), input.buffer);
      return mapAttachment(created);
    },

    requireRowsByIds(ids: string[]): AttachmentRow[] { /* ... 保险 2 ... */ },

    loadImages(ids: string[]): ResolvedImage[] {
      return this.requireRowsByIds(ids).map((row) => ({
        attachmentId: row.id,
        mimeType: row.mime_type,
        dataBase64: Buffer.from(readFileSync(join(dir, row.storage_path))).toString('base64'),
      }));
    },

    read(id: string): { attachment: Attachment; mimeType: string; buffer: Buffer } { /* ... 回流 API ... */ },
  };
}
```

四个公开方法，职责清晰：

| 方法 | 用途 | 同步/异步 |
|------|------|----------|
| `save` | 上传入口（API multipart） | 同步 |
| `requireRowsByIds` | SSE 前门控（查 DB） | 同步 |
| `loadImages` | 编排器组装 wire（读文件） | 同步 |
| `read` | 图片回流 API `/api/attachments/[id]` | 同步 |

全部同步——AttachmentService 是本地操作，IO 都是 `node:fs` 的 sync 版本，不需要 async/await。

---

## sha256 去重的实现

```typescript
function hashBuffer(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
```

Node.js 内置 crypto，单线程 CPU 计算，3MB 图片的 hash 耗时在 2-3ms 级别——完全可以放同步路径。

```typescript
// save() 里的去重逻辑
const contentHash = hashBuffer(input.buffer);
const existing = repo.findByHash(contentHash);
if (existing) return mapAttachment(existing);   // 直接返回已有记录，不写文件
```

### 去重的真实价值

假设一个公司里有 50 个员工各自上传了一张公司 logo 截图做头像，sha256 去重之后：
- DB 里只有 1 条 attachment 记录
- 磁盘上只有 1 份 logo 文件
- 50 条 message.contentParts 都引用同一个 attachmentId

没有去重的话，磁盘和数据库会膨胀 50 倍。

### 为什么用 sha256 而不是文件大小 + 文件名

文件名和大小都可能重复（不同图片可能同名同大小），sha256 是内容指纹，碰撞概率可以忽略不计。

---

## 威胁模型

### 场景定义

WorkBuddy For Me 的威胁模型很明确：**本机单用户、不外传、主要风险是文件系统误操作或用户手动清理**。

| 风险 | 是否真实 | 我们怎么处理 |
|------|----------|-------------|
| 用户手动删了 attachments/ 目录里的文件 | ✅ 非常可能 | 保险 2（DB 查）+ loadImages 时文件缺失抛 Error |
| 不同用户文件互串 | ❌ 不可能（单用户） | 不考虑 |
| 恶意用户上传图片扫描宿主机内网 | ❌ 不走图片做这个 | SSRF 防护在网页剪藏模块（safe-web-fetch）里 |
| 数据库泄露导致附件 ID 被遍历 | ❌ 本机应用，DB 不走网络 | 不考虑 |
| 用户发隐私图片到云端模型 | ✅ 可能发生 | 这是产品层面的选择（选本地 Ollama 就完全不会外泄） |

### 为什么不加密

如果附件是敏感数据（比如身份证照片），加密是必要的。但我们选了**明文落盘 + 文档级开关**的方案：

- 本地 Ollama 场景：图片根本不出本机，加密是多余的
- 云端 API 场景：加密了也没用——解密后在内存里就是明文，provider 还是会收到 data URL（除非你自己在客户端加密然后给模型看加密后的图，那模型啥也识别不了）

真的要做加密的话，应该在**发之前就加密图片**（客户端 AES-GCM + 密钥由用户输入），这样 provider 收到的就是加密后的像素。但这超出了 v0.3 的范围——v0.3 的 MVP 假设用户知道自己在做什么。

### 为什么文件用明文扩展名

`<id>.png` 而不是 `<id>.dat` 或无扩展名。原因：

1. Debug 友好——看到 `att-456.png` 一眼就知道是什么，排查故障时省很多时间
2. 用户手动清理时更容易识别——不会误删
3. 扩展名不构成安全风险——即使有人替换扩展名，`loadImages` 里用的是 DB 里的 `mimeType`（来自上传时校验），不是从文件名推断

---

## API 层：multipart upload 和回流

### 上传入口

`apps/web/src/app/api/attachments/route.ts`：

```typescript
export async function POST(request: Request) {
  // 解析 multipart/form-data
  const form = await request.formData();
  const file = form.get('file');
  // 校验 + save
  const result = attachmentService.save({
    filename: (file as File).name,
    mimeType: (file as File).type,
    buffer: new Uint8Array(await (file as File).arrayBuffer()),
  });
  // 返回 { id, filename, mimeType, byteSize }
  return ApiResponse.ok(result);
}
```

前端 composer 里的 `use-attachment-upload.ts`：

```typescript
// 上传后拿到 attachmentId，塞进 composer 的 state
const form = new FormData();
form.append('file', file);
const resp = await fetch('/api/attachments', { method: 'POST', body: form });
const data = await resp.json();
onUpload(data.id);   // attachmentId 进入 contentParts 的 image 片段
```

### 回流 API

图片渲染时需要在前端显示。`/api/attachments/[id]` 返回原始文件：

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { attachment, mimeType, buffer } = attachmentService.read(params.id);
  return new Response(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

`image_url` 在模型 wire 里用的是 **base64 data URL**（在 `loadImages` 里现算），不是这个 HTTP 端点。这个端点只在前端渲染时用。

---

## 清理与回收

清理孤立附件（文件存在但 message 不引用、或 message 已删除）是 v0.4 的工作。v0.3 里先不做自动清理，手动删除时走一个脚本。

但有一件事必须做：**附件文件的生命周期应该绑定到 attachment 表的 id 上**。如果有一天我们加了 ON DELETE CASCADE 或者定时清理脚本，逻辑就是：

```sql
-- SQL：查找孤立附件
SELECT a.id, a.storage_path FROM attachments a
LEFT JOIN message_content_parts mcp ON mcp.attachment_id = a.id
WHERE mcp.id IS NULL;
```

然后 `fs.unlink` 物理删除。这里之所以没把文件路径硬编码在脚本里，就是因为 `AttachmentService` 已经提供了路径拼接函数 `attachmentStorageName`——清理脚本只要调用它就行，不重复造轮子。

---

## 小结

附件存储的设计原则可以浓缩为：

1. **二进制只落盘，DB 只存元数据和引用**——SQLite 不是文件系统
2. **sha256 做内容去重**——相同内容只存一份，秒传
3. **文件名用 DB id，hash 只用于去重查找**——人类可读 + 索引高效
4. **明文落盘，扩展名保留**——debug 友好，风险模型里明确接受
5. **loadImages 才转 base64**——不在 DB 里存 base64，不在 upload 时预计算

这套设计在单用户、本地场景下足够简洁、足够安全。如果以后要支持多用户或云存储（S3），只要把 `AttachmentService` 的 `save`/`loadImages`/`read` 的存储层换了就行——上层的 ContentPart 契约完全不用变。

下一篇 B05 讲 Ollama 视觉模型真机踩坑——qwen2.5vl 的 image_url data URL 直传 vs 原生 `/api/chat` images 字段的完整排查链路。
