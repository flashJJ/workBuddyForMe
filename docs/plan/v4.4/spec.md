# v4.4 Spec：背景与壁纸

> 对应方案：[README.md](./README.md)。本文件只写契约与实施边界，不重复背景说明。

## 1. 设置契约

### 1.1 背景源

```ts
export const BACKGROUND_SOURCE_KINDS = ['builtin', 'image', 'video'] as const;

export type BackgroundSource =
  | { kind: 'builtin'; id: string }
  | { kind: 'image'; id: string }
  | { kind: 'video'; id: string };
```

- `builtin`：`none`、`wallpaper.rainy-room`、`wallpaper.dusk`、`wallpaper.morning`；
- `image` / `video`：用户文件 id（`userData/backgrounds/<id>.<ext>`）或 `wallpaper-pack` 包内 id；
- 统一以 `kind + id` 定位，不存绝对路径。

### 1.2 作用域

```ts
export interface BackgroundConfig {
  source: BackgroundSource;
  fit: 'cover' | 'contain';
  dim: number;   // 0–1
  blur: number;  // 0–20
  mode?: 'chat' | 'window'; // 仅 scope=main
}

export interface BackgroundSettings {
  main: BackgroundConfig;
  stage: BackgroundConfig;
  pet: BackgroundConfig;
}
```

- 默认：`main`/`stage` 为 `builtin:wallpaper.rainy-room`，`pet` 为 `builtin:none`；
- `mode` 只允许出现在 `main`，聊天与整屏共用同一 `source`；
- 所有字段进入既有设置 JSON，零数据库迁移。

## 2. 内置素材

| id | 类型 | 文件 | 预算 |
|---|---|---|---|
| `wallpaper.rainy-room` | video | `public/backgrounds/rainy-room.mp4` | ≤10MB，720p，H.264 |
| `wallpaper.dusk` | image | `public/backgrounds/dusk.webp` | ≤1MB |
| `wallpaper.morning` | image | `public/backgrounds/morning.webp` | ≤1MB |
| `none` | — | — | 透明/主题底色 |

- 新增 `scripts/assets/background-budget.json`，由 `check:assets` 校验单文件与总量。

## 3. 本地文件（仅桌面端）

### 3.1 IPC

| 通道 | 方向 | 说明 |
|---|---|---|
| `background:pick` | renderer → main | 打开文件选择，返回 `{ canceled, file?: { id, kind, name, bytes } }` |
| `background:list` | renderer → main | 列出 userData 下已复制背景 |
| `background:remove` | renderer → main | 删除指定 id 的副本 |

- 允许扩展名：`.png/.jpg/.jpeg/.webp/.mp4`；
- 图片 ≤20MB，视频 ≤50MB；复制后按内容嗅探类型，扩展名不可信；
- id 采用 uuid，写入 `userData/backgrounds/`。

### 3.2 读取

- 桌面端通过自定义协议或受控路由读取，路径参数只接受 `^[a-z0-9-]{8,64}\.(png|jpg|jpeg|webp|mp4)$`；
- 拒绝 `..`、绝对路径、符号链接逃逸；
- 文件缺失时返回 404，渲染层回退 `builtin:wallpaper.rainy-room`。

## 4. `wallpaper-pack`

### 4.1 payload

```json
{
  "name": "示例壁纸包",
  "description": "",
  "backgrounds": [
    {
      "id": "wallpaper.pack.sample",
      "kind": "image",
      "file": "payload/assets/sample.webp",
      "license": "CC0-1.0"
    }
  ]
}
```

- `backgrounds` 1–10 项；id 强制 `wallpaper.` 前缀且包内唯一；
- `file` 必须位于 `payload/`，图片或 `.mp4`；
- 许可白名单：`CC0-1.0`、`CC-BY-4.0`；
- 单文件 ≤50MB，整包 ≤200MB。

### 4.2 聚合

- 读取同 `scene-content` / `prop-content`：按已启用能力行聚合，版本 `wallpapers:<sha256(sorted id@version)[:12]>`；
- 背景源解析顺序：内置 → 用户文件 → 包内资源；同 id 冲突 fail-closed 并记录 `lastError`；
- 停用包后下一次读取生效，不热替换正在播放的视频。

## 5. 渲染

| 界面 | 组件 | 说明 |
|---|---|---|
| 舞台/小剧场 | `StageBackground` | 最底层；剧集 `backdrop` 作为未配置时的默认 |
| 聊天/整屏 | `MainBackground` | 由 `mode` 决定留白或全幅；不遮挡输入区 |
| 桌宠 | `PetBackground` | 独立配置；默认 `none` 保持透明 |

- 视频统一 `muted loop playsInline preload="metadata"`；
- `document.visibilityState !== 'visible'` 或窗口最小化时 `pause()`，恢复时 `play()`；
- `prefers-reduced-motion: reduce` 或省电档：只渲染首帧（`currentTime=0` + `pause()`）；
- `dim` 用黑色遮罩，`blur` 用 CSS filter，均不作用于角色画布。

## 6. 测试清单

- shared：背景设置 schema 默认值、非法 kind/mode、数值边界；
- core：`wallpaper-pack` payload 校验、路径越界、超限、重复 id、聚合快照与启停；
- web：背景解析与回退、视频暂停策略、聊天/整屏互斥、桌宠默认透明；
- desktop：文件选择、复制、类型嗅探、超限拒绝、id 校验与删除；
- 回归：舞台退出桌宠模型保持、能力包多选安装不受影响。
