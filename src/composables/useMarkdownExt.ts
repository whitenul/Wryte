// 自定义 lezer markdown 扩展：数学公式和脚注
// lezer 内部 API 无类型声明，使用 any 标注

interface InlineParser {
  name: string
  parse: (cx: any, next: number, pos: number) => number
  after?: string
}

interface LeafParser {
  nextLine(cx: any, line: any, leaf: any): boolean
  finish(cx: any, leaf: any): boolean
}

interface BlockParser {
  name: string
  leaf(cx: any, leaf: any): LeafParser | null
  after?: string
}

const CHAR_DOLLAR = 36
const CHAR_LBRACKET = 91
const CHAR_CARET = 94
const CHAR_RBRACKET = 93
const CHAR_NEWLINE = 10
const CHAR_EQ = 61

/** 行内数学公式 $...$ */
export const InlineMath = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'InlineMathMark' },
  ],
  parseInline: [{
    name: 'InlineMath',
    parse(cx: any, next: number, pos: number): number {
      // 跳过 $$（由 BlockMath 处理）
      if (next !== CHAR_DOLLAR || cx.char(pos + 1) === CHAR_DOLLAR) return -1
      for (let i = pos + 1; i < cx.end; i++) {
        if (cx.char(i) === CHAR_DOLLAR && cx.char(i + 1) !== CHAR_DOLLAR) {
          return cx.addElement(cx.elt('InlineMath', pos, i + 1, [
            cx.elt('InlineMathMark', pos, pos + 1),
            cx.elt('InlineMathMark', i, i + 1),
          ]))
        }
        // 行内公式不跨行
        if (cx.char(i) === CHAR_NEWLINE) break
      }
      return -1
    },
    after: 'Emphasis',
  } as InlineParser],
}

/** 块级数学公式 $$...$$ */
export const BlockMath = {
  defineNodes: [
    { name: 'BlockMath', block: true },
    { name: 'BlockMathMark' },
  ],
  parseBlock: [{
    name: 'BlockMath',
    leaf(_cx: any, leaf: any): LeafParser | null {
      return leaf.content.trim() === '$$' ? new BlockMathParser() : null
    },
    after: 'FencedCode',
  } as BlockParser],
}

class BlockMathParser {
  private endPos = -1
  nextLine(cx: any, line: any, _leaf: any): boolean {
    if (this.endPos >= 0) return false
    if (line.text.trim() === '$$') {
      this.endPos = cx.lineStart + line.text.length
      return false
    }
    return true
  }
  finish(cx: any, leaf: any): boolean {
    if (this.endPos < 0) return false
    cx.addLeafElement(leaf, cx.elt('BlockMath', leaf.start, this.endPos, [
      cx.elt('BlockMathMark', leaf.start, leaf.start + 2),
      cx.elt('BlockMathMark', this.endPos - 2, this.endPos),
    ]))
    return true
  }
}

/** 脚注引用 [^id] */
export const FootnoteRef = {
  defineNodes: [
    { name: 'FootnoteRef' },
    { name: 'FootnoteRefMark' },
  ],
  parseInline: [{
    name: 'FootnoteRef',
    parse(cx: any, next: number, pos: number): number {
      if (next !== CHAR_LBRACKET || cx.char(pos + 1) !== CHAR_CARET) return -1
      let i = pos + 2
      while (i < cx.end && cx.char(i) !== CHAR_RBRACKET) i++
      if (i >= cx.end || cx.char(i) !== CHAR_RBRACKET) return -1
      return cx.addElement(cx.elt('FootnoteRef', pos, i + 1, [
        cx.elt('FootnoteRefMark', pos, pos + 2),
        cx.elt('FootnoteRefMark', i, i + 1),
      ]))
    },
  } as InlineParser],
}

/** 脚注定义 [^id]: text */
export const FootnoteDef = {
  defineNodes: [
    { name: 'FootnoteDef', block: true },
    { name: 'FootnoteDefMark' },
  ],
  parseBlock: [{
    name: 'FootnoteDef',
    leaf(_cx: any, leaf: any): LeafParser | null {
      const m = /^\[\^(\w+)\]:\s/.exec(leaf.content)
      if (!m) return null
      const markEnd = m[0].length
      return {
        nextLine() { return false },
        finish(cx2: any, leaf2: any) {
          cx2.addLeafElement(leaf2, cx2.elt('FootnoteDef', leaf2.start, leaf2.start + leaf2.content.length, [
            cx2.elt('FootnoteDefMark', leaf2.start, leaf2.start + markEnd),
          ]))
          return true
        },
      }
    },
    after: 'LinkReference',
  } as BlockParser],
}

/** 行内高亮 ==text== */
export const Highlight = {
  defineNodes: [
    { name: 'Highlight' },
    { name: 'HighlightMark' },
  ],
  parseInline: [{
    name: 'Highlight',
    parse(cx: any, next: number, pos: number): number {
      if (next !== CHAR_EQ || cx.char(pos + 1) !== CHAR_EQ) return -1
      for (let i = pos + 2; i < cx.end; i++) {
        if (cx.char(i) === CHAR_EQ && cx.char(i + 1) === CHAR_EQ) {
          return cx.addElement(cx.elt('Highlight', pos, i + 2, [
            cx.elt('HighlightMark', pos, pos + 2),
            cx.elt('HighlightMark', i, i + 2),
          ]))
        }
        if (cx.char(i) === CHAR_NEWLINE) break
      }
      return -1
    },
    after: 'Emphasis',
  } as InlineParser],
}
