# 统一响应包络与领域错误码：前后端不再为返回格式扯皮

前后端联调最耗时间的往往不是修 bug，而是处理「你返回的格式跟我预期不一样」。想象这样一个接口群：

- 接口 A 成功返回 `{ data: {...} }`；
- 接口 B 成功直接返回裸数组；
- 接口 C 失败返回 `{ error: "msg" }`；
- 接口 D 失败返回 `{ code: 500, message: "..." }`；
- 接口 E 失败直接返回一个字符串。

前端就得为每个接口写一套专门的解析和异常分支。这篇讲这个本地 AI 应用的解法：统一响应包络 + 比 HTTP 状态码更精确的领域错误码 + Zod 端到端校验，三件套把契约钉死。

## 统一响应包络

所有接口只允许两种返回结构。

**成功**：

```json
{ "success": true, "data": "T" }
```

**失败**：

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "供应商不存在：xxx", "details": {} } }
```

就两条规则：

1. 响应体永远有 `success` 字段；
2. 成功有 `data`，失败有 `error`（必含 `code` 和 `message`）。

前端处理逻辑因此收敛成一段：

```ts
const res = await fetch(...);
const body = await res.json();
if (!body.success) {
  throw new AppError(body.error.code, body.error.message);
}
return body.data;
```

不用猜返回格式，也不用 try/catch 去解析各种异常结构。

## 领域错误码：HTTP 状态码不够用

HTTP 状态码太粗。同样是 404，可能是「供应商不存在」，也可能是「模型不存在」，前端需要区别提示和分支处理。所以在 HTTP 状态码之内再定义一层**领域错误码**：

| code | HTTP | 语义 |
|---|---|---|
| VALIDATION_ERROR | 422 | 入参校验失败 |
| UNAUTHORIZED | 401 | 缺少本地启动令牌 |
| FORBIDDEN | 403 | 禁止操作（如删除内置助手） |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 业务冲突（如重复上传） |
| EMBEDDING_NOT_CONFIGURED | 422 | 未配置 Embedding 模型 |
| PROVIDER_ERROR | 502 | 上游供应商错误 |
| PROVIDER_TIMEOUT | 504 | 上游超时 |
| INTERNAL_ERROR | 500 | 兜底 |

错误码表是**单一事实源**，定义在 `shared` 包里，前后端共用：

```ts
export const ERROR_CODES = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  // ...
} as const;
```

API 文档引用同一张表，测试也断言同一套映射，三处一致——不会再出现「文档说 409，代码返 403」的漂移。

## ApiError：统一错误类

```ts
class ApiError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;

  toBody() {
    return { code: this.code, message: this.message, details: this.details };
  }

  get httpStatus() {
    return ERROR_CODES[this.code];
  }
}
```

业务层只负责 throw `ApiError`，Route Handler 统一捕获，转成包络格式和对应 HTTP 状态码：

```ts
try {
  const data = await service.doSomething();
  return NextResponse.json({ success: true, data });
} catch (error) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: error.toBody() },
      { status: error.httpStatus },
    );
  }
  // 兜底
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
    { status: 500 },
  );
}
```

业务代码里不再出现手写状态码，HTTP 状态只是错误码的一个派生属性。

## Zod 端到端校验

所有入参先用 Zod 校验，失败统一返回 `VALIDATION_ERROR`（422），错误信息直接来自 Zod 的 `issues`：

```ts
const parsed = providerCreateSchema.safeParse(body);
if (!parsed.success) {
  throw ApiError.validation(parsed.error.issues.map(i => i.message).join('; '));
}
```

Zod schema 同时推断出 TypeScript 类型，前后端类型同源——改一处 schema，两边的类型和校验一起变，不存在「校验规则改了类型没改」的窗口期。

## SSE 里的错误怎么办

流式接口响应头已经是 HTTP 200，建立之后没法再用状态码表达错误。所以流内错误走 SSE 的 `error` 事件，包络结构与普通接口保持一致：

```text
event: error
data: {"code":"PROVIDER_TIMEOUT","message":"上游响应超时"}
```

错误同时落库到消息的 `error_code` 和 `error_message` 字段，前端据此展示友好提示，刷新后也能查到这次失败的原因，而不是只看到半段沉默的回答。

## 这套设计的实际收益

1. **前端零猜测**：永远按 `success/data/error` 三段式解析；
2. **错误可定位**：code 精确到业务语义，不再用泛泛的 500 糊脸；
3. **前后端类型同源**：Zod schema 共享，改一处全链路生效；
4. **文档有据可查**：错误码表是唯一事实源，文档、代码、测试强制一致。

单人开发前后端都是自己写，这套契约最大的价值是**省掉自己跟自己较劲的时间**：联调时再也不用回头翻「这个接口失败到底返回啥」——所有接口都长一个样，看错误码表就行。

## 小结

统一 API 契约三件套：

1. **响应包络**：`{ success, data }` / `{ success, error: { code, message } }`；
2. **领域错误码**：比 HTTP 状态码更精确，全仓单一事实源；
3. **Zod 端到端校验**：入参校验加类型推断，前后端同源，SSE 流内错误也走同一套结构。

下一篇讲测试体系：为什么外部模型调用必须 100% mock，以及四层测试各自测什么、放弃什么。
