# 统一响应包络 + 领域错误码：让前后端吵架变少

> 前后端联调最烦的不是 bug，是「你返回的格式跟我想的不一样」。

## 没有统一格式时的混乱

想象一下：
- 接口 A 成功返回 `{ data: {...} }`
- 接口 B 成功直接返回数组
- 接口 C 失败返回 `{ error: "msg" }`
- 接口 D 失败返回 `{ code: 500, message: "..." }`
- 接口 E 失败直接返回字符串

前端要为每个接口写一套解析逻辑，疯了。

## 统一响应包络

所有接口返回统一结构：

**成功**：
```json
{ "success": true, "data": T }
```

**失败**：
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "供应商不存在：xxx", "details": {} } }
```

就两条规则：
1. 永远有 `success` 字段
2. 成功有 `data`，失败有 `error`（含 `code` 和 `message`）

前端处理起来巨简单：

```ts
const res = await fetch(...);
const body = await res.json();
if (!body.success) {
  throw new AppError(body.error.code, body.error.message);
}
return body.data;
```

不用猜返回格式，不用 try/catch 解析异常结构。

## 领域错误码：比 HTTP 状态码更精确

HTTP 状态码太粗。404 可能是「供应商不存在」，也可能是「模型不存在」，前端需要区分处理。

所以定义**领域错误码**，映射到 HTTP 状态码：

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

错误码是**单一事实源**，定义在 `shared` 包里，前后端共用：

```ts
export const ERROR_CODES = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  // ...
} as const;
```

API 文档里也引用同一张表，三处一致，不会「文档说 409，代码返 403」。

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

业务层 throw `ApiError`，Route Handler 捕获后转成统一格式 + 对应 HTTP 状态码：

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

## Zod 端到端校验

入参全部用 Zod 校验，失败统一返回 `VALIDATION_ERROR`（422），错误信息来自 Zod 的 `issues`：

```ts
const parsed = providerCreateSchema.safeParse(body);
if (!parsed.success) {
  throw ApiError.validation(parsed.error.issues.map(i => i.message).join('; '));
}
```

Zod schema 同时推断出 TS 类型，前后端类型同源——改 schema，两边类型一起变。

## SSE 里的错误怎么办

流式接口是 HTTP 200，不能用状态码表达错误。所以错误走 SSE 的 `error` 事件：

```
event: error
data: {"code":"PROVIDER_TIMEOUT","message":"上游响应超时"}
```

消息同时落库 `error_code` 和 `error_message`，前端展示友好提示。

## 这套设计的收益

1. **前端零猜测**：永远按 `success/data/error` 解析
2. **错误可定位**：code 精确到业务语义，不是泛泛的 500
3. **前后端类型同源**：Zod schema 共享，改一处全链路生效
4. **文档有据可查**：错误码表单一事实源，文档/代码/测试一致

## 一个真实收益

之前联调时，前端老问「这个接口失败返回啥」。现在不用问了——所有接口都一样，看错误码表就行。前后端吵架次数显著下降（虽然一个人开发没啥架好吵，但省了自己跟自己较劲的时间）。

## 小结

统一 API 契约的三件套：

1. **响应包络**：`{ success, data }` / `{ success, error: { code, message } }`
2. **领域错误码**：比 HTTP 状态码更精确，单一事实源
3. **Zod 端到端校验**：入参校验 + 类型推断，前后端同源

下一篇聊聊「外部模型调用 100% mock：四层测试体系的取舍」。
