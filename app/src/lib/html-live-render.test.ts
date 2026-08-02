import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findHtmlBlockEnd, findInlineHtmlSpans } from './html-live-render.ts';

test('识别用户文档中的多行 div 图片块', () => {
  const lines = [
    '<div align="center">',
    '  <img src="https://example.com/figure.png" width="90%"/>',
    '  <p>图 1.1 智能体与环境的基本交互循环</p>',
    '</div>',
    '',
  ];
  assert.equal(findHtmlBlockEnd(lines, 0), 3);
});

test('同名嵌套 HTML 容器必须匹配到最外层结束标签', () => {
  const lines = ['<section>', '<section>inside</section>', '</section>'];
  assert.equal(findHtmlBlockEnd(lines, 0), 2);
});

test('不完整或不支持的 HTML 不折叠，保留源码可编辑', () => {
  assert.equal(findHtmlBlockEnd(['<div>', 'missing close'], 0), null);
  assert.equal(findHtmlBlockEnd(['<script>alert(1)</script>'], 0), null);
  assert.equal(findHtmlBlockEnd(['普通文本'], 0), null);
});

test('识别一行内多个 HTML 格式片段', () => {
  const line = '欢迎来到<strong>智能体（Agent）</strong>世界<sup>[1]</sup>。';
  const spans = findInlineHtmlSpans(line);
  assert.deepEqual(spans.map((span) => span.kind), ['strong', 'sup']);
  assert.equal(line.slice(spans[0].contentFrom, spans[0].contentTo), '智能体（Agent）');
  assert.equal(line.slice(spans[1].contentFrom, spans[1].contentTo), '[1]');
  assert.equal(line.slice(spans[0].openFrom, spans[0].openTo), '<strong>');
  assert.equal(line.slice(spans[1].closeFrom, spans[1].closeTo), '</sup>');
});

test('inline HTML 属性和常用语义标签', () => {
  const line = '<mark class="key">重点</mark> <u>下划线</u> <kbd>⌘K</kbd>';
  assert.deepEqual(
    findInlineHtmlSpans(line).map((span) => span.kind),
    ['mark', 'underline', 'kbd'],
  );
});
