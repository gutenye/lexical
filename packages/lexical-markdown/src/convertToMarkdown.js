/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

'use strict';

import type {ElementNode} from 'lexical';

import {$isCodeNode} from '@lexical/code';
import {$isLinkNode} from '@lexical/link';
import {$isListItemNode, $isListNode} from '@lexical/list';
import {$isHeadingNode, $isQuoteNode} from '@lexical/rich-text';
import {$dfs} from '@lexical/utils';
import {$isLineBreakNode, $isParagraphNode, $isTextNode} from 'lexical';

function appendLineBreak(text: string, isFirstLineBreak: boolean): string {
  if (text.length > 0 || isFirstLineBreak) {
    return text + '\n';
  }
  return text;
}

// Encode chars that would normally be allowed in a URL but would conflict with
// our markdown syntax: `[foo](http://foo/)`
function encodeURL(url: string): string {
  return url.replace(/\)/g, '%29');
}

function encodeURLTitle(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function $hasSingleListChild(node: ElementNode): boolean {
  return node.getChildrenSize() === 1 && $isListNode(node.getFirstChild());
}

export function $convertToMarkdownString(): string {
  const nodes = $dfs();
  let text = '';
  let shouldAppendFirstLineBreak = false;

  const closingBracketStack: Array<{depth: number, endText: string}> = [];
  const listStack: Array<{count: number, depth: number, tag: 'ul' | 'ol'}> = [];
  const quoteStack: Array<{depth: number}> = [];
  const codeStack: Array<{depth: number}> = [];
  for (let i = 0; i < nodes.length; i++) {
    const {depth, node} = nodes[i];
    if ($isHeadingNode(node)) {
      const tag = node.getTag();
      if (tag === 'h1') {
        text = appendLineBreak(text, shouldAppendFirstLineBreak);
        text += '# ';
      } else if (tag === 'h2') {
        text = appendLineBreak(text, shouldAppendFirstLineBreak);
        text += '## ';
      }
    } else if ($isListNode(node)) {
      listStack.push({count: 0, depth, tag: node.getTag()});
    } else if ($isListItemNode(node)) {
      if (!$hasSingleListChild(node)) {
        text = appendLineBreak(text, shouldAppendFirstLineBreak);
        const list = listStack[listStack.length - 1];
        const indent = ' '.repeat((listStack.length - 1) * 4);
        if (list.tag === 'ol') {
          text += indent + `${++list.count}. `;
        } else if (list.tag === 'ul') {
          text += indent + '- ';
        }
      }
    } else if ($isTextNode(node)) {
      const currentText = node.getTextContent();
      let formattedText = currentText;
      if (closingBracketStack.length > 0) {
        formattedText = encodeURLTitle(formattedText);
      }
      if (node.hasFormat('code')) {
        formattedText = '`' + formattedText + '`';
      }
      if (node.hasFormat('bold')) {
        formattedText = '**' + formattedText + '**';
      }
      if (node.hasFormat('italic')) {
        formattedText = '*' + formattedText + '*';
      }
      if (node.hasFormat('strikethrough')) {
        formattedText = '~~' + formattedText + '~~';
      }
      text += formattedText;
    } else if ($isParagraphNode(node)) {
      text = appendLineBreak(text, shouldAppendFirstLineBreak);
      shouldAppendFirstLineBreak = true;
    } else if ($isQuoteNode(node)) {
      text = appendLineBreak(text, shouldAppendFirstLineBreak);
      text += '> ';
      quoteStack.push({depth});
    } else if ($isLineBreakNode(node)) {
      // Block code-style includes linebreaks
      text = appendLineBreak(text, shouldAppendFirstLineBreak);
    } else if ($isCodeNode(node)) {
      text = appendLineBreak(text, shouldAppendFirstLineBreak);
      text += '```\n';
      codeStack.push({depth});
    } else if ($isLinkNode(node)) {
      text += '[';
      const endText = `](${encodeURL(node.getURL())})`;
      // Push to stack as link content will be inside of nested TextNodes
      closingBracketStack.push({
        depth,
        endText,
      });
    }

    const topOfBracketStack =
      closingBracketStack[closingBracketStack.length - 1];
    const nextNode = nodes[i + 1];
    // Append closing link brackets after we finished processing the link's subtree
    if (
      topOfBracketStack != null &&
      (nextNode == null || nextNode.depth <= topOfBracketStack.depth)
    ) {
      const {endText} = closingBracketStack.pop();
      text += endText;
    }

    while (
      codeStack.length > 0 &&
      (nextNode == null ||
        nextNode.depth <= codeStack[codeStack.length - 1].depth)
    ) {
      text += '\n```';
      codeStack.pop();
    }

    while (
      listStack.length > 0 &&
      (nextNode == null ||
        nextNode.depth <= listStack[listStack.length - 1].depth)
    ) {
      listStack.pop();
    }

    while (
      quoteStack.length > 0 &&
      (nextNode == null ||
        nextNode.depth <= quoteStack[quoteStack.length - 1].depth)
    ) {
      // Append blank line after quote to prevent any following text to be
      // rendered as part of the quote
      text += '\n';
      quoteStack.pop();
    }
  }

  return text;
}
