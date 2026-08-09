/** Visual Muse 功能工作台中的页面标识。 */
export type StudioPage =
  | 'article'
  | 'dashboard'
  | 'image-text'
  | 'themes'
  | 'skills'
  | 'assistant'
  | 'automation'
  | 'trends'
  | 'accounts'
  | 'assets'
  | 'analytics'
  | 'settings'
  | 'guide'

/** 图文内容的拆卡方式。 */
export type CardSplitMode = 'single' | 'automatic' | 'manual'

/** 工作区文稿；记录正文、目录归属和历史版本。 */
export interface StudioDocument {
  /** 文稿唯一标识。 */
  id: string
  /** 文稿标题。 */
  title: string
  /** 文稿所在文件夹标识，空值表示根目录。 */
  folderId: string | null
  /** Markdown 正文。 */
  content: string
  /** 最近更新时间。 */
  updatedAt: string
  /** 文稿历史版本，最新版本位于数组开头。 */
  versions: StudioDocumentVersion[]
  /** 可选的本地 Markdown 文件路径，仅由用户绑定目录后产生。 */
  filePath?: string
}

/** 文稿历史版本；用于恢复此前保存的正文。 */
export interface StudioDocumentVersion {
  /** 历史版本唯一标识。 */
  id: string
  /** 历史版本 Markdown 正文。 */
  content: string
  /** 历史版本创建时间。 */
  createdAt: string
}

/** 文稿文件夹；用于组织本地内容树。 */
export interface StudioFolder {
  /** 文件夹唯一标识。 */
  id: string
  /** 文件夹显示名称。 */
  name: string
}

/** 排版主题；文章与图文主题使用同一份可管理元数据。 */
export interface StudioTheme {
  /** 主题唯一标识。 */
  id: string
  /** 主题显示名称。 */
  name: string
  /** 主题适用类型。 */
  kind: 'article' | 'image-text'
  /** 主题主要颜色。 */
  accent: string
  /** 主题背景颜色。 */
  background: string
  /** 主题正文颜色。 */
  foreground: string
  /** 是否为用户创建的个人主题。 */
  personal: boolean
  /** 是否已收藏到我的主题。 */
  favorite: boolean
}

/** 写作 Skill；保存可复用提示词与分类。 */
export interface StudioSkill {
  /** Skill 唯一标识。 */
  id: string
  /** Skill 名称。 */
  name: string
  /** Skill 分类。 */
  category: string
  /** SKILL.md 提示词正文。 */
  prompt: string
  /** 是否为用户导入或创建的个人 Skill。 */
  personal: boolean
  /** 是否已收藏到我的模板。 */
  favorite: boolean
}

/** 自动任务；描述 Skill、模型、输入与发布平台组成的流水线。 */
export interface StudioAutomation {
  /** 自动任务唯一标识。 */
  id: string
  /** 自动任务名称。 */
  name: string
  /** 任务使用的 Skill 标识。 */
  skillId: string
  /** 任务使用的模型标识。 */
  modelId: string
  /** 任务生成结果的目标平台。 */
  platformId: string
  /** 最近一次运行时间。 */
  lastRunAt: string | null
  /** 最近一次运行状态。 */
  status: 'idle' | 'running' | 'success' | 'failed'
}

/** 发布活动；用于活动日志和数据统计。 */
export interface StudioPublishActivity {
  /** 发布活动唯一标识。 */
  id: string
  /** 发布文稿标题。 */
  title: string
  /** 发布目标平台标识。 */
  platformId: string
  /** 发布结果。 */
  status: 'draft' | 'success' | 'failed'
  /** 发布发生时间。 */
  createdAt: string
  /** 失败原因或成功说明。 */
  message: string
}

/** 素材条目；用于封面、标签和导出卡片归档。 */
export interface StudioAsset {
  /** 素材唯一标识。 */
  id: string
  /** 素材名称。 */
  name: string
  /** 素材类型。 */
  kind: 'cover' | 'tag' | 'card'
  /** 文件路径或标签文本。 */
  value: string
  /** 可选的平台标识。 */
  platformId: string | null
  /** 可选的账号标识。 */
  accountId: string | null
}

/** 写作模型配置；密钥只由本地状态保存。 */
export interface StudioModel {
  /** 模型配置唯一标识。 */
  id: string
  /** 模型显示名称。 */
  name: string
  /** OpenAI 兼容接口地址。 */
  baseUrl: string
  /** 模型服务标识。 */
  model: string
  /** 模型 API Key。 */
  apiKey: string
  /** 模型连接模式。 */
  mode: 'api' | 'webview'
}

/** 平台账号槽位；每个槽位使用独立 Electron 持久会话。 */
export interface StudioAccount {
  /** 账号槽位唯一标识。 */
  id: string
  /** 平台标识。 */
  platformId: string
  /** 用户自定义账号名称。 */
  name: string
}

/** 功能工作台持久化状态。 */
export interface StudioState {
  /** 当前文稿标识。 */
  activeDocumentId: string
  /** 文稿文件夹列表。 */
  folders: StudioFolder[]
  /** 文稿列表。 */
  documents: StudioDocument[]
  /** 主题列表。 */
  themes: StudioTheme[]
  /** Skill 列表。 */
  skills: StudioSkill[]
  /** 自动任务列表。 */
  automations: StudioAutomation[]
  /** 发布活动列表。 */
  activities: StudioPublishActivity[]
  /** 素材列表。 */
  assets: StudioAsset[]
  /** 写作模型列表。 */
  models: StudioModel[]
  /** 平台多账号槽位列表。 */
  accounts: StudioAccount[]
  /** 默认文章主题标识。 */
  defaultArticleThemeId: string
  /** 默认图文主题标识。 */
  defaultImageThemeId: string
  /** 图文拆卡模式。 */
  cardSplitMode: CardSplitMode
  /** 用户显式绑定的本地内容目录；空值表示未启用双向同步。 */
  boundFolderPath: string | null
}

/** 自动拆卡的目标字符数；用于避免单张卡片内容过长。 */
const automaticCardCharacterLimit = 180

/** 工作区历史版本最大保留数量。 */
export const maximumDocumentVersionCount = 20

/** 默认文章主题；提供可直接使用的原创基础排版。 */
const defaultArticleThemes: StudioTheme[] = [
  {
    id: 'article-editorial',
    name: '编辑手记',
    kind: 'article',
    accent: '#2f6f61',
    background: '#ffffff',
    foreground: '#202322',
    personal: false,
    favorite: true,
  },
  {
    id: 'article-mono',
    name: '黑白简报',
    kind: 'article',
    accent: '#202020',
    background: '#ffffff',
    foreground: '#181818',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-redline',
    name: '红线评论',
    kind: 'article',
    accent: '#b73b35',
    background: '#fffdfb',
    foreground: '#2a2422',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-ocean',
    name: '海盐研究',
    kind: 'article',
    accent: '#28667a',
    background: '#fbfeff',
    foreground: '#203137',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-violet',
    name: '紫墨随笔',
    kind: 'article',
    accent: '#66558a',
    background: '#fdfcff',
    foreground: '#292532',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-news',
    name: '城市日报',
    kind: 'article',
    accent: '#345b83',
    background: '#ffffff',
    foreground: '#20252a',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-warm',
    name: '暖光访谈',
    kind: 'article',
    accent: '#9a5d32',
    background: '#fffdfa',
    foreground: '#302821',
    personal: false,
    favorite: false,
  },
  {
    id: 'article-tech',
    name: '工程札记',
    kind: 'article',
    accent: '#3f6b52',
    background: '#fbfcfb',
    foreground: '#1f2722',
    personal: false,
    favorite: false,
  },
]

/** 图文主题预设；每项依次为名称、强调色、背景色和正文色。 */
const imageThemePresets: Array<[string, string, string, string]> = [
  ['便签纸', '#306b5c', '#f7f5ee', '#202825'],
  ['终端记录', '#6dd6a8', '#171a19', '#eef6f2'],
  ['编辑画报', '#bd3c31', '#fffdf8', '#22201e'],
  ['晨间清单', '#37688a', '#f5f9fc', '#1d2d38'],
  ['柠檬备忘', '#8a761c', '#fffdea', '#302d1d'],
  ['蓝图纸', '#75b9df', '#132735', '#eaf7ff'],
  ['红白简报', '#b52f37', '#fffafa', '#2c2021'],
  ['森林卡片', '#3f7553', '#edf7f0', '#203128'],
  ['紫色索引', '#725e9b', '#f7f3ff', '#2e2938'],
  ['像素便笺', '#3479a8', '#f4f7f8', '#1e292f'],
  ['胶片注释', '#a15b35', '#f6efe7', '#2d251f'],
  ['白板会议', '#236997', '#ffffff', '#23282c'],
  ['夜间电台', '#d28558', '#191716', '#f6eee9'],
  ['研究档案', '#496974', '#f2f6f7', '#212b2e'],
  ['春日记录', '#5a8b62', '#f6fbf4', '#253127'],
  ['海边来信', '#347e9b', '#f3fbff', '#1d3038'],
  ['城市路牌', '#d6a21e', '#22262a', '#f5f4ef'],
  ['编辑批注', '#a4383c', '#fffdfc', '#292222'],
  ['网格笔记', '#596d80', '#f6f8fa', '#242a30'],
  ['产品快照', '#276d5b', '#f5faf8', '#1f2d29'],
  ['咖啡清单', '#8a6045', '#f9f5f0', '#302821'],
  ['深夜代码', '#72c49a', '#101614', '#e9f5ef'],
  ['晴空便签', '#3f81ac', '#eff8fd', '#22333d'],
  ['桃色手册', '#a95062', '#fff6f7', '#332328'],
  ['展览标签', '#5b55a3', '#faf9ff', '#29273a'],
  ['黑白目录', '#202020', '#ffffff', '#1c1c1c'],
  ['荧光重点', '#80a524', '#f8ffe8', '#253019'],
  ['数据卡片', '#2e7285', '#f4fafb', '#1f3035'],
  ['采访摘录', '#a15834', '#fff9f4', '#33261f'],
  ['旅行票根', '#2f7870', '#f2fbf8', '#1f302d'],
  ['雨天书页', '#526f88', '#f1f5f8', '#222c35'],
  ['石墨草稿', '#62676a', '#f4f4f3', '#252728'],
  ['番茄清单', '#b44636', '#fff7f4', '#342420'],
  ['薄荷卡片', '#37806d', '#effaf5', '#20322c'],
  ['黄昏剪报', '#9b663e', '#fbf4ec', '#322820'],
  ['蓝紫提要', '#5962a5', '#f5f5ff', '#292b3d'],
  ['年度复盘', '#3c6a57', '#f7f9f7', '#232b27'],
]

/** 默认图文主题；由原创预设生成 37 套可收藏和设为默认的卡片皮肤。 */
const defaultImageThemes: StudioTheme[] = imageThemePresets.map(
  ([name, accent, background, foreground], index) => ({
    id: index === 0 ? 'card-paper' : `card-theme-${index + 1}`,
    name,
    kind: 'image-text',
    accent,
    background,
    foreground,
    personal: false,
    favorite: index === 0,
  })
)

/** 默认 Skill；覆盖文章明确列出的常用写作动作。 */
const defaultSkills: StudioSkill[] = [
  {
    id: 'skill-natural',
    name: '去AI味',
    category: '润色',
    prompt:
      '先判断文本是否需要修改。保持事实、数据和原意，删除套话、客服腔、翻译腔和机械排比，输出终稿与简短修改报告。只处理简体中文。',
    personal: false,
    favorite: true,
  },
  {
    id: 'skill-wechat',
    name: '公众号改写',
    category: '公众号',
    prompt:
      '把输入整理成适合微信公众号阅读的文章：标题明确，开头直接说明问题，段落短，保留事实依据，结尾给出可执行结论。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-trend',
    name: '热点写作',
    category: '选题',
    prompt:
      '根据热点材料提炼事实、冲突和读者价值，先列信息缺口，再生成不夸大、不编造的文章提纲与初稿。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-plain',
    name: '说人话',
    category: '润色',
    prompt:
      '用具体、自然、易懂的中文改写输入，删除抽象口号和不必要术语，保留专业含义与关键数据。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-title',
    name: '标题打磨',
    category: '标题',
    prompt:
      '基于正文事实生成十个准确、克制、有信息量的标题，不使用震惊体，不虚构结果。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-outline',
    name: '长文提纲',
    category: '结构',
    prompt: '先梳理读者问题、证据和结论，再生成层级清楚且互不重复的长文提纲。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-xhs',
    name: '小红书图文',
    category: '小红书',
    prompt:
      '把材料整理为至少四张图文卡片，用独立行 --- 分隔，标题具体，段落短，最后给出三个不带井号的话题。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-weibo',
    name: '微博短帖',
    category: '微博',
    prompt:
      '将材料压缩为信息完整的微博短帖，先给结论，再给依据，不添加未经证实的信息。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-zhihu',
    name: '知乎回答',
    category: '知乎',
    prompt:
      '围绕问题直接作答，用事实、推理和边界条件展开，避免空泛开场与重复总结。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-interview',
    name: '访谈整理',
    category: '结构',
    prompt:
      '按主题整理访谈材料，区分受访者原意与编辑补充，保留关键细节和可核查说法。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-newsletter',
    name: '周报简报',
    category: '公众号',
    prompt:
      '把多条材料整理为可扫描的周报，每条包含事实、影响和下一步，避免夸张形容词。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-review',
    name: '产品评测',
    category: '评测',
    prompt:
      '从目标用户、核心任务、实际体验、优缺点和适用边界组织评测，明确事实来源。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-explain',
    name: '概念解释',
    category: '科普',
    prompt: '先用一句话解释概念，再给运行机制、具体例子、常见误区和适用边界。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-factcheck',
    name: '事实门检',
    category: '校对',
    prompt:
      '逐条识别事实性断言、来源缺口和不确定表达，只标记问题，不替作者编造证据。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-compress',
    name: '压缩篇幅',
    category: '润色',
    prompt:
      '在不丢失事实、数据、条件和结论的前提下压缩重复内容，保留原有语气。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-story',
    name: '案例叙事',
    category: '结构',
    prompt:
      '按背景、矛盾、选择、行动和结果组织真实案例，缺失细节用待确认标记，不得补写。',
    personal: false,
    favorite: false,
  },
  {
    id: 'skill-proofread',
    name: '发布校对',
    category: '校对',
    prompt:
      '检查错别字、标点、链接、标题层级、前后矛盾和敏感表述，输出问题清单与修订稿。',
    personal: false,
    favorite: false,
  },
]

/**
 * 创建本地唯一标识；`prefix` 表示业务对象类型。
 */
export function createStudioId(prefix: string): string {
  // 随机标识片段，保存浏览器环境可用的低冲突随机值。
  const randomPart = Math.random().toString(36).slice(2, 9)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
}

/**
 * 创建默认工作区；`markdown` 是现有编辑器首次迁移的文章正文。
 */
export function createDefaultStudioState(markdown: string): StudioState {
  // 创建时间，保存默认文稿的统一时间戳。
  const createdAt = new Date().toISOString()
  // 默认文稿标识，保存工作区首次打开的活动文稿。
  const documentId = createStudioId('document')

  return {
    activeDocumentId: documentId,
    folders: [{ id: 'folder-drafts', name: '我的文稿' }],
    documents: [
      {
        id: documentId,
        title: 'Visual Muse 深色工作台发布说明',
        folderId: 'folder-drafts',
        content: markdown,
        updatedAt: createdAt,
        versions: [],
      },
    ],
    themes: [...defaultArticleThemes, ...defaultImageThemes],
    skills: defaultSkills,
    automations: [],
    activities: [],
    assets: [
      {
        id: 'asset-tag-visual-muse',
        name: 'Visual Muse',
        kind: 'tag',
        value: 'Visual Muse',
        platformId: null,
        accountId: null,
      },
      {
        id: 'asset-tag-writing',
        name: '内容创作',
        kind: 'tag',
        value: '内容创作',
        platformId: null,
        accountId: null,
      },
    ],
    models: [],
    accounts: [],
    defaultArticleThemeId: 'article-editorial',
    defaultImageThemeId: 'card-paper',
    cardSplitMode: 'manual',
    boundFolderPath: null,
  }
}

/**
 * 迁移历史工作区；`value` 是磁盘未知 JSON，`markdown` 是缺省文稿正文。
 */
export function normalizeStudioState(
  value: unknown,
  markdown: string
): StudioState {
  // 默认工作区，保存缺失字段的安全回退值。
  const defaults = createDefaultStudioState(markdown)
  if (!value || typeof value !== 'object') return defaults
  // 历史字段，保存通过对象收窄后的旧工作区。
  const state = value as Partial<StudioState>
  return {
    ...defaults,
    ...state,
    folders: Array.isArray(state.folders) ? state.folders : defaults.folders,
    documents:
      Array.isArray(state.documents) && state.documents.length > 0
        ? state.documents
        : defaults.documents,
    themes: Array.isArray(state.themes) ? state.themes : defaults.themes,
    skills: Array.isArray(state.skills) ? state.skills : defaults.skills,
    automations: Array.isArray(state.automations) ? state.automations : [],
    activities: Array.isArray(state.activities) ? state.activities : [],
    assets: Array.isArray(state.assets) ? state.assets : defaults.assets,
    models: Array.isArray(state.models) ? state.models : [],
    accounts: Array.isArray(state.accounts) ? state.accounts : [],
  }
}

/**
 * 将 Markdown 拆为图文卡片；`markdown` 是正文，`mode` 是拆卡方式。
 */
export function splitMarkdownCards(
  markdown: string,
  mode: CardSplitMode
): string[] {
  // 清理后的正文，保存移除首尾空白的 Markdown。
  const normalizedMarkdown = markdown.trim()

  if (!normalizedMarkdown) return []
  if (mode === 'single') return [normalizedMarkdown]
  if (mode === 'manual') {
    return normalizedMarkdown
      .split(/^\s*---\s*$/m)
      .map((card) => card.trim())
      .filter(Boolean)
  }

  // Markdown 段落，保存自动拆卡时不可再细分的内容块。
  const paragraphs = normalizedMarkdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  // 卡片列表，保存按目标长度合并后的内容。
  const cards: string[] = []
  // 当前卡片段落，保存尚未提交的内容块。
  let currentCard: string[] = []
  // 当前卡片字符数，保存加入下一段前的长度。
  let currentLength = 0

  paragraphs.forEach((paragraph) => {
    // 业务场景：加入下一段会超过目标长度时先提交已有卡片，避免拆断段落语义。
    if (
      currentCard.length > 0 &&
      currentLength + paragraph.length > automaticCardCharacterLimit
    ) {
      cards.push(currentCard.join('\n\n'))
      currentCard = []
      currentLength = 0
    }
    currentCard.push(paragraph)
    currentLength += paragraph.length
  })

  if (currentCard.length > 0) cards.push(currentCard.join('\n\n'))
  return cards
}

/**
 * 计算指定时间范围内的发布统计；`activities` 是活动记录，`days` 是回溯天数，空值表示全部。
 */
export function summarizeActivities(
  activities: StudioPublishActivity[],
  days: number | null
) {
  // 时间范围起点，保存需要纳入统计的最早时间。
  const startTime = days === null ? 0 : Date.now() - days * 24 * 60 * 60 * 1000
  // 范围内活动，保存满足时间条件的发布记录。
  const scopedActivities = activities.filter(
    (activity) => new Date(activity.createdAt).getTime() >= startTime
  )

  return {
    total: scopedActivities.length,
    success: scopedActivities.filter(
      (activity) => activity.status === 'success'
    ).length,
    draft: scopedActivities.filter((activity) => activity.status === 'draft')
      .length,
    failed: scopedActivities.filter((activity) => activity.status === 'failed')
      .length,
  }
}
