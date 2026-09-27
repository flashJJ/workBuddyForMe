import { describe, expect, it } from 'vitest';
import {
  JSON_RPC_ERRORS,
  decodeMessage,
  encodeMessage,
  isNotification,
  isRequest,
  isResponse,
} from './jsonrpc';

describe('jsonrpc 编解码', () => {
  it('请求/响应/通知单行序列化与解析往返', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/list', params: {} };
    const parsedRequest = decodeMessage(encodeMessage(request).trim());
    expect(parsedRequest).toEqual(request);
    expect(isRequest(parsedRequest!)).toBe(true);
    expect(isResponse(parsedRequest!)).toBe(false);

    const response = { jsonrpc: '2.0' as const, id: 1, result: { tools: [] } };
    const parsedResponse = decodeMessage(encodeMessage(response).trim());
    expect(parsedResponse).toEqual(response);
    expect(isResponse(parsedResponse!)).toBe(true);

    const notification = { jsonrpc: '2.0' as const, method: 'notifications/initialized' };
    const parsedNotification = decodeMessage(encodeMessage(notification).trim());
    expect(parsedNotification).toEqual(notification);
    expect(isNotification(parsedNotification!)).toBe(true);
  });

  it('字符串 id 与含中文/换行转义的内容保持一致', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 'srv-1',
      result: { text: '第一行\n第二行' },
    };
    const line = encodeMessage(response);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.includes('\n', 0)).toBe(true); // 仅末尾一个换行
    expect(line.trimEnd().split('\n')).toHaveLength(1);
    expect(decodeMessage(line)).toEqual(response);
  });

  it('非法输入返回 null：坏 JSON / 数组 / 缺 jsonrpc / 缺 method 与 id', () => {
    expect(decodeMessage('not json')).toBeNull();
    expect(decodeMessage('[1,2,3]')).toBeNull();
    expect(decodeMessage('{"id":1,"method":"x"}')).toBeNull(); // 缺 jsonrpc
    expect(decodeMessage('{"jsonrpc":"2.0"}')).toBeNull(); // 既无 method 也无 id
    expect(decodeMessage('')).toBeNull();
  });

  it('标准错误码常量齐备', () => {
    expect(JSON_RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
    expect(JSON_RPC_ERRORS.PARSE_ERROR).toBe(-32700);
  });
});
