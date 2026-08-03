import { marked, Parser, TextRenderer, type Token, type Tokens } from 'marked'
import {
  publishingPlatforms,
  resolveArticleTitle,
  validatePublishTarget,
  type ParsedArticle,
  type PublishValidation,
} from './publisher'

/** 已接入真实草稿准备流程的平台标识。 */
export type DistributionPlatformId = 'xiaohongshu' | 'juejin' | 'wechat'

/** 平台独立内容选项。 */
export interface DistributionContentOptions {
  /** 平台文章分类。 */
  category: string
  /** 用逗号分隔的平台标签。 */
  tags: string
  /** 用户手动填写的平台摘要。 */
  summary: string
}

/** 单个平台最终使用的内容变体。 */
export interface DistributionVariant {
  /** 目标平台标识。 */
  platformId: DistributionPlatformId
  /** 目标平台名称。 */
  platformName: string
  /** 填入平台编辑器的标题。 */
  title: string
  /** 填入纯文本或 Markdown 编辑器的正文。 */
  body: string
  /** 填入富文本编辑器的 HTML。 */
  html: string
  /** 平台文章分类。 */
  category: string
  /** 去重后的平台标签。 */
  tags: string[]
  /** 手动填写或自动提取的平台摘要。 */
  summary: string
  /** 当前平台正文格式的用户可读名称。 */
  formatLabel: '纯文本' | 'Markdown' | '富文本'
  /** 当前平台最终正文字数。 */
  characterCount: number
  /** 当前平台的发布预检结果。 */
  validation: PublishValidation
}

/** 三平台在分发工作台中的固定顺序。 */
export const distributionPlatformIds: DistributionPlatformId[] = [
  'xiaohongshu',
  'juejin',
  'wechat',
]

/** 自动摘要最大字符数，避免生成过长的平台简介。 */
const automaticSummaryMaximumLength = 120

/** 平台标签最大数量，与真实发布请求的输入约束保持一致。 */
const platformTagMaximumCount = 10

/** Markdown 行内文本解析器，用于去掉强调、链接等排版标记。 */
const inlineTextParser = new Parser()

/** Markdown 纯文本渲染器，用于保留文字而不生成 HTML。 */
const inlineTextRenderer = new TextRenderer()

/**
 * 构建三平台分发计划；`article` 是源文章，`optionsByPlatform` 是各平台独立选项。
 */
export function buildDistributionPlan(
  article: ParsedArticle,
  optionsByPlatform: Record<DistributionPlatformId, DistributionContentOptions>
): DistributionVariant[] {
  return distributionPlatformIds.map((platformId) =>
    buildDistributionVariant(platformId, article, optionsByPlatform[platformId])
  )
}

/**
 * 构建单个平台内容变体；`platformId` 是目标平台，`article` 是源文章，`options` 是平台选项。
 */
export function buildDistributionVariant(
  platformId: DistributionPlatformId,
  article: ParsedArticle,
  options: DistributionContentOptions
): DistributionVariant {
  // 平台定义，保存目标平台对应的名称和基础校验规则。
  const platform = publishingPlatforms.find((item) => item.id === platformId)
  if (!platform) {
    throw new Error(`不支持的分发平台：${platformId}`)
  }

  // 原始标题，保存 frontmatter 或正文一级标题解析出的结果。
  const title = resolveArticleTitle(article)?.trim() ?? ''
  // 去重正文，保存移除与平台标题栏重复的开头一级标题后的 Markdown。
  const deduplicatedBody = removeLeadingArticleHeading(article.body, title)
  // 平台正文，保存小红书纯文本或其他平台原始 Markdown。
  const body =
    platformId === 'xiaohongshu'
      ? renderMarkdownAsReadableText(deduplicatedBody)
      : deduplicatedBody
  // 富文本正文，保存公众号编辑器使用的 HTML 内容。
  const html = (
    marked.parse(deduplicatedBody, {
      async: false,
    }) as string
  ).trim()
  // 平台标签，保存兼容中英文逗号、去重并限制数量后的结果。
  const tags = normalizePlatformTags(options.tags)
  // 自动摘要，保存源文章首个有效正文段落。
  const automaticSummary = extractArticleSummary(deduplicatedBody, title)
  // 平台摘要，优先使用用户输入，空值时使用自动摘要。
  const summary = options.summary.trim() || automaticSummary
  // 平台预检，保存基础校验和平台特有的准备建议。
  const validation = buildPlatformValidation(
    platformId,
    validatePublishTarget(platform, article),
    article,
    options,
    tags
  )

  return {
    platformId,
    platformName: platform.name,
    title,
    body,
    html,
    category: options.category.trim(),
    tags,
    summary,
    formatLabel:
      platformId === 'xiaohongshu'
        ? '纯文本'
        : platformId === 'juejin'
          ? 'Markdown'
          : '富文本',
    characterCount: body.length,
    validation,
  }
}

/** 移除与平台标题栏重复的开头一级标题；`markdown` 是正文，`articleTitle` 是平台标题。 */
function removeLeadingArticleHeading(
  markdown: string,
  articleTitle: string
): string {
  // Markdown token 列表，保存用于识别正文首个结构节点的解析结果。
  const tokens = marked.lexer(markdown)
  // 首个正文 token，保存可能与平台标题栏重复的一级标题。
  const firstToken = tokens[0]
  if (
    firstToken?.type !== 'heading' ||
    firstToken.depth !== 1 ||
    firstToken.text.trim() !== articleTitle
  ) {
    return markdown.trim()
  }

  return markdown.slice(firstToken.raw.length).trim()
}

/**
 * 把 Markdown 转成适合小红书长文编辑器的可读纯文本；`markdown` 是正文，`articleTitle` 是需要避免重复的文章标题。
 */
export function renderMarkdownAsReadableText(
  markdown: string,
  articleTitle = ''
): string {
  // 块级 token 列表，保存 Markdown 解析后的结构化正文。
  const tokens = marked.lexer(markdown)
  // 可读文本块，保存去除 Markdown 语法后的段落、列表和代码。
  const blocks = tokens
    .map((token) => renderBlockToken(token))
    .filter((block) => block.length > 0)
  // 去重标题，避免 frontmatter 标题和正文一级标题在平台标题区与正文重复出现。
  const normalizedTitle = articleTitle.trim()
  if (normalizedTitle && blocks[0] === normalizedTitle) {
    blocks.shift()
  }

  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 从文章首个有效段落生成摘要；`markdown` 是正文，`articleTitle` 是需要排除的标题。
 */
export function extractArticleSummary(
  markdown: string,
  articleTitle = ''
): string {
  // Markdown token 列表，保存用于查找正文段落的结构化内容。
  const tokens = marked.lexer(markdown)
  // 首个段落 token，保存最适合作为摘要的普通正文。
  const paragraphToken = tokens.find((token) => token.type === 'paragraph')
  if (!paragraphToken || paragraphToken.type !== 'paragraph') return ''

  // 段落文本，保存去除行内 Markdown 语法和多余空白后的摘要原文。
  const paragraphText = renderInlineTokens(
    (paragraphToken as Tokens.Paragraph).tokens
  )
    .replace(/\s+/g, ' ')
    .trim()
  // 标题文本，保存避免把只有标题的段落误用作摘要时的比较值。
  const normalizedTitle = articleTitle.trim()
  if (!paragraphText || paragraphText === normalizedTitle) return ''

  return paragraphText.length > automaticSummaryMaximumLength
    ? `${paragraphText.slice(0, automaticSummaryMaximumLength - 1)}…`
    : paragraphText
}

/**
 * 规范化平台标签；`value` 是用户输入的中英文逗号分隔文本。
 */
export function normalizePlatformTags(value: string): string[] {
  // 标签集合，保存按首次出现顺序去重后的非空标签。
  const uniqueTags = new Set(
    value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  )

  return [...uniqueTags].slice(0, platformTagMaximumCount)
}

/**
 * 渲染单个 Markdown 块级 token；`token` 是 marked 解析出的正文节点。
 */
function renderBlockToken(token: Token): string {
  if (token.type === 'heading' || token.type === 'paragraph') {
    // 行内 token，保存标题或段落中的强调、链接和普通文本节点。
    const inlineTokens = Array.isArray(token.tokens) ? token.tokens : []
    return renderInlineTokens(inlineTokens)
  }
  if (token.type === 'code') {
    // 代码 token，保存 marked 解析出的代码块正文。
    const codeToken = token as Tokens.Code
    return `【代码】\n${codeToken.text.trim()}`
  }
  if (token.type === 'blockquote') {
    // 引用 token，保存带块级子节点的结构化引用。
    const quoteToken = token as Tokens.Blockquote
    // 引用文本，保存去除引用语法后的多行内容。
    const quoteText = quoteToken.tokens
      .map(renderBlockToken)
      .filter(Boolean)
      .join('\n')
    return quoteText ? `引用：${quoteText}` : ''
  }
  if (token.type === 'list') {
    return renderListToken(token as Tokens.List)
  }
  if (token.type === 'table') {
    // 表格 token，保存表头、正文行和单元格 token。
    const tableToken = token as Tokens.Table
    // 表格行，保存表头和正文单元格的纯文本表示。
    const rows = [tableToken.header, ...tableToken.rows]
    return rows
      .map((row) =>
        row
          .map((cell: Tokens.TableCell) => renderInlineTokens(cell.tokens))
          .join(' ｜ ')
      )
      .join('\n')
  }
  if (token.type === 'html') {
    // HTML token，保存嵌入 Markdown 的原始标签内容。
    const htmlToken = token as Tokens.HTML
    return htmlToken.text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return ''
}

/**
 * 渲染 Markdown 列表；`token` 是带顺序类型和列表项的节点。
 */
function renderListToken(token: Tokens.List): string {
  return token.items
    .map((item, index) => {
      // 列表项正文，保存去除 Markdown 列表符号后的可读内容。
      const itemText = item.tokens
        .map((itemToken) =>
          itemToken.type === 'text'
            ? renderInlineTokens(itemToken.tokens ?? [itemToken])
            : renderBlockToken(itemToken)
        )
        .filter(Boolean)
        .join(' ')
      // 列表项前缀，保存有序编号或无序项目符号。
      const prefix = token.ordered
        ? `${Number(token.start || 1) + index}.`
        : '•'
      return `${prefix} ${itemText}`.trim()
    })
    .join('\n')
}

/**
 * 渲染 Markdown 行内 token；`tokens` 是强调、链接和普通文本节点列表。
 */
function renderInlineTokens(tokens: Token[]): string {
  return inlineTextParser.parseInline(tokens, inlineTextRenderer).trim()
}

/**
 * 合并平台特有预检；`platformId` 是目标平台，`baseValidation` 是基础结果，`article` 是源文章，`options` 是平台选项，`tags` 是规范化标签。
 */
function buildPlatformValidation(
  platformId: DistributionPlatformId,
  baseValidation: PublishValidation,
  article: ParsedArticle,
  options: DistributionContentOptions,
  tags: string[]
): PublishValidation {
  // 警告列表，保存基础提示与平台特有的内容准备建议。
  const warnings = [...baseValidation.warnings]
  // 文章是否含图，保存小红书内容配图建议的判断结果。
  const hasImage = /!\[[^\]]*]\([^)]+\)/.test(article.body)

  // 业务场景：小红书长文缺图不阻止生成草稿，但应在批量操作前明确提示。
  if (platformId === 'xiaohongshu' && !article.metadata.cover && !hasImage) {
    warnings.push('建议为小红书准备至少一张配图')
  }
  // 业务场景：Markdown 图片不会随纯文本正文自动上传，检测到图片时必须提示用户在平台确认。
  if (platformId === 'xiaohongshu' && hasImage) {
    warnings.push('正文图片需在小红书编辑器中重新确认')
  }
  // 业务场景：掘金发布页要求用户选择分类，批量填入前先暴露遗漏项。
  if (platformId === 'juejin' && !options.category.trim()) {
    warnings.push('建议补充掘金文章分类')
  }
  // 业务场景：掘金文章依赖标签进入内容频道，空标签不阻断草稿准备。
  if (platformId === 'juejin' && tags.length === 0) {
    warnings.push('建议补充掘金标签')
  }

  return {
    ok: baseValidation.ok,
    errors: [...baseValidation.errors],
    warnings,
  }
}
