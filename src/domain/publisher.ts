import { marked } from 'marked'

export type PlatformId =
  | 'wechat'
  | 'zhihu'
  | 'toutiao'
  | 'juejin'
  | 'csdn'
  | 'medium'
  | 'weibo'
  | 'xiaohongshu'
  | 'bilibili'
  | 'yuque'
  | 'baijiahao'

export interface PublishPlatform {
  /** 平台唯一标识，用于保存配置和生成发布记录。 */
  id: PlatformId
  /** 平台中文名称，用于界面展示。 */
  name: string
  /** 平台发布能力说明，用于帮助用户理解该平台当前支持范围。 */
  capability: string
  /** 平台是否支持第一版模拟发布流程。 */
  supportsSimulation: boolean
}

export interface ArticleMetadata {
  /** 文章标题，对微信公众号草稿是必填字段。 */
  title?: string
  /** 文章封面路径或 URL。 */
  cover?: string
  /** 文章作者名称。 */
  author?: string
  /** 原文链接。 */
  source_url?: string
  /** 文章类型，`image` 表示公众号图片消息。 */
  type?: string
  /** 图片消息使用的图片路径列表。 */
  image_list?: string[]
  /** 是否打开公众号评论。 */
  need_open_comment?: boolean
  /** 是否仅粉丝可评论。 */
  only_fans_can_comment?: boolean
}

export interface ParsedArticle {
  /** 从 frontmatter 解析出的文章元数据。 */
  metadata: ArticleMetadata
  /** 去除 frontmatter 后的 Markdown 正文。 */
  body: string
}

export interface WechatArticlePayload {
  /** 公众号草稿标题。 */
  title: string
  /** 公众号草稿 HTML 内容。 */
  content: string
  /** 公众号草稿封面路径或 URL。 */
  cover?: string
  /** 公众号草稿作者。 */
  author?: string
  /** 公众号草稿原文链接。 */
  source_url?: string
  /** 公众号草稿评论开关。 */
  need_open_comment?: boolean
  /** 公众号草稿粉丝评论限制。 */
  only_fans_can_comment?: boolean
}

export type WechatDraftPayload =
  | {
      /** 普通图文载荷类型。 */
      kind: 'article'
      /** 微信 `draft/add` 接口所需 articles 数组。 */
      articles: WechatArticlePayload[]
    }
  | {
      /** 图片消息载荷类型。 */
      kind: 'image'
      /** 图片消息标题。 */
      title: string
      /** 图片消息正文描述。 */
      content: string
      /** 图片消息图片列表。 */
      image_list: string[]
      /** 图片消息封面路径或 URL。 */
      cover?: string
      /** 图片消息作者。 */
      author?: string
    }

export interface PublishValidation {
  /** 预检是否通过。 */
  ok: boolean
  /** 阻止发布的错误列表。 */
  errors: string[]
  /** 不阻止发布但建议补齐的信息列表。 */
  warnings: string[]
}

export interface PublishResult {
  /** 目标平台唯一标识。 */
  platformId: PlatformId
  /** 发布文章标题。 */
  title: string
  /** 模拟发布状态。 */
  status: 'success'
  /** 模拟返回的媒体 ID 或草稿 ID。 */
  mediaId: string
  /** 发布记录创建时间 ISO 字符串。 */
  createdAt: string
}

interface FrontmatterSplitResult {
  /** frontmatter 原始文本，不包含起止分隔线。 */
  metadataText: string
  /** 去除 frontmatter 后的正文内容。 */
  body: string
}

/** 参考 WenYan 项目整理的第一版平台列表，用于导航和发布目标选择。 */
export const publishingPlatforms: PublishPlatform[] = [
  {
    id: 'wechat',
    name: '微信公众号',
    capability: '生成图文草稿与图片消息载荷，可接入本地或远程 Server 发布。',
    supportsSimulation: true,
  },
  {
    id: 'zhihu',
    name: '知乎',
    capability: '生成适配知乎编辑器的文章预览，第一版提供复制/模拟发布。',
    supportsSimulation: true,
  },
  {
    id: 'toutiao',
    name: '今日头条',
    capability: '生成适配头条图文后台的内容预览，第一版提供复制/模拟发布。',
    supportsSimulation: true,
  },
  {
    id: 'juejin',
    name: '掘金',
    capability: '保留 Markdown 结构并生成技术社区发布记录。',
    supportsSimulation: true,
  },
  {
    id: 'csdn',
    name: 'CSDN',
    capability: '保留 Markdown 与代码块结构，生成技术博客发布记录。',
    supportsSimulation: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    capability: '生成英文内容平台友好的 HTML 预览与发布记录。',
    supportsSimulation: true,
  },
  {
    id: 'weibo',
    name: '微博',
    capability: '通过持久登录窗口准备微博内容并保存草稿。',
    supportsSimulation: true,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    capability: '准备小红书文章或图文内容，使用独立平台适配器同步草稿。',
    supportsSimulation: true,
  },
  {
    id: 'bilibili',
    name: 'B 站',
    capability: '准备 B 站专栏内容并通过持久登录窗口同步草稿。',
    supportsSimulation: true,
  },
  {
    id: 'yuque',
    name: '语雀',
    capability: '保留 Markdown 结构并同步到语雀文档编辑器。',
    supportsSimulation: true,
  },
  {
    id: 'baijiahao',
    name: '百家号',
    capability: '准备百家号图文内容并通过平台窗口同步草稿。',
    supportsSimulation: true,
  },
]

/**
 * 解析 Markdown 文章；`markdown` 是包含可选 frontmatter 的原始文章内容。
 */
export function parseArticleMarkdown(markdown: string): ParsedArticle {
  // frontmatter 拆分结果，保存元数据文本和正文内容。
  const splitResult = splitFrontmatter(markdown)
  // frontmatter 数据对象，保存从 YAML 风格文本解析出的松散字段。
  const metadataData = parseSimpleFrontmatter(splitResult.metadataText)
  // 文章元数据，保存公众号和多平台发布时需要的字段。
  const metadata = normalizeMetadata(metadataData)
  // 文章正文，保存去掉 frontmatter 后的 Markdown。
  const body = splitResult.body.trim()

  return {
    metadata,
    body,
  }
}

/**
 * 拆分 Markdown frontmatter；`markdown` 是用户输入的完整文章。
 */
function splitFrontmatter(markdown: string): FrontmatterSplitResult {
  // 行列表，保存文章按换行切分后的内容。
  const lines = markdown.split(/\r?\n/)

  // 业务场景：没有 frontmatter 分隔线时，整篇文章都视作正文。
  if (lines[0]?.trim() !== '---') {
    return {
      metadataText: '',
      body: markdown,
    }
  }

  // 结束分隔线索引，保存第二个 `---` 所在行号。
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---'
  )

  // 业务场景：frontmatter 没有闭合时按普通正文处理，避免误删用户内容。
  if (closingIndex === -1) {
    return {
      metadataText: '',
      body: markdown,
    }
  }

  return {
    metadataText: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  }
}

/**
 * 解析轻量 frontmatter；`metadataText` 是不含分隔线的 YAML 风格文本。
 */
function parseSimpleFrontmatter(metadataText: string): Record<string, unknown> {
  // 元数据结果，保存 key/value 和简单数组字段。
  const result: Record<string, unknown> = {}
  // 当前数组字段名，保存正在读取的 YAML 列表 key。
  let currentListKey: string | null = null

  for (const rawLine of metadataText.split(/\r?\n/)) {
    // 当前行内容，保存未破坏缩进前的 frontmatter 行。
    const line = rawLine
    // 去除空白后的行内容，保存用于判断结构的文本。
    const trimmedLine = line.trim()

    // 业务场景：空行不承载元数据，直接跳过。
    if (!trimmedLine) {
      continue
    }

    // 业务场景：缩进的 `- value` 归属上一行声明的数组字段。
    if (currentListKey && trimmedLine.startsWith('- ')) {
      // 当前数组值，保存去除列表符号后的文本。
      const listValue = parseScalarValue(trimmedLine.slice(2).trim())
      // 当前数组原始值，保存 result 中可能已有的列表数据。
      const currentRawList = result[currentListKey]
      // 当前数组，保存 result 中正在追加的列表。
      const currentList: unknown[] = Array.isArray(currentRawList)
        ? currentRawList
        : []

      result[currentListKey] = [...currentList, listValue]
      continue
    }

    // 冒号位置，保存 key/value 分隔符所在索引。
    const separatorIndex = trimmedLine.indexOf(':')

    // 业务场景：非 key/value 行不是第一版支持的 frontmatter 结构，忽略即可。
    if (separatorIndex === -1) {
      currentListKey = null
      continue
    }

    // 字段名，保存冒号前的 frontmatter key。
    const key = trimmedLine.slice(0, separatorIndex).trim()
    // 字段原始值，保存冒号后的 frontmatter value。
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()

    // 业务场景：`image_list:` 这类空值字段表示后续缩进列表。
    if (!rawValue) {
      result[key] = []
      currentListKey = key
      continue
    }

    result[key] = parseScalarValue(rawValue)
    currentListKey = null
  }

  return result
}

/**
 * 解析 frontmatter 标量值；`value` 是冒号后的原始文本。
 */
function parseScalarValue(value: string): string | boolean {
  // 去引号后的值，保存兼容简单字符串引号的结果。
  const unquotedValue = value.replace(/^["']|["']$/g, '')
  // 小写值，保存布尔字符串判断所需文本。
  const lowerValue = unquotedValue.toLowerCase()

  // 业务场景：frontmatter 中常用 true/false 表示公众号评论开关。
  if (lowerValue === 'true') {
    return true
  }

  // 业务场景：frontmatter 中常用 true/false 表示公众号评论开关。
  if (lowerValue === 'false') {
    return false
  }

  return unquotedValue
}

/**
 * 生成微信公众号草稿载荷；`article` 是已解析的文章内容。
 */
export function buildWechatDraftPayload(
  article: ParsedArticle
): WechatDraftPayload {
  // 图片列表，保存 frontmatter 指定或正文自动提取的图片路径。
  const imageList = resolveImageList(article)

  // 业务场景：图片消息使用小绿书模式，不应用普通图文 HTML 主题。
  if (isImageArticle(article, imageList)) {
    return {
      kind: 'image',
      title: resolveTitle(article),
      content: stripMarkdownImages(article.body),
      image_list: imageList,
      cover: article.metadata.cover,
      author: article.metadata.author,
    }
  }

  return {
    kind: 'article',
    articles: [
      {
        title: resolveTitle(article),
        content: renderMarkdownToHtml(article.body),
        cover: article.metadata.cover,
        author: article.metadata.author,
        source_url: article.metadata.source_url,
        need_open_comment: article.metadata.need_open_comment,
        only_fans_can_comment: article.metadata.only_fans_can_comment,
      },
    ],
  }
}

/**
 * 校验目标平台发布条件；`platform` 是目标平台，`article` 是待发布文章。
 */
export function validatePublishTarget(
  platform: PublishPlatform,
  article: ParsedArticle
): PublishValidation {
  // 错误列表，保存阻止发布的必填项问题。
  const errors: string[] = []
  // 警告列表，保存不阻止发布的体验优化建议。
  const warnings: string[] = []

  // 业务场景：所有参考平台都需要标题，微信公众号更是 API 必填。
  if (!article.metadata.title?.trim()) {
    errors.push('缺少文章标题')
  }

  // 业务场景：公众号普通图文没有封面时仍可发布，但后台展示效果较弱。
  if (
    platform.id === 'wechat' &&
    !article.metadata.cover &&
    extractMarkdownImages(article.body).length === 0
  ) {
    warnings.push('建议提供封面或正文首图')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 模拟发布文章；`platform` 是目标平台，`article` 是待发布文章。
 */
export function simulatePublish(
  platform: PublishPlatform,
  article: ParsedArticle
): PublishResult {
  // 当前时间对象，用于生成发布记录时间和模拟 ID。
  const now = new Date()
  // 模拟媒体 ID，用来表现真实平台返回草稿或媒体编号的结果。
  const mediaId = `mock_${platform.id}_${now.getTime().toString(36)}`

  return {
    platformId: platform.id,
    title: resolveTitle(article),
    status: 'success',
    mediaId,
    createdAt: now.toISOString(),
  }
}

/**
 * 归一化 frontmatter 数据；`data` 是 gray-matter 解析出的松散对象。
 */
function normalizeMetadata(data: Record<string, unknown>): ArticleMetadata {
  // 图片列表原始值，保存 YAML 中可能出现的数组或单值。
  const rawImageList = data.image_list

  return {
    title: normalizeOptionalString(data.title),
    cover: normalizeOptionalString(data.cover),
    author: normalizeOptionalString(data.author),
    source_url: normalizeOptionalString(data.source_url),
    type: normalizeOptionalString(data.type),
    image_list: Array.isArray(rawImageList)
      ? rawImageList.map(String)
      : undefined,
    need_open_comment: normalizeOptionalBoolean(data.need_open_comment),
    only_fans_can_comment: normalizeOptionalBoolean(data.only_fans_can_comment),
  }
}

/**
 * 归一化可选字符串；`value` 是任意 frontmatter 字段值。
 */
function normalizeOptionalString(value: unknown): string | undefined {
  // 字符串字段，保存去除前后空白后的值。
  const normalizedValue = typeof value === 'string' ? value.trim() : undefined

  return normalizedValue || undefined
}

/**
 * 归一化可选布尔值；`value` 是任意 frontmatter 字段值。
 */
function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  // 业务场景：YAML 解析出的布尔值可直接使用，字符串值则兼容常见表单输入。
  if (typeof value === 'boolean') {
    return value
  }

  // 字符串布尔值，保存兼容用户手写 frontmatter 的结果。
  const stringValue =
    typeof value === 'string' ? value.trim().toLowerCase() : ''

  // 业务场景：用户可能从环境变量或表单复制出字符串 true/false。
  if (stringValue === 'true') {
    return true
  }

  // 业务场景：用户可能显式关闭评论能力。
  if (stringValue === 'false') {
    return false
  }

  return undefined
}

/**
 * 解析文章标题；`article` 是已解析的文章内容。
 */
function resolveTitle(article: ParsedArticle): string {
  return article.metadata.title?.trim() || '未命名文章'
}

/**
 * 判断是否为图片消息；`article` 是文章内容，`imageList` 是已解析图片列表。
 */
function isImageArticle(article: ParsedArticle, imageList: string[]): boolean {
  return (
    article.metadata.type === 'image' ||
    (imageList.length > 0 && Boolean(article.metadata.image_list))
  )
}

/**
 * 解析图片列表；`article` 是已解析的文章内容。
 */
function resolveImageList(article: ParsedArticle): string[] {
  // frontmatter 图片列表，保存用户显式指定的小绿书图片。
  const metadataImages = article.metadata.image_list ?? []

  // 业务场景：显式 image_list 优先，避免正文插图意外改变用户指定顺序。
  if (metadataImages.length > 0) {
    return metadataImages
  }

  // 业务场景：type:image 参考 WenYan CLI，可自动从正文提取图片。
  if (article.metadata.type === 'image') {
    return extractMarkdownImages(article.body)
  }

  return []
}

/**
 * 提取 Markdown 图片路径；`body` 是 Markdown 正文。
 */
function extractMarkdownImages(body: string): string[] {
  // Markdown 图片正则，保存 `![](...)` 里的路径捕获规则。
  const markdownImagePattern = /!\[[^\]]*]\(([^)]+)\)/g
  // 图片路径列表，保存从正文中提取出的本地路径或 URL。
  const images: string[] = []
  // 正则匹配结果，保存循环中当前命中的图片语法。
  let match: RegExpExecArray | null = markdownImagePattern.exec(body)

  while (match) {
    images.push(match[1].trim())
    match = markdownImagePattern.exec(body)
  }

  return images
}

/**
 * 移除 Markdown 图片语法；`body` 是 Markdown 正文。
 */
function stripMarkdownImages(body: string): string {
  // Markdown 图片正则，保存需要从图片消息正文中移除的图片语法。
  const markdownImagePattern = /!\[[^\]]*]\(([^)]+)\)/g

  return body.replace(markdownImagePattern, '').trim()
}

/**
 * 渲染 Markdown 为 HTML；`body` 是 Markdown 正文。
 */
function renderMarkdownToHtml(body: string): string {
  // HTML 内容，保存 marked 渲染出的公众号预览内容。
  const html = marked.parse(body, { async: false }) as string

  return html.trim()
}
