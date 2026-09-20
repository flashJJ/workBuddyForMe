# 模块设计：设置中心

> 状态：已实现（Task 12/19/25/33）

## 职责

- 供应商配置 CRUD（OpenAI 兼容；Ollama 预留）与启停。
- 模型维护（手工新增，chat/embedding 能力标签）。
- 连接测试、默认对话/Embedding 模型、主题与语言偏好。
- API Key 加密落盘与脱敏出参；数据目录展示。

## 关键实现（core）

`packages/core/src/services/provider-service.ts`：

- `list() / get(id) / create(input) / update(id, input) / delete(id) / testConnection(id, signal)`
- 普通返回不含密文，仅 `hasApiKey` 布尔（密文经 `provider.getRow` 才可取，供服务层解密）。
- `testConnection` 复用 Provider 适配器 `GET {baseUrl}/models`，超时 `CONNECTION_TEST_TIMEOUT_MS=10_000`；成功返回 `{ ok: true }`，失败错误经 `toApiError` 归一化（含供应商状态码与消息）。

`packages/core/src/services/settings-service.ts`：`get() / update(patch)`，字段 `defaultChatModelId / defaultEmbeddingModelId / theme / language`；更新时校验两个默认模型存在性。

## 密钥安全

- 加密：Web 模式 AES-GCM；Electron 模式密文由主进程 safeStorage 经 cipher 桥产生，服务端只在内存解密（见 modules/electron-shell.md）。
- 密文字段 `api_key_cipher`，明文不落库、不进日志。
- 出参统一经 `maskSecret()`（`packages/core/src/secrets/cipher.ts`）：保留前 3 位与后 4 位，中间替换为 `****`。

## 时序（连接测试）

```text
页面 → POST /api/providers/{id}/test → 解密 Key → GET {baseUrl}/models（超时 10s）
     → { ok: true } / 归一化 ApiError（PROVIDER_TIMEOUT、PROVIDER_AUTH 等，见 api.md 错误码矩阵）
```

## 前端

`apps/web/src/app/settings/`：默认偏好面板（`defaults-panel`：默认模型/主题）+ 供应商卡片（启停、编辑、连接测试、模型管理），调用 `/api/providers`、`/api/models/[id]`、`/api/settings`。
