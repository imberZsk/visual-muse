import { describe, expect, test } from 'vitest'
import {
  buildDistributionPlan,
  buildDistributionVariant,
  extractArticleSummary,
  normalizePlatformTags,
  renderMarkdownAsReadableText,
  type DistributionContentOptions,
  type DistributionPlatformId,
} from './distribution'
import { parseArticleMarkdown } from './publisher'

/** 默认平台选项，用于只关注内容转换的单元测试。 */
const defaultOptions: DistributionContentOptions = {
  category: '',
  tags: '',
  summary: '',
}

/** 三平台默认选项表，用于生成完整分发计划。 */
const optionsByPlatform: Record<
  DistributionPlatformId,
  DistributionContentOptions
> = {
  xiaohongshu: { ...defaultOptions },
  juejin: {
    category: '前端',
    tags: 'Electron, 效率工具,Electron',
    summary: '',
  },
  wechat: { ...defaultOptions },
}

describe('三平台分发计划', () => {
  test('小红书移除 Markdown 语法和重复一级标题', () => {
    // 纯文本正文，保存小红书内容适配后的结果。
    const readableText = renderMarkdownAsReadableText(
      '# 一次写作，多端分发\n\n这是一段 **重点** 内容。\n\n- 第一项\n- 第二项\n\n```ts\nconst ready = true\n```',
      '一次写作，多端分发'
    )

    expect(readableText).not.toContain('# 一次写作')
    expect(readableText).not.toContain('**')
    expect(readableText).toContain('这是一段 重点 内容。')
    expect(readableText).toContain('• 第一项')
    expect(readableText).toContain('【代码】')
  })

  test('自动摘要取首个正文段落并限制长度', () => {
    // 长段落，保存超过摘要长度限制的测试文本。
    const longParagraph = '这是摘要内容'.repeat(30)
    // 自动摘要，保存去除标题和行内语法后的平台简介。
    const summary = extractArticleSummary(
      `# 标题\n\n**${longParagraph}**\n\n后续段落`,
      '标题'
    )

    expect(summary).toHaveLength(120)
    expect(summary.endsWith('…')).toBe(true)
    expect(summary).not.toContain('**')
  })

  test('平台标签兼容中英文逗号并按首次出现去重', () => {
    expect(normalizePlatformTags('Electron，效率工具, Electron,发布')).toEqual([
      'Electron',
      '效率工具',
      '发布',
    ])
  })

  test('同一源文章生成三种平台正文格式和自动摘要', () => {
    // 源文章，保存带标题、正文和代码块的跨平台输入。
    const article = parseArticleMarkdown(
      '---\ntitle: 三平台内容\n---\n\n# 三平台内容\n\n从一份 Markdown 生成三个草稿。\n\n```ts\nconst count = 3\n```'
    )
    // 分发计划，保存三平台按固定顺序生成的内容变体。
    const plan = buildDistributionPlan(article, optionsByPlatform)

    expect(plan.map((variant) => variant.platformId)).toEqual([
      'xiaohongshu',
      'juejin',
      'wechat',
    ])
    expect(plan.map((variant) => variant.formatLabel)).toEqual([
      '纯文本',
      'Markdown',
      '富文本',
    ])
    expect(plan[0]?.body).not.toContain('```')
    expect(plan[1]?.body).not.toContain('# 三平台内容')
    expect(plan[1]?.body).toContain('```ts')
    expect(plan[2]?.html).not.toContain('<h1>三平台内容</h1>')
    expect(plan[2]?.html).toContain('<p>从一份 Markdown 生成三个草稿。</p>')
    expect(
      plan.every(
        (variant) => variant.summary === '从一份 Markdown 生成三个草稿。'
      )
    ).toBe(true)
  })

  test('掘金缺少分类和标签时给出可继续准备的建议', () => {
    // 掘金变体，保存缺少平台选项时的预检结果。
    const variant = buildDistributionVariant(
      'juejin',
      parseArticleMarkdown('# 标题\n\n正文'),
      defaultOptions
    )

    expect(variant.validation.ok).toBe(true)
    expect(variant.validation.warnings).toEqual(
      expect.arrayContaining(['建议补充掘金文章分类', '建议补充掘金标签'])
    )
  })

  test('小红书检测到 Markdown 图片时提示在平台重新确认', () => {
    // 小红书变体，保存带正文图片但尚未完成平台上传的预检结果。
    const variant = buildDistributionVariant(
      'xiaohongshu',
      parseArticleMarkdown('# 标题\n\n正文\n\n![示例](./cover.png)'),
      defaultOptions
    )

    expect(variant.validation.warnings).toContain(
      '正文图片需在小红书编辑器中重新确认'
    )
  })
})
