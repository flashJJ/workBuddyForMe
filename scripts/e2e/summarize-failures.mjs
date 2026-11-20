#!/usr/bin/env node
/**
 * E2E 失败摘要：读取 Playwright junit 报告，把失败用例按 spec 聚合写入
 * GitHub Job Summary（本地无 GITHUB_STEP_SUMMARY 时打印到 stdout）。
 *
 * 背景：CI 失败后只能翻几十万行日志定位「哪个 spec 挂了」，这个脚本让
 * 一次点击 job 就能看到失败清单，不需要额外依赖。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT = resolve('apps/web/test-results/junit.xml');
const MAX_MESSAGE = 180;

/** 解码 XML 实体（junit 只用到这五个） */
function decode(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function attr(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decode(match[1]) : '';
}

/** 失败正文取首行可读信息（去掉栈与 ANSI） */
function firstLine(body) {
  const text = decode(body.replace(/<[^>]+>/g, ' '))
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!text) return '';
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text;
}

function collectFailures(xml) {
  const failures = [];
  for (const suite of xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const suiteName = attr(suite[1], 'name');
    for (const testcase of suite[2].matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const body = testcase[2] ?? '';
      if (!/<failure\b/.test(body)) continue;
      failures.push({
        spec: suiteName,
        title: attr(testcase[1], 'name'),
        message: firstLine(body),
      });
    }
  }
  return failures;
}

if (!existsSync(REPORT)) {
  console.log(`未找到 junit 报告：${REPORT}（E2E 可能未执行到用例阶段）`);
  process.exit(0);
}

const failures = collectFailures(readFileSync(REPORT, 'utf8'));
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (failures.length === 0) {
  console.log('junit 报告中无失败用例');
  process.exit(0);
}

const lines = [
  `## E2E 失败用例（${failures.length}）`,
  '',
  '| Spec | 用例 | 首行错误 |',
  '| --- | --- | --- |',
];
for (const failure of failures) {
  const cell = (value) => value.replaceAll('|', '\\|').replace(/\s+/g, ' ');
  lines.push(`| ${cell(failure.spec)} | ${cell(failure.title)} | ${cell(failure.message)} |`);
}

const markdown = `${lines.join('\n')}\n`;
if (summaryPath) appendFileSync(summaryPath, markdown, 'utf8');
else console.log(markdown);

// 同时打 GitHub 注解，失败列表直接出现在 PR/commit 的文件视图中
for (const failure of failures) {
  const file = `tests/e2e/${failure.spec.replaceAll('\\', '/').split('/').pop()}`;
  console.log(`::error file=${file}::${failure.title} — ${failure.message}`);
}
