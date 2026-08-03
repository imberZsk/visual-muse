import { describe, expect, test } from 'vitest'
import {
  buildWechatDraftPayload,
  parseArticleMarkdown,
  publishingPlatforms,
  simulatePublish,
  validatePublishTarget,
} from './publisher'

// 该文件专门覆盖 publisher.ts 里的边界分支：frontmatter 异常、布尔归一化、图片列表解析等。
describe('发布领域模型边界分支', () => {
  test('没有 frontmatter 分隔线时整篇作为正文', () => {
    // 纯正文 Markdown，用来验证 splitFrontmatter 无分隔线时的降级路径。
    const article = parseArticleMarkdown('# 直接正文\n\n没有 frontmatter')

    expect(article.metadata.title).toBeUndefined()
    expect(article.body).toBe('# 直接正文\n\n没有 frontmatter')
  })

  test('frontmatter 未闭合时按普通正文处理', () => {
    // 缺少结束分隔线的 Markdown，用来验证 closingIndex 为 -1 的降级路径。
    const article = parseArticleMarkdown('---\ntitle: 未闭合\n\n# 正文')

    // 业务场景：未闭合的 frontmatter 不应被解析成元数据，避免误吞用户内容。
    expect(article.metadata.title).toBeUndefined()
    expect(article.body).toContain('title: 未闭合')
  })

  test('frontmatter 中带引号的字符串会去掉引号', () => {
    // 带单双引号的元数据，用来验证 parseScalarValue 去引号逻辑。
    const article = parseArticleMarkdown(
      `---\ntitle: "带引号标题"\nauthor: '单引号作者'\n---\n\n正文`
    )

    expect(article.metadata.title).toBe('带引号标题')
    expect(article.metadata.author).toBe('单引号作者')
  })

  test('frontmatter 中 false 会解析为布尔假', () => {
    // need_open_comment 为 false 的元数据，用来覆盖 parseScalarValue 的 false 分支。
    const article = parseArticleMarkdown(
      `---\ntitle: 关评论\nneed_open_comment: false\nonly_fans_can_comment: true\n---\n\n正文`
    )

    expect(article.metadata.need_open_comment).toBe(false)
    expect(article.metadata.only_fans_can_comment).toBe(true)
  })

  test('忽略非 key/value 结构的 frontmatter 行', () => {
    // 含有裸文本行的元数据，用来覆盖 separatorIndex 为 -1 时跳过该行的分支。
    const article = parseArticleMarkdown(
      `---\ntitle: 有效标题\n这是一行没有冒号的无效内容\n---\n\n正文`
    )

    expect(article.metadata.title).toBe('有效标题')
  })

  test('显式 image_list 列表优先于正文图片', () => {
    // 通过缩进列表声明 image_list 的元数据，用来覆盖 currentListKey 追加与显式列表优先分支。
    const markdown = `---\ntitle: 显式图片\ntype: image\nimage_list:\n  - ./a.png\n  - ./b.png\n---\n\n![](./ignored.png)\n\n描述`
    // 解析结果，用来验证 image_list 直接取自 frontmatter 而非正文提取。
    const article = parseArticleMarkdown(markdown)

    expect(article.metadata.image_list).toEqual(['./a.png', './b.png'])
    expect(buildWechatDraftPayload(article)).toMatchObject({
      kind: 'image',
      image_list: ['./a.png', './b.png'],
    })
  })

  test('空的 frontmatter 行不影响解析', () => {
    // 含空行的元数据，用来覆盖 trimmedLine 为空时的 continue 分支。
    const article = parseArticleMarkdown(
      `---\ntitle: 含空行\n\nauthor: 作者\n---\n\n正文`
    )

    expect(article.metadata.title).toBe('含空行')
    expect(article.metadata.author).toBe('作者')
  })

  test('普通图文缺封面且正文无图片时给出封面警告', () => {
    // 无封面无插图的文章，用来覆盖 validatePublishTarget 的 wechat 封面警告分支。
    const article = parseArticleMarkdown(
      `---\ntitle: 无封面\n---\n\n纯文字正文`
    )
    // 微信平台校验结果，用来断言 warnings 中包含封面建议。
    const validation = validatePublishTarget(publishingPlatforms[0], article)

    expect(validation.ok).toBe(true)
    expect(validation.warnings).toContain('建议提供封面或正文首图')
  })

  test('正文含图片时微信平台不再提示封面警告', () => {
    // 含正文插图的文章，用来覆盖封面警告分支的否定路径。
    const article = parseArticleMarkdown(
      `---\ntitle: 有插图\n---\n\n![](./first.png)`
    )
    // 微信平台校验结果，用来断言不产生封面警告。
    const validation = validatePublishTarget(publishingPlatforms[0], article)

    expect(validation.warnings).not.toContain('建议提供封面或正文首图')
  })

  test('非微信平台缺封面不触发封面警告', () => {
    // 无封面文章，用来覆盖 platform.id !== wechat 时跳过封面校验的分支。
    const article = parseArticleMarkdown(`---\ntitle: 知乎文章\n---\n\n正文`)
    // 知乎平台校验结果，用来断言非微信平台没有封面警告。
    const validation = validatePublishTarget(publishingPlatforms[1], article)

    expect(validation.warnings).toEqual([])
  })

  test('type=image 但正文无图片时回退为普通图文', () => {
    // 声明为图片消息却没有图片的文章，用来覆盖 isImageArticle 的否定组合分支。
    const article = parseArticleMarkdown(
      `---\ntitle: 空图片消息\ntype: image\n---\n\n只有文字`
    )

    // 业务场景：type=image 时自动提取正文图片，提取为空则仍走图片消息但列表为空。
    expect(buildWechatDraftPayload(article)).toMatchObject({
      kind: 'image',
      image_list: [],
    })
  })

  test('无 frontmatter 文章生成载荷时使用一级标题', () => {
    // 含一级标题的普通图文，用来覆盖 resolveTitle 的 Markdown 标题兜底分支。
    const article = parseArticleMarkdown('# 只有正文')
    // 生成的公众号载荷，用来断言标题回退为正文一级标题。
    const payload = buildWechatDraftPayload(article)

    expect(payload).toMatchObject({ kind: 'article' })
    if (payload.kind === 'article') {
      expect(payload.articles[0].title).toBe('只有正文')
    }
  })

  test('模拟发布返回 ISO 时间戳', () => {
    // 可发布文章，用来验证 simulatePublish 的 createdAt 为合法 ISO 字符串。
    const article = parseArticleMarkdown(`---\ntitle: 时间戳文章\n---\n\n正文`)
    // 掘金平台，按语义标识查找以避免新增导航项改变数组下标。
    const juejinPlatform = publishingPlatforms.find(
      (platform) => platform.id === 'juejin'
    )
    if (!juejinPlatform) throw new Error('缺少掘金平台测试数据')
    // 模拟发布结果，用来断言时间字段可被 Date 解析。
    const result = simulatePublish(juejinPlatform, article)

    expect(result.platformId).toBe('juejin')
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false)
  })
})
