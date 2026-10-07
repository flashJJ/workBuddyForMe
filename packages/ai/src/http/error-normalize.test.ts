import { describe, expect, it } from 'vitest';
import { normalizeHttpError } from './error-normalize';

describe('normalizeHttpError 上下文超限引导', () => {
  it('Ollama exceed_context_size_error：消息附带模型窗口/num_ctx 处理建议', () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message:
          'request (4233 tokens) exceeds the available context size (4096 tokens), try increasing it',
        type: 'exceed_context_size_error',
      },
    });
    const err = normalizeHttpError(400, body, 'SSE 连接 http://127.0.0.1:11434/v1/chat/completions');
    expect(err.status).toBe(400);
    expect(err.retriable).toBe(false);
    expect(err.message).toContain('exceeds the available context size');
    expect(err.message).toContain('上下文窗口');
    expect(err.message).toContain('num_ctx');
  });

  it('普通 400 错误不追加上下文建议', () => {
    const err = normalizeHttpError(
      400,
      JSON.stringify({ error: { message: 'bad request' } }),
      '请求',
    );
    expect(err.message).not.toContain('num_ctx');
  });

  it('5xx 标记为可重试', () => {
    const err = normalizeHttpError(502, '', '请求');
    expect(err.retriable).toBe(true);
  });
});
