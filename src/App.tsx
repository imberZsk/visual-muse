import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Divider,
  Form,
  Input,
  message,
  Skeleton,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  theme,
  type CollapseProps,
} from 'antd'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Code2,
  FileText,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  Moon,
  Newspaper,
  PenLine,
  RotateCcw,
  Send,
  Server,
  Settings,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  ChartNoAxesCombined,
  Flame,
  HelpCircle,
  Images,
  ImagePlus,
  LayoutDashboard,
  Library,
  Palette,
  PanelTop,
  Sigma,
  Sparkles,
  Sun,
  Users,
  WandSparkles,
  Workflow,
} from 'lucide-react'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  buildDistributionPlan,
  distributionPlatformIds,
  type DistributionPlatformId,
} from './domain/distribution'
import {
  buildWechatDraftPayload,
  parseArticleMarkdown,
  publishingPlatforms,
  resolveArticleTitle,
  validatePublishTarget,
  type ParsedArticle,
  type PlatformId,
  type PublishPlatform,
  type PublishValidation,
  type WechatDraftPayload,
} from './domain/publisher'
import type { StudioAccount, StudioPage as StudioPageId } from './domain/studio'
import DocumentManager from './features/DocumentManager'
import StudioPage from './features/StudioPage'
import './styles.css'

type ThemeMode = 'dark' | 'light'
type RealPublishPlatformId = DistributionPlatformId

/** 文章编辑区视图模式。 */
type EditorViewMode = 'split' | 'edit' | 'preview'

/** 右侧发布工作区视图，用于区分批量分发与当前平台设置。 */
type PublishPanelView = 'distribution' | 'platform'

/** 单个平台草稿准备任务状态。 */
type DistributionTaskStatus =
  | 'idle'
  | 'preparing'
  | 'prepared'
  | 'saved'
  | 'login-required'
  | 'not-ready'
  | 'failed'

/** 单个平台草稿准备任务结果。 */
interface DistributionTaskState {
  /** 当前草稿准备状态。 */
  status: DistributionTaskStatus
  /** 平台返回或本地生成的任务说明。 */
  message: string
}

interface PublisherSettings {
  /** 微信公众号 AppID，用于后续接入真实公众号发布。 */
  appId: string
  /** 微信公众号 AppSecret，用于后续换取 AccessToken。 */
  appSecret: string
  /** WenYan Server 地址，用于远程发布模式。 */
  serverUrl: string
  /** WenYan Server API Key，用于远程发布鉴权。 */
  apiKey: string
  /** 代理地址，用于本地 API 请求代理。 */
  proxyUrl: string
  /** 默认排版主题。 */
  defaultTheme: string
}

interface VisualMuseState {
  /** 当前界面主题模式。 */
  themeMode: ThemeMode
  /** 发布相关配置。 */
  settings: PublisherSettings
}

interface PlatformIconProps {
  /** 需要渲染图标的平台标识。 */
  platformId: PlatformId
}

interface PreviewPanelProps {
  /** 当前选中的发布平台。 */
  platform: PublishPlatform
  /** 当前文章解析结果。 */
  article: ParsedArticle
  /** 当前公众号载荷。 */
  wechatPayload: WechatDraftPayload
}

interface ContentPlatformOptions {
  /** 平台文章分类，用于发布前记录目标内容频道。 */
  category: string
  /** 平台文章标签，用逗号分隔。 */
  tags: string
  /** 平台文章摘要，用于复制到平台发布表单。 */
  summary: string
}

/** 本地状态存储键，用于浏览器预览和测试环境降级持久化。 */
const browserStateKey = 'visual-muse-state'

/** 自动保存延迟毫秒数，用于合并用户连续输入产生的磁盘写入。 */
const autoSaveDelayMs = 500

/** 应用字体栈，用于让 Ant Design 控件与三个桌面工作台的业务文本保持一致。 */
const appFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 功能导航项；在目标 UI 风格中提供内容工作台入口。 */
const studioNavigationItems: Array<{
  /** 功能页面标识。 */
  id: StudioPageId
  /** 功能页面名称。 */
  name: string
  /** 功能页面图标。 */
  icon: typeof LayoutDashboard
}> = [
  { id: 'dashboard', name: '工作台', icon: LayoutDashboard },
  { id: 'article', name: '文章编辑', icon: FileText },
  { id: 'image-text', name: '图文编辑', icon: Images },
  { id: 'themes', name: '主题模板', icon: Palette },
  { id: 'skills', name: 'Skill 模板', icon: Sparkles },
  { id: 'assistant', name: 'AI 助手', icon: WandSparkles },
  { id: 'automation', name: '自动任务', icon: Workflow },
  { id: 'trends', name: '灵感热榜', icon: Flame },
  { id: 'accounts', name: '账号模型', icon: Users },
  { id: 'assets', name: '素材库', icon: Library },
  { id: 'analytics', name: '发布数据', icon: ChartNoAxesCombined },
  { id: 'settings', name: '设置', icon: Settings },
  { id: 'guide', name: '使用指南', icon: HelpCircle },
]

/** 平台创作入口地址，用于 Web 预览环境降级打开官方发布页面。 */
const publisherUrlMap: Record<PlatformId, string> = {
  wechat: 'https://mp.weixin.qq.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  zhihu: 'https://www.zhihu.com/creator',
  toutiao: 'https://mp.toutiao.com/',
  juejin: 'https://juejin.cn/editor/drafts/new?v=2',
  csdn: 'https://editor.csdn.net/md/',
  medium: 'https://medium.com/new-story',
  weibo: 'https://weibo.com/',
  bilibili: 'https://member.bilibili.com/platform/upload/text/edit',
  yuque: 'https://www.yuque.com/dashboard',
  baijiahao: 'https://baijiahao.baidu.com/',
}

/** 已接入持久平台会话填充的首批真实发布平台。 */
const realPublishPlatformIds: RealPublishPlatformId[] = [
  ...distributionPlatformIds,
]

/** 默认三平台目标选择，用于首次打开时直接准备全部真实平台。 */
const defaultDistributionTargets: Record<RealPublishPlatformId, boolean> = {
  xiaohongshu: true,
  juejin: true,
  wechat: true,
}

/** 默认三平台任务状态，用于批量准备前展示预检矩阵。 */
const defaultDistributionTasks: Record<
  RealPublishPlatformId,
  DistributionTaskState
> = {
  xiaohongshu: { status: 'idle', message: '' },
  juejin: { status: 'idle', message: '' },
  wechat: { status: 'idle', message: '' },
}

/** 草稿准备状态文案，用于三平台任务结果展示。 */
const distributionStatusLabelMap: Record<DistributionTaskStatus, string> = {
  idle: '待准备',
  preparing: '准备中',
  prepared: '已填入',
  saved: '已保存',
  'login-required': '需登录',
  'not-ready': '未就绪',
  failed: '失败',
}

/** 草稿准备状态颜色，用于区分成功、等待和异常任务。 */
const distributionStatusColorMap: Record<DistributionTaskStatus, string> = {
  idle: 'default',
  preparing: 'processing',
  prepared: 'success',
  saved: 'success',
  'login-required': 'warning',
  'not-ready': 'warning',
  failed: 'error',
}

/** 默认内容平台选项，用于初始化分类、标签和摘要。 */
const defaultContentOptions: ContentPlatformOptions = {
  category: '',
  tags: '',
  summary: '',
}

/** 默认示例文章，用于应用首次打开时展示可发布内容。 */
const defaultMarkdown = `---
title: Visual Muse 深色工作台发布说明
cover: https://example.com/cover.png
author: Visual Muse
source_url: https://example.com/source
need_open_comment: true
---

# Visual Muse 深色工作台

这是一篇用于预览和三平台草稿分发的 Markdown 文章。

## 发布目标

- 微信公众号图文草稿
- 小红书可读纯文本和掘金 Markdown 草稿
- 知乎、今日头条、CSDN 内容适配

> 在 Visual Muse 一次完成内容加工，再到官方平台核对并确认发布。`

/** 默认发布设置，用于初始化配置表单。 */
const defaultSettings: PublisherSettings = {
  appId: '',
  appSecret: '',
  serverUrl: '',
  apiKey: '',
  proxyUrl: '',
  defaultTheme: 'default',
}

/** 渲染接口配置折叠箭头；`panelProps` 提供当前面板是否展开的状态。 */
const renderCollapseIcon: NonNullable<CollapseProps['expandIcon']> = (
  panelProps
) => {
  // 折叠箭头组件，保存当前展开状态对应的 Lucide 图标。
  const CollapseIcon = panelProps.isActive ? ChevronDown : ChevronRight
  return <CollapseIcon aria-hidden="true" size={16} strokeWidth={1.8} />
}

/** 平台图标组件映射，用于保持导航图标风格一致。 */
const platformIconMap = {
  wechat: MessageSquareText,
  xiaohongshu: BookOpen,
  zhihu: PenLine,
  toutiao: Newspaper,
  juejin: Code2,
  csdn: FileText,
  medium: BookOpen,
  weibo: MessageSquareText,
  bilibili: Newspaper,
  yuque: BookOpen,
  baijiahao: FileText,
} satisfies Record<PlatformId, typeof MessageSquareText>

/** 判断平台是否支持持久会话填充；`platformId` 是当前平台标识。 */
function isRealPublishPlatform(
  platformId: PlatformId
): platformId is RealPublishPlatformId {
  return realPublishPlatformIds.includes(platformId as RealPublishPlatformId)
}

/** 判断平台任务是否完成当前自动化阶段；`status` 是主进程返回的真实任务状态。 */
function isSuccessfulPreparationStatus(
  status: DistributionTaskStatus
): boolean {
  return status === 'prepared' || status === 'saved'
}

/**
 * 渲染平台图标；`platformId` 表示当前要展示的目标平台。
 */
function PlatformIcon({ platformId }: PlatformIconProps) {
  // 平台图标组件，保存当前平台对应的 Lucide 图标。
  const IconComponent = platformIconMap[platformId]

  return <IconComponent aria-hidden="true" size={16} strokeWidth={1.8} />
}

/**
 * 读取浏览器降级状态；无参数，返回本地存储中的主题和发布配置。
 */
function readBrowserState(): VisualMuseState | null {
  // 本地存储原始字符串，保存上一次持久化的 JSON 状态。
  const rawState = window.localStorage.getItem(browserStateKey)

  // 业务场景：首次打开应用时没有历史状态，直接使用默认值。
  if (!rawState) {
    return null
  }

  try {
    return JSON.parse(rawState) as VisualMuseState
  } catch {
    return null
  }
}

/**
 * 写入浏览器降级状态；`state` 是需要保存的主题和发布配置。
 */
function writeBrowserState(state: VisualMuseState): void {
  window.localStorage.setItem(browserStateKey, JSON.stringify(state))
}

/**
 * 读取持久化状态；无参数，桌面环境优先使用 Electron preload API。
 */
async function loadPersistedState(): Promise<VisualMuseState | null> {
  // 桌面存储 API，保存 preload 暴露的安全 IPC 能力。
  const desktopStore = window.visualMuseStore

  // 业务场景：Electron 桌面端使用主进程 JSON 文件，Web 测试环境使用 localStorage。
  if (desktopStore) {
    return desktopStore.getState()
  }

  return readBrowserState()
}

/**
 * 保存持久化状态；`state` 是需要保存的主题和发布配置。
 */
async function savePersistedState(state: VisualMuseState): Promise<void> {
  // 桌面存储 API，保存 preload 暴露的安全 IPC 能力。
  const desktopStore = window.visualMuseStore

  // 业务场景：Electron 桌面端使用主进程 JSON 文件，Web 测试环境使用 localStorage。
  if (desktopStore) {
    await desktopStore.setState(state)
    return
  }

  writeBrowserState(state)
}

/**
 * 渲染预览面板；`platform` 是目标平台，`article` 是文章内容，`wechatPayload` 是公众号载荷。
 */
function PreviewPanel({ platform, article, wechatPayload }: PreviewPanelProps) {
  // HTML 预览内容，保存当前平台可视化展示所需的正文。
  const previewHtml = buildPreviewHtml(platform, article, wechatPayload)
  // 预览标题，保存 frontmatter 标题或正文首个一级标题。
  const previewTitle = resolveArticleTitle(article) || '未命名文章'

  return (
    <section className="preview-surface" aria-label="发布预览">
      <div className="panel-heading">
        <Space size={8}>
          <EyeIcon />
          <Typography.Text strong>发布预览</Typography.Text>
        </Space>
        <Tag className="neutral-tag">
          {platform.id === 'wechat'
            ? wechatPayload.kind === 'image'
              ? '图片消息'
              : '图文草稿'
            : '平台预览'}
        </Tag>
      </div>
      <div className="preview-document">
        <Typography.Title level={2}>{previewTitle}</Typography.Title>
        <Typography.Text type="secondary">
          {article.metadata.author || '未设置作者'}
        </Typography.Text>
        <Divider />
        <div
          className="article-preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </section>
  )
}

/**
 * 渲染预览标题图标；无参数，用于避免直接使用没有语义标签的装饰图形。
 */
function EyeIcon() {
  return <WandSparkles aria-hidden="true" size={16} strokeWidth={1.8} />
}

/**
 * 构建平台预览 HTML；`platform` 是目标平台，`article` 是文章，`wechatPayload` 是公众号载荷。
 */
function buildPreviewHtml(
  platform: PublishPlatform,
  article: ParsedArticle,
  wechatPayload: WechatDraftPayload
): string {
  // 业务场景：微信公众号普通图文直接展示将要提交的 HTML 内容。
  if (platform.id === 'wechat' && wechatPayload.kind === 'article') {
    return wechatPayload.articles[0].content
  }

  // 业务场景：微信公众号图片消息以图片路径列表和描述为主体，不渲染为普通图文。
  if (platform.id === 'wechat' && wechatPayload.kind === 'image') {
    return `<p>${escapeHtml(wechatPayload.content || '图片消息正文为空')}</p><ul>${wechatPayload.image_list
      .map((imagePath) => `<li>${escapeHtml(imagePath)}</li>`)
      .join('')}</ul>`
  }

  return `<pre>${escapeHtml(article.body)}</pre>`
}

/**
 * 转义 HTML 文本；`value` 是需要安全展示的原始字符串。
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/**
 * Visual Muse 根组件；无参数，负责组装编辑、预览、平台和发布状态。
 */
export default function App() {
  // 全局消息 API，保存复制和打开平台后的非阻断反馈能力。
  const [messageApi, messageContextHolder] = message.useMessage()
  // 当前功能页面，保存左侧工作台导航的选中项。
  const [studioPage, setStudioPage] = useState<StudioPageId>('article')
  // 文章视图模式，保存分栏、纯编辑或纯预览状态。
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>('split')
  // 当前主题模式，保存深色或浅色状态。
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  // 当前选中平台，保存平台导航的 active 项。
  const [selectedPlatformId, setSelectedPlatformId] =
    useState<PlatformId>('wechat')
  // 右侧发布工作区视图，默认先展示可直接执行的三平台分发任务。
  const [publishPanelView, setPublishPanelView] =
    useState<PublishPanelView>('distribution')
  // Markdown 编辑内容，保存用户正在编辑的文章。
  const [markdown, setMarkdown] = useState(defaultMarkdown)
  // 发布配置，保存公众号凭据、Server 和主题偏好。
  const [settingsState, setSettingsState] =
    useState<PublisherSettings>(defaultSettings)
  // 预检结果，保存最近一次发布预检的错误和警告。
  const [validation, setValidation] = useState<PublishValidation | null>(null)
  // 初始化状态，保存持久化配置是否已经读取完成。
  const [isHydrated, setIsHydrated] = useState(false)
  // 自动保存状态，保存配置是否正在写入本地存储。
  const [isSaving, setIsSaving] = useState(false)
  // 单平台准备状态，保存当前是否正在填入一个官方编辑器。
  const [isPreparing, setIsPreparing] = useState(false)
  // 批量准备状态，保存三平台分发任务是否正在依次执行。
  const [isBatchPreparing, setIsBatchPreparing] = useState(false)
  // 草稿同步状态，保存平台适配器是否正在执行。
  const [isSyncingDraft, setIsSyncingDraft] = useState(false)
  // 草稿同步反馈，保存适配器返回的可操作说明。
  const [draftSyncStatus, setDraftSyncStatus] = useState<{
    success: boolean
    message: string
  } | null>(null)
  // 发布账号列表，保存当前平台可使用的持久账号槽位。
  const [publisherAccounts, setPublisherAccounts] = useState<StudioAccount[]>(
    []
  )
  // 当前账号标识，保存草稿同步要使用的独立会话。
  const [selectedPublisherAccountId, setSelectedPublisherAccountId] =
    useState<string>()
  // 分发目标选择，保存本次批量准备需要处理的平台集合。
  const [distributionTargets, setDistributionTargets] = useState<
    Record<RealPublishPlatformId, boolean>
  >({ ...defaultDistributionTargets })
  // 三平台任务状态，保存各平台最近一次真实准备结果。
  const [distributionTasks, setDistributionTasks] = useState<
    Record<RealPublishPlatformId, DistributionTaskState>
  >({ ...defaultDistributionTasks })
  // 快捷操作状态，保存当前正在执行的复制或打开平台动作。
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(
    null
  )
  // 新版本号，保存自动检查发现的 GitHub Release 版本。
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  // 更新下载状态，控制按钮异步 loading。
  const [isUpdateDownloading, setIsUpdateDownloading] = useState(false)
  // 更新就绪状态，标记安装包已完整下载。
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false)
  // 内容平台选项，保存各平台独立的分类、标签和摘要输入。
  const [contentOptions, setContentOptions] = useState<
    Record<PlatformId, ContentPlatformOptions>
  >(
    () =>
      Object.fromEntries(
        publishingPlatforms.map((platform) => [
          platform.id,
          { ...defaultContentOptions },
        ])
      ) as Record<PlatformId, ContentPlatformOptions>
  )

  // 当前平台对象，保存由平台 ID 找到的完整平台定义。
  const selectedPlatform = useMemo(
    () =>
      publishingPlatforms.find(
        (platform) => platform.id === selectedPlatformId
      ) ?? publishingPlatforms[0],
    [selectedPlatformId]
  )
  // 当前文章解析结果，保存 frontmatter 和正文。
  const parsedArticle = useMemo(
    () => parseArticleMarkdown(markdown),
    [markdown]
  )
  // 当前文章标题，保存 frontmatter 标题或正文首个一级标题的统一解析结果。
  const articleTitle = useMemo(
    () => resolveArticleTitle(parsedArticle),
    [parsedArticle]
  )
  // 当前公众号载荷，保存普通图文或图片消息的提交结构。
  const wechatPayload = useMemo(
    () => buildWechatDraftPayload(parsedArticle),
    [parsedArticle]
  )
  // 三平台分发计划，保存同一源文章生成的纯文本、Markdown 和富文本变体。
  const distributionPlan = useMemo(
    () =>
      buildDistributionPlan(parsedArticle, {
        xiaohongshu: contentOptions.xiaohongshu,
        juejin: contentOptions.juejin,
        wechat: contentOptions.wechat,
      }),
    [contentOptions, parsedArticle]
  )
  // 已选择平台数量，保存批量准备按钮的目标计数。
  const selectedDistributionCount = distributionPlatformIds.filter(
    (platformId) => distributionTargets[platformId]
  ).length
  // Ant Design 主题算法，保存深浅主题对应的 token 计算方式。
  const antThemeAlgorithm =
    themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
  // Ant Design 主题 token，保存界面主色、圆角和字体。
  const antThemeTokens = {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    controlHeight: 32,
    fontFamily: appFontFamily,
  }

  useEffect(() => {
    if (studioPage !== 'article') return
    // 组件挂载标记，避免异步账号读取完成后更新已卸载页面。
    let isMounted = true
    void window.visualMuseWorkspace?.getState().then((state) => {
      if (!isMounted) return
      // 平台账号，保存与当前发布目标匹配的槽位。
      const platformAccounts =
        state?.accounts.filter(
          (account) => account.platformId === selectedPlatformId
        ) ?? []
      setPublisherAccounts(platformAccounts)
      setSelectedPublisherAccountId((currentId) =>
        platformAccounts.some((account) => account.id === currentId)
          ? currentId
          : platformAccounts[0]?.id
      )
    })
    /** 清理账号读取副作用。 */
    return () => {
      isMounted = false
    }
  }, [selectedPlatformId, studioPage])

  useEffect(() => {
    // 组件挂载标记，避免异步检查结束后更新已卸载组件。
    let isMounted = true
    void window.visualMuseDesktop
      ?.checkAppUpdate?.()
      .then((result) => {
        if (isMounted && result.available && result.version) {
          setUpdateVersion(result.version)
          setIsUpdateDownloaded(Boolean(result.downloaded))
        }
      })
      .catch(() => undefined)
    /** 清理自动更新检查副作用。 */
    return () => {
      isMounted = false
    }
  }, [])

  /** 下载或安装应用更新，下载完整前不允许安装。 */
  const handleAppUpdate = async (): Promise<void> => {
    // 桌面 API，保存 preload 暴露的更新能力。
    const desktopApi = window.visualMuseDesktop
    if (!desktopApi?.downloadAppUpdate || !desktopApi.installAppUpdate) return
    if (isUpdateDownloaded) {
      await desktopApi.installAppUpdate()
      return
    }
    setIsUpdateDownloading(true)
    try {
      await desktopApi.downloadAppUpdate()
      setIsUpdateDownloaded(true)
      messageApi.success('更新已下载，可以安装')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '更新下载失败')
    } finally {
      setIsUpdateDownloading(false)
    }
  }

  useEffect(() => {
    // 组件挂载标记，保存异步加载期间组件是否仍然存在。
    let isMounted = true

    void loadPersistedState()
      .then((persistedState) => {
        // 业务场景：组件卸载后不再更新界面，避免异步状态泄漏。
        if (!isMounted) {
          return
        }

        // 业务场景：存在历史状态时恢复用户主题和平台配置。
        if (persistedState) {
          setThemeMode(persistedState.themeMode)
          setSettingsState({ ...defaultSettings, ...persistedState.settings })
        }
      })
      .finally(() => {
        // 业务场景：只有仍挂载的界面才能结束启动状态。
        if (isMounted) {
          setIsHydrated(true)
        }
      })

    /**
     * 清理持久化加载副作用；无参数，用于避免卸载后更新状态。
     */
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    // 业务场景：持久化读取完成前禁止保存，避免默认值覆盖用户已有配置。
    if (!isHydrated) {
      return undefined
    }

    // 待保存状态，保存主题和发布配置的最新值。
    const nextState: VisualMuseState = {
      themeMode,
      settings: settingsState,
    }

    // 自动保存定时器，保存合并连续配置修改所需的延迟任务。
    const saveTimer = window.setTimeout(() => {
      setIsSaving(true)
      void savePersistedState(nextState).finally(() => setIsSaving(false))
    }, autoSaveDelayMs)

    /** 清理自动保存任务；无参数，用于配置再次变化时取消旧写入。 */
    return () => window.clearTimeout(saveTimer)
  }, [isHydrated, settingsState, themeMode])

  /**
   * 切换主题；`checked` 表示是否启用浅色主题。
   */
  const handleThemeChange = (checked: boolean): void => {
    setThemeMode(checked ? 'light' : 'dark')
  }

  /**
   * 切换目标平台；`platformId` 是用户准备查看和配置的平台标识。
   */
  const handlePlatformSelect = (platformId: PlatformId): void => {
    setSelectedPlatformId(platformId)
    setPublishPanelView('platform')
    // 业务场景：切换平台后旧预检结果不再对应当前目标，避免继续展示误导状态。
    setValidation(null)
  }

  /**
   * 切换右侧工作区；`value` 是分段控件返回的目标视图标识。
   */
  const handlePublishPanelViewChange = (value: string | number): void => {
    // 业务场景：Ant Design 允许 number 值，这里只接受产品定义的两个字符串视图。
    if (value === 'distribution' || value === 'platform') {
      setPublishPanelView(value)
    }
  }

  /**
   * 更新 Markdown；`event` 是文本域变更事件。
   */
  const handleMarkdownChange = (
    event: ChangeEvent<HTMLTextAreaElement>
  ): void => {
    setMarkdown(event.target.value)
    setValidation(null)
    // 业务场景：源文章变化后旧平台结果已不能代表当前内容，恢复待准备状态避免误判。
    setDistributionTasks({ ...defaultDistributionTasks })
  }

  /** 从功能页载入文章；`content` 是要继续编辑的 Markdown。 */
  const handleOpenArticle = (content: string): void => {
    setMarkdown(content)
    setValidation(null)
    setStudioPage('article')
  }

  /** 在文章末尾插入结构化 Markdown；`snippet` 是要插入的模板。 */
  const insertMarkdownSnippet = (snippet: string): void => {
    setMarkdown(
      (currentMarkdown) => `${currentMarkdown.trimEnd()}\n\n${snippet}\n`
    )
    setValidation(null)
    setDistributionTasks({ ...defaultDistributionTasks })
  }

  /** 同步当前文章到平台草稿箱。 */
  const handleSyncDraft = async (): Promise<void> => {
    const nextValidation = validatePublishTarget(
      selectedPlatform,
      parsedArticle
    )
    setValidation(nextValidation)
    setDraftSyncStatus(null)
    if (!nextValidation.ok) return
    if (!window.visualMuseWorkspace?.syncDraft) {
      setDraftSyncStatus({
        success: false,
        message: '草稿同步仅在桌面应用中可用',
      })
      return
    }
    setIsSyncingDraft(true)
    try {
      // 发布账号，优先使用选中槽位，异步初始化期间回退到第一个账号。
      const publisherAccount =
        publisherAccounts.find(
          (account) => account.id === selectedPublisherAccountId
        ) ?? publisherAccounts[0]
      const result = await window.visualMuseWorkspace.syncDraft({
        platformId: selectedPlatformId,
        title: articleTitle || '未命名文章',
        markdown: parsedArticle.body,
        mode:
          selectedPlatformId === 'wechat' &&
          settingsState.appId &&
          settingsState.appSecret
            ? 'api'
            : 'ui',
        appId: settingsState.appId,
        appSecret: settingsState.appSecret,
        cover: parsedArticle.metadata.cover,
        author: parsedArticle.metadata.author,
        sourceUrl: parsedArticle.metadata.source_url,
        needOpenComment: parsedArticle.metadata.need_open_comment,
        onlyFansCanComment: parsedArticle.metadata.only_fans_can_comment,
        accountId: publisherAccount?.id,
      })
      setDraftSyncStatus({ success: result.success, message: result.message })
    } catch (error) {
      setDraftSyncStatus({
        success: false,
        message: error instanceof Error ? error.message : '草稿同步失败',
      })
    } finally {
      setIsSyncingDraft(false)
    }
  }

  /**
   * 更新发布配置字段；`field` 是配置键，`value` 是表单输入值。
   */
  const updateSetting = (
    field: keyof PublisherSettings,
    value: string
  ): void => {
    setSettingsState((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }))
  }

  /**
   * 执行发布预检；无参数，基于当前平台和文章生成校验结果。
   */
  const handlePreflight = (): void => {
    // 预检结果，保存当前平台对文章的校验反馈。
    const nextValidation = isRealPublishPlatform(selectedPlatformId)
      ? (distributionPlan.find(
          (variant) => variant.platformId === selectedPlatformId
        )?.validation ?? validatePublishTarget(selectedPlatform, parsedArticle))
      : validatePublishTarget(selectedPlatform, parsedArticle)

    setValidation(nextValidation)
  }

  /**
   * 更新单个平台任务状态；`platformId` 是目标平台，`nextTask` 是最新结果。
   */
  const updateDistributionTask = (
    platformId: RealPublishPlatformId,
    nextTask: DistributionTaskState
  ): void => {
    setDistributionTasks((currentTasks) => ({
      ...currentTasks,
      [platformId]: nextTask,
    }))
  }

  /**
   * 准备单个平台草稿；`platformId` 是目标平台，返回真实编辑器的任务结果。
   */
  const prepareDistributionPlatform = async (
    platformId: RealPublishPlatformId
  ): Promise<DistributionTaskState> => {
    // 平台内容变体，保存当前平台最终提交的标题、正文格式和选项。
    const variant = distributionPlan.find(
      (planVariant) => planVariant.platformId === platformId
    )
    if (!variant) {
      // 缺失变体结果，保存不可继续执行的内部状态异常。
      const missingVariantTask: DistributionTaskState = {
        status: 'failed',
        message: '未生成平台内容变体',
      }
      updateDistributionTask(platformId, missingVariantTask)
      return missingVariantTask
    }

    // 业务场景：标题等阻断项未通过时不打开平台，避免生成不可识别的空草稿。
    if (!variant.validation.ok) {
      // 预检失败结果，保存阻止平台准备的具体原因。
      const invalidTask: DistributionTaskState = {
        status: 'not-ready',
        message: variant.validation.errors.join('；'),
      }
      updateDistributionTask(platformId, invalidTask)
      return invalidTask
    }

    updateDistributionTask(platformId, {
      status: 'preparing',
      message: '正在打开平台编辑器',
    })
    try {
      // 桌面发布 API，保存 preload 暴露的持久会话填充能力。
      const preparePublisher = window.visualMuseDesktop?.preparePublisher
      if (preparePublisher) {
        // 平台准备结果，保存登录失效、填充完成或加载超时状态。
        const result = await preparePublisher({
          platformId,
          title: variant.title,
          markdown: variant.body,
          html: variant.html,
          category: variant.category,
          tags: variant.tags,
          summary: variant.summary,
        })
        // 平台任务结果，保存主进程返回的三种可处理状态。
        const completedTask: DistributionTaskState = {
          status: result.status,
          message: result.message,
        }
        updateDistributionTask(platformId, completedTask)
        return completedTask
      }

      // 业务场景：Web 预览无法控制平台页面，复制文章并打开官方入口作为明确降级。
      await navigator.clipboard.writeText(`${variant.title}\n\n${variant.body}`)
      window.open(publisherUrlMap[platformId], '_blank', 'noopener,noreferrer')
      // Web 降级结果，保存内容已复制但仍需用户粘贴的状态。
      const fallbackTask: DistributionTaskState = {
        status: 'prepared',
        message: '内容已复制并打开官方创作入口',
      }
      updateDistributionTask(platformId, fallbackTask)
      return fallbackTask
    } catch (error) {
      // 异常任务结果，保存可在分发矩阵中重试的错误信息。
      const failedTask: DistributionTaskState = {
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : '无法填入平台编辑器，请稍后重试',
      }
      updateDistributionTask(platformId, failedTask)
      return failedTask
    }
  }

  /**
   * 把当前文章填入选中的官方平台编辑器；无参数，复用平台适配后的内容变体。
   */
  const handlePreparePublisher = async (): Promise<void> => {
    if (!isRealPublishPlatform(selectedPlatformId)) return

    // 当前平台变体，保存单平台操作需要展示的完整预检结果。
    const variant = distributionPlan.find(
      (planVariant) => planVariant.platformId === selectedPlatformId
    )
    if (!variant) return
    setValidation(variant.validation)
    setIsPreparing(true)
    try {
      // 单平台任务结果，保存本次真实草稿准备状态。
      const task = await prepareDistributionPlatform(selectedPlatformId)
      if (isSuccessfulPreparationStatus(task.status)) {
        messageApi.success(task.message)
      } else {
        messageApi.warning(task.message)
      }
    } finally {
      setIsPreparing(false)
    }
  }

  /**
   * 依次准备已选择的三平台草稿；无参数，每个平台独立记录成功和失败状态。
   */
  const handleBatchPrepare = async (): Promise<void> => {
    // 目标平台列表，保存用户本次勾选且将要处理的平台。
    const targetPlatformIds = distributionPlatformIds.filter(
      (platformId) => distributionTargets[platformId]
    )
    if (targetPlatformIds.length === 0) {
      messageApi.warning('请至少选择一个分发平台')
      return
    }

    setIsBatchPreparing(true)
    // 成功数量，保存批量任务中已填入官方编辑器的平台数。
    let preparedCount = 0
    try {
      for (const platformId of targetPlatformIds) {
        // 平台任务结果，保存当前循环的真实草稿准备状态。
        const task = await prepareDistributionPlatform(platformId)
        if (isSuccessfulPreparationStatus(task.status)) preparedCount += 1
      }
      if (preparedCount === targetPlatformIds.length) {
        messageApi.success(`已准备 ${preparedCount} 个平台草稿`)
      } else {
        messageApi.warning(
          `已准备 ${preparedCount}/${targetPlatformIds.length} 个平台草稿，请处理异常项后重试`
        )
      }
    } finally {
      setIsBatchPreparing(false)
    }
  }

  /**
   * 重试单个平台草稿任务；`platformId` 是需要再次准备的平台。
   */
  const handleRetryDistribution = async (
    platformId: RealPublishPlatformId
  ): Promise<void> => {
    setIsPreparing(true)
    try {
      // 重试结果，保存单个平台再次准备后的最新状态。
      const task = await prepareDistributionPlatform(platformId)
      if (isSuccessfulPreparationStatus(task.status)) {
        messageApi.success(task.message)
      }
    } finally {
      setIsPreparing(false)
    }
  }

  /**
   * 更新批量分发目标；`platformId` 是平台标识，`checked` 表示是否参与下次任务。
   */
  const handleDistributionTargetChange = (
    platformId: RealPublishPlatformId,
    checked: boolean
  ): void => {
    setDistributionTargets((currentTargets) => ({
      ...currentTargets,
      [platformId]: checked,
    }))
  }

  /**
   * 更新内容平台选项；`field` 是选项字段，`value` 是用户输入值。
   */
  const updateContentOption = (
    field: keyof ContentPlatformOptions,
    value: string
  ): void => {
    setContentOptions((currentOptions) => ({
      ...currentOptions,
      [selectedPlatformId]: {
        ...currentOptions[selectedPlatformId],
        [field]: value,
      },
    }))
    // 业务场景：真实平台选项变化后只让对应草稿重新进入待准备状态。
    if (isRealPublishPlatform(selectedPlatformId)) {
      updateDistributionTask(selectedPlatformId, {
        status: 'idle',
        message: '',
      })
    }
  }

  /**
   * 复制发布内容；`kind` 表示复制标题、正文或完整文章。
   */
  const handleCopyContent = async (
    kind: 'title' | 'body' | 'all'
  ): Promise<void> => {
    // 当前文章标题，保存复制内容使用的安全标题兜底值。
    const title = articleTitle || '未命名文章'
    // 当前平台内容变体，保存真实平台复制动作使用的适配后正文。
    const selectedVariant = isRealPublishPlatform(selectedPlatformId)
      ? distributionPlan.find(
          (variant) => variant.platformId === selectedPlatformId
        )
      : undefined
    // 当前平台正文，真实平台使用适配变体，其余平台保留源 Markdown。
    const platformBody = selectedVariant?.body ?? parsedArticle.body
    // 待复制文本，保存本次快捷操作最终写入剪贴板的内容。
    const copyText =
      kind === 'title'
        ? title
        : kind === 'body'
          ? platformBody
          : `${title}\n\n${platformBody}`
    // 快捷操作标识，保存按钮 loading 状态对应的唯一键。
    const actionKey = `copy-${kind}`

    setActiveQuickAction(actionKey)

    try {
      // 业务场景：Electron 使用受限 preload API；Web 预览使用标准剪贴板 API。
      if (window.visualMuseDesktop) {
        await window.visualMuseDesktop.copyText(copyText)
      } else {
        await navigator.clipboard.writeText(copyText)
      }

      messageApi.success(
        kind === 'title'
          ? '标题已复制'
          : kind === 'body'
            ? '正文已复制'
            : '标题和正文已复制'
      )
    } catch {
      messageApi.error('复制失败，请检查系统剪贴板权限')
    } finally {
      setActiveQuickAction(null)
    }
  }

  /**
   * 打开当前平台创作入口；无参数，桌面端使用系统浏览器，Web 环境打开新标签页。
   */
  const handleOpenPublisher = async (): Promise<void> => {
    setActiveQuickAction('open-publisher')

    try {
      // 业务场景：桌面端由主进程校验平台白名单，防止渲染进程打开任意外链。
      if (window.visualMuseDesktop) {
        await window.visualMuseDesktop.openPublisher(selectedPlatformId)
      } else {
        window.open(
          publisherUrlMap[selectedPlatformId],
          '_blank',
          'noopener,noreferrer'
        )
      }

      messageApi.success(`已打开${selectedPlatform.name}创作中心`)
    } catch {
      messageApi.error('无法打开创作中心，请稍后重试')
    } finally {
      setActiveQuickAction(null)
    }
  }

  // 正文字数，保存去除首尾空白后的文章字符数量。
  const articleCharacterCount = parsedArticle.body.trim().length
  // 自动保存提示文本，保存当前配置持久化状态的用户可读描述。
  const saveStatusText = isSaving ? '正在保存' : '已自动保存'

  return (
    <ConfigProvider
      theme={{
        algorithm: antThemeAlgorithm,
        token: antThemeTokens,
      }}
    >
      {messageContextHolder}
      <main
        className={`app-shell${studioPage === 'article' ? '' : ' studio-mode'}`}
        data-theme={themeMode}
        data-testid="app-shell"
      >
        <aside className="platform-rail" aria-label="主功能导航">
          <div className="brand-lockup">
            <div>
              <Typography.Title level={1}>Visual Muse</Typography.Title>
              <Typography.Text className="brand-subtitle">
                文章发布工作台
              </Typography.Text>
            </div>
          </div>

          <div
            className="platform-list studio-navigation"
            aria-label="功能模块"
          >
            {studioNavigationItems.map((item) => {
              // 导航图标，保存当前功能项对应的 Lucide 组件。
              const NavigationIcon = item.icon
              return (
                <Button
                  block
                  className="platform-button"
                  icon={<NavigationIcon aria-hidden="true" size={16} />}
                  key={item.id}
                  onClick={() => setStudioPage(item.id)}
                  type={item.id === studioPage ? 'primary' : 'text'}
                >
                  {item.name}
                </Button>
              )
            })}
          </div>

          {studioPage === 'article' && (
            <div
              className="platform-list publishing-platform-list"
              aria-label="发布平台"
            >
              <Typography.Text className="rail-section-label" type="secondary">
                发布平台
              </Typography.Text>
              {publishingPlatforms.map((platform) => (
                <Button
                  block
                  className="platform-button"
                  icon={<PlatformIcon platformId={platform.id} />}
                  key={platform.id}
                  onClick={() => handlePlatformSelect(platform.id)}
                  type={platform.id === selectedPlatformId ? 'primary' : 'text'}
                >
                  {platform.name}
                </Button>
              ))}
            </div>
          )}

          <div className="rail-footer">
            <Typography.Text type="secondary">界面主题</Typography.Text>
            <Tooltip title={themeMode === 'dark' ? '切换为浅色' : '切换为深色'}>
              <Switch
                aria-label="主题切换"
                checked={themeMode === 'light'}
                checkedChildren={<Sun aria-hidden="true" size={13} />}
                onChange={handleThemeChange}
                unCheckedChildren={<Moon aria-hidden="true" size={13} />}
              />
            </Tooltip>
          </div>
        </aside>

        {studioPage === 'article' ? (
          <>
            <section className="workspace" aria-label="文章编辑工作区">
              <header className="workspace-header">
                <div>
                  <Typography.Text className="section-kicker">
                    {selectedPlatform.name}
                  </Typography.Text>
                  <Typography.Title level={2}>
                    {articleTitle || '未命名文章'}
                  </Typography.Title>
                  <Typography.Paragraph className="platform-capability">
                    {selectedPlatform.capability}
                  </Typography.Paragraph>
                </div>
                <Space>
                  <DocumentManager
                    markdown={markdown}
                    onLoadDocument={handleOpenArticle}
                    title={articleTitle || '未命名文章'}
                  />
                  {updateVersion && (
                    <Tooltip title={`新版本 v${updateVersion}`}>
                      <Button
                        size="small"
                        type="primary"
                        loading={isUpdateDownloading}
                        onClick={() => void handleAppUpdate()}
                      >
                        {isUpdateDownloaded ? '安装并重启' : '下载更新'}
                      </Button>
                    </Tooltip>
                  )}
                  <div className="save-indicator" aria-live="polite">
                    {isSaving ? (
                      <Cloud aria-hidden="true" size={15} />
                    ) : (
                      <Check aria-hidden="true" size={15} />
                    )}
                    <span>{saveStatusText}</span>
                  </div>
                </Space>
              </header>

              {!isHydrated ? (
                <section
                  className="workspace-loading"
                  aria-label="正在加载工作台"
                >
                  <Skeleton active paragraph={{ rows: 10 }} />
                </section>
              ) : (
                <>
                  <div className="article-toolbar" aria-label="文章编辑工具栏">
                    <Segmented
                      aria-label="文章视图模式"
                      options={[
                        { label: '分栏', value: 'split' },
                        { label: '纯编辑', value: 'edit' },
                        { label: '纯预览', value: 'preview' },
                      ]}
                      value={editorViewMode}
                      onChange={(value) =>
                        setEditorViewMode(value as EditorViewMode)
                      }
                    />
                    <Space wrap>
                      <Button
                        icon={<ImagePlus size={16} />}
                        onClick={() =>
                          insertMarkdownSnippet(
                            '![图片说明](https://example.com/image.png)'
                          )
                        }
                      >
                        图片
                      </Button>
                      <Button
                        icon={<Sigma size={16} />}
                        onClick={() =>
                          insertMarkdownSnippet('$$\nE = mc^2\n$$')
                        }
                      >
                        公式
                      </Button>
                      <Button
                        icon={<PanelTop size={16} />}
                        onClick={() =>
                          insertMarkdownSnippet(
                            '> **信息卡片**\n> 在这里填写需要强调的内容。'
                          )
                        }
                      >
                        布局块
                      </Button>
                    </Space>
                  </div>
                  <div
                    className={`editor-preview-grid editor-view-${editorViewMode}`}
                  >
                    {editorViewMode !== 'preview' && (
                      <section
                        className="editor-surface"
                        aria-label="Markdown 编辑"
                      >
                        <div className="panel-heading">
                          <Space size={8}>
                            <FileText
                              aria-hidden="true"
                              size={16}
                              strokeWidth={1.8}
                            />
                            <Typography.Text strong>Markdown</Typography.Text>
                          </Space>
                          <Typography.Text type="secondary">
                            {articleCharacterCount} 字
                          </Typography.Text>
                        </div>
                        <Input.TextArea
                          aria-label="Markdown 编辑器"
                          className="markdown-editor"
                          disabled={isBatchPreparing}
                          onChange={handleMarkdownChange}
                          spellCheck={false}
                          value={markdown}
                        />
                      </section>
                    )}

                    {editorViewMode !== 'edit' && (
                      <PreviewPanel
                        article={parsedArticle}
                        platform={selectedPlatform}
                        wechatPayload={wechatPayload}
                      />
                    )}
                  </div>
                </>
              )}
            </section>

            <aside className="publish-panel" aria-label="发布配置">
              <div className="publish-panel-toolbar">
                <Segmented
                  aria-label="右侧工作区"
                  block
                  onChange={handlePublishPanelViewChange}
                  options={[
                    {
                      icon: <Send aria-hidden="true" size={15} />,
                      label: '批量分发',
                      value: 'distribution',
                    },
                    {
                      icon: <Settings aria-hidden="true" size={15} />,
                      label: '平台设置',
                      value: 'platform',
                    },
                  ]}
                  value={publishPanelView}
                />
              </div>

              <div
                className="publish-panel-scroll"
                data-testid="publish-panel-scroll"
              >
                {publishPanelView === 'distribution' ? (
                  <div className="panel-block" aria-label="三平台分发计划">
                    <div className="panel-heading">
                      <Space size={8}>
                        <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                        <Typography.Text strong>三平台分发</Typography.Text>
                      </Space>
                      <Typography.Text type="secondary">
                        {selectedDistributionCount}/3
                      </Typography.Text>
                    </div>
                    <div className="distribution-list">
                      {distributionPlan.map((variant) => {
                        // 平台任务，保存当前行最近一次真实草稿准备结果。
                        const task = distributionTasks[variant.platformId]
                        // 预检说明，保存阻断问题、优化建议或通过状态。
                        const preflightMessage =
                          variant.validation.errors.join('；') ||
                          variant.validation.warnings.join('；') ||
                          '预检通过'
                        // 行状态说明，真实任务执行后优先展示平台返回信息。
                        const statusMessage = task.message || preflightMessage
                        // 是否允许重试，保存异常或登录处理后的单平台再次执行入口。
                        const canRetry = [
                          'login-required',
                          'not-ready',
                          'failed',
                        ].includes(task.status)
                        // 是否为阻断状态，保存尚未执行但预检失败时的展示判断。
                        const isPreflightBlocked =
                          task.status === 'idle' && !variant.validation.ok

                        return (
                          <div
                            className="distribution-row"
                            data-platform={variant.platformId}
                            key={variant.platformId}
                          >
                            <div className="distribution-row-heading">
                              <Checkbox
                                aria-label={`选择${variant.platformName}`}
                                checked={
                                  distributionTargets[variant.platformId]
                                }
                                disabled={isBatchPreparing}
                                onChange={(event) =>
                                  handleDistributionTargetChange(
                                    variant.platformId,
                                    event.target.checked
                                  )
                                }
                              />
                              <Button
                                aria-label={`查看${variant.platformName}设置`}
                                className="distribution-platform-button"
                                icon={
                                  <PlatformIcon
                                    platformId={variant.platformId}
                                  />
                                }
                                onClick={() =>
                                  handlePlatformSelect(variant.platformId)
                                }
                                type="text"
                              >
                                {variant.platformName}
                              </Button>
                              <Tooltip title={statusMessage}>
                                <Tag
                                  className="distribution-status"
                                  color={
                                    isPreflightBlocked
                                      ? 'error'
                                      : distributionStatusColorMap[task.status]
                                  }
                                >
                                  {isPreflightBlocked
                                    ? '需处理'
                                    : distributionStatusLabelMap[task.status]}
                                </Tag>
                              </Tooltip>
                              {canRetry && (
                                <Tooltip title={`重试${variant.platformName}`}>
                                  <Button
                                    aria-label={`重试${variant.platformName}`}
                                    disabled={isPreparing || isBatchPreparing}
                                    icon={
                                      <RotateCcw aria-hidden="true" size={14} />
                                    }
                                    onClick={() =>
                                      void handleRetryDistribution(
                                        variant.platformId
                                      )
                                    }
                                    size="small"
                                    type="text"
                                  />
                                </Tooltip>
                              )}
                            </div>
                            <div className="distribution-row-meta">
                              <Tag className="neutral-tag">
                                {variant.formatLabel}
                              </Tag>
                              <span>{variant.characterCount} 字</span>
                              <span>摘要 {variant.summary.length} 字</span>
                              <Tooltip title={statusMessage}>
                                {task.status === 'preparing' ? (
                                  <LoaderCircle
                                    aria-label="准备中"
                                    className="distribution-spinner"
                                    size={14}
                                  />
                                ) : task.status === 'prepared' ? (
                                  <CircleCheck
                                    aria-label="已填入"
                                    className="distribution-success-icon"
                                    size={14}
                                  />
                                ) : variant.validation.warnings.length > 0 ||
                                  !variant.validation.ok ? (
                                  <CircleAlert
                                    aria-label="有预检提示"
                                    className="distribution-warning-icon"
                                    size={14}
                                  />
                                ) : (
                                  <CircleCheck
                                    aria-label="预检通过"
                                    className="distribution-ready-icon"
                                    size={14}
                                  />
                                )}
                              </Tooltip>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="publish-panel-content">
                    <div className="panel-block">
                      <div className="panel-heading">
                        <Space size={8}>
                          <PlatformIcon platformId={selectedPlatformId} />
                          <Typography.Text strong>
                            {selectedPlatform.name}设置
                          </Typography.Text>
                        </Space>
                      </div>

                      {selectedPlatformId === 'wechat' ? (
                        <Form layout="vertical" size="middle">
                          <Form.Item
                            label="默认主题"
                            htmlFor="publisher-default-theme"
                          >
                            <Select
                              id="publisher-default-theme"
                              onChange={(value) =>
                                updateSetting('defaultTheme', value)
                              }
                              options={[
                                { label: 'Default', value: 'default' },
                                {
                                  label: 'Orange Heart',
                                  value: 'orange-heart',
                                },
                                { label: 'Lapis', value: 'lapis' },
                                { label: 'Rainbow', value: 'rainbow' },
                                { label: 'Phycat Mint', value: 'phycat' },
                              ]}
                              value={settingsState.defaultTheme}
                            />
                          </Form.Item>
                          <Collapse
                            className="advanced-settings"
                            expandIcon={renderCollapseIcon}
                            expandIconPlacement="end"
                            ghost
                            items={[
                              {
                                children: (
                                  <div className="advanced-settings-fields">
                                    <Form.Item
                                      label="AppID"
                                      htmlFor="publisher-app-id"
                                    >
                                      <Input
                                        id="publisher-app-id"
                                        autoComplete="username"
                                        onChange={(event) =>
                                          updateSetting(
                                            'appId',
                                            event.target.value
                                          )
                                        }
                                        prefix={
                                          <KeyRound
                                            aria-hidden="true"
                                            size={16}
                                          />
                                        }
                                        value={settingsState.appId}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="AppSecret"
                                      htmlFor="publisher-app-secret"
                                    >
                                      <Input.Password
                                        id="publisher-app-secret"
                                        autoComplete="current-password"
                                        onChange={(event) =>
                                          updateSetting(
                                            'appSecret',
                                            event.target.value
                                          )
                                        }
                                        prefix={
                                          <KeyRound
                                            aria-hidden="true"
                                            size={16}
                                          />
                                        }
                                        value={settingsState.appSecret}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="Server"
                                      htmlFor="publisher-server-url"
                                    >
                                      <Input
                                        id="publisher-server-url"
                                        onChange={(event) =>
                                          updateSetting(
                                            'serverUrl',
                                            event.target.value
                                          )
                                        }
                                        prefix={
                                          <Server
                                            aria-hidden="true"
                                            size={16}
                                          />
                                        }
                                        type="url"
                                        value={settingsState.serverUrl}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="API Key"
                                      htmlFor="publisher-api-key"
                                    >
                                      <Input
                                        id="publisher-api-key"
                                        onChange={(event) =>
                                          updateSetting(
                                            'apiKey',
                                            event.target.value
                                          )
                                        }
                                        prefix={
                                          <KeyRound
                                            aria-hidden="true"
                                            size={16}
                                          />
                                        }
                                        value={settingsState.apiKey}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="代理"
                                      htmlFor="publisher-proxy-url"
                                    >
                                      <Input
                                        id="publisher-proxy-url"
                                        onChange={(event) =>
                                          updateSetting(
                                            'proxyUrl',
                                            event.target.value
                                          )
                                        }
                                        placeholder="http://127.0.0.1:7890"
                                        type="url"
                                        value={settingsState.proxyUrl}
                                      />
                                    </Form.Item>
                                  </div>
                                ),
                                key: 'wechat-api',
                                label: '接口发布（可选）',
                              },
                            ]}
                          />
                        </Form>
                      ) : (
                        <Form layout="vertical" size="middle">
                          <Form.Item label="文章分类">
                            <Input
                              onChange={(event) =>
                                updateContentOption(
                                  'category',
                                  event.target.value
                                )
                              }
                              placeholder="例如：前端"
                              value={
                                contentOptions[selectedPlatformId].category
                              }
                            />
                          </Form.Item>
                          <Form.Item label="标签">
                            <Input
                              onChange={(event) =>
                                updateContentOption('tags', event.target.value)
                              }
                              placeholder="多个标签用逗号分隔"
                              value={contentOptions[selectedPlatformId].tags}
                            />
                          </Form.Item>
                          <Form.Item label="摘要">
                            <Input.TextArea
                              onChange={(event) =>
                                updateContentOption(
                                  'summary',
                                  event.target.value
                                )
                              }
                              placeholder="用于平台发布页的文章摘要"
                              rows={3}
                              value={contentOptions[selectedPlatformId].summary}
                            />
                          </Form.Item>
                        </Form>
                      )}
                    </div>

                    <div className="panel-block">
                      <div className="panel-heading">
                        <Space size={8}>
                          <WandSparkles
                            aria-hidden="true"
                            size={16}
                            strokeWidth={1.8}
                          />
                          <Typography.Text strong>发布工具</Typography.Text>
                        </Space>
                      </div>
                      {publisherAccounts.length > 0 && (
                        <Form.Item label="发布账号">
                          <Select
                            aria-label="发布账号"
                            onChange={setSelectedPublisherAccountId}
                            options={publisherAccounts.map((account) => ({
                              label: account.name,
                              value: account.id,
                            }))}
                            value={selectedPublisherAccountId}
                          />
                        </Form.Item>
                      )}
                      <Space
                        className="action-row"
                        orientation="vertical"
                        size={12}
                      >
                        <Button
                          block
                          icon={<FileText aria-hidden="true" size={16} />}
                          onClick={handlePreflight}
                        >
                          发布预检
                        </Button>
                        {selectedPlatformId !== 'wechat' && (
                          <>
                            <div className="copy-action-grid">
                              <Button
                                icon={<Copy aria-hidden="true" size={15} />}
                                loading={activeQuickAction === 'copy-title'}
                                onClick={() => void handleCopyContent('title')}
                              >
                                复制标题
                              </Button>
                              <Button
                                icon={<Copy aria-hidden="true" size={15} />}
                                loading={activeQuickAction === 'copy-body'}
                                onClick={() => void handleCopyContent('body')}
                              >
                                复制正文
                              </Button>
                            </div>
                            <Button
                              block
                              icon={<Copy aria-hidden="true" size={16} />}
                              loading={activeQuickAction === 'copy-all'}
                              onClick={() => void handleCopyContent('all')}
                            >
                              复制标题和正文
                            </Button>
                            <Button
                              block
                              icon={<Cloud aria-hidden="true" size={16} />}
                              loading={isSyncingDraft}
                              onClick={() => void handleSyncDraft()}
                            >
                              同步草稿
                            </Button>
                          </>
                        )}
                        {isRealPublishPlatform(selectedPlatformId) && (
                          <Button
                            block
                            icon={<ExternalLink aria-hidden="true" size={16} />}
                            loading={activeQuickAction === 'open-publisher'}
                            onClick={() => void handleOpenPublisher()}
                          >
                            打开{selectedPlatform.name}创作中心
                          </Button>
                        )}
                      </Space>

                      {draftSyncStatus && (
                        <Alert
                          className="status-alert"
                          description={draftSyncStatus.message}
                          showIcon
                          type={draftSyncStatus.success ? 'success' : 'error'}
                        />
                      )}

                      {validation && (
                        <Alert
                          className="status-alert"
                          description={
                            validation.ok
                              ? validation.warnings.length > 0
                                ? validation.warnings.join('；')
                                : '当前文章可以进入发布流程'
                              : validation.errors.join('；')
                          }
                          showIcon
                          title={validation.ok ? '预检通过' : '预检未通过'}
                          type={validation.ok ? 'success' : 'error'}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="publish-panel-footer">
                {publishPanelView === 'distribution' ? (
                  <Button
                    block
                    disabled={
                      selectedDistributionCount === 0 ||
                      isPreparing ||
                      isBatchPreparing
                    }
                    icon={<Send aria-hidden="true" size={16} />}
                    loading={isBatchPreparing}
                    onClick={() => void handleBatchPrepare()}
                    type="primary"
                  >
                    一键准备 {selectedDistributionCount} 个平台草稿
                  </Button>
                ) : isRealPublishPlatform(selectedPlatformId) ? (
                  <Button
                    block
                    disabled={isPreparing || isBatchPreparing}
                    icon={<Send aria-hidden="true" size={16} />}
                    loading={isPreparing}
                    onClick={() => void handlePreparePublisher()}
                    type="primary"
                  >
                    准备{selectedPlatform.name}草稿
                  </Button>
                ) : (
                  <Button
                    block
                    icon={<ExternalLink aria-hidden="true" size={16} />}
                    loading={activeQuickAction === 'open-publisher'}
                    onClick={() => void handleOpenPublisher()}
                    type="primary"
                  >
                    打开{selectedPlatform.name}创作中心
                  </Button>
                )}
              </div>
            </aside>
          </>
        ) : (
          <section className="workspace studio-workspace" aria-label="功能页面">
            <StudioPage
              page={studioPage}
              markdown={markdown}
              onOpenArticle={handleOpenArticle}
            />
          </section>
        )}
      </main>
    </ConfigProvider>
  )
}
