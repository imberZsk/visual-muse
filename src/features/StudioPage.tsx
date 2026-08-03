import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  Bot,
  Copy,
  ExternalLink,
  Heart,
  KeyRound,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import {
  createDefaultStudioState,
  createStudioId,
  normalizeStudioState,
  summarizeActivities,
  type StudioAutomation,
  type StudioDocument,
  type StudioPage as StudioPageId,
  type StudioSkill,
  type StudioState,
  type StudioTheme,
} from '../domain/studio'
import { ImageTextEditor } from './ImageTextEditor'
import { StudioHeader } from './StudioHeader'

/** 功能页面参数；用于连接现有编辑器和新增工作区。 */
interface StudioPageProps {
  /** 当前功能页面标识。 */
  page: Exclude<StudioPageId, 'article'>
  /** 当前文章 Markdown，用于首次初始化工作区。 */
  markdown: string
  /** 打开文章编辑器并写入正文；`content` 是需要编辑的 Markdown。 */
  onOpenArticle: (content: string) => void
}

/** 热榜来源；真实数据由主进程按来源单独刷新。 */
const trendSources = [
  { id: 'weibo', name: '微博', url: 'https://s.weibo.com/top/summary' },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/hot' },
  {
    id: 'bilibili',
    name: 'B 站',
    url: 'https://www.bilibili.com/v/popular/rank/all',
  },
  { id: '36kr', name: '36氪', url: 'https://36kr.com/hot-list/catalog' },
  { id: 'huxiu', name: '虎嗅', url: 'https://www.huxiu.com/' },
]

/** 平台账号入口；登录窗口使用 Electron 独立持久会话。 */
const accountPlatforms = [
  { id: 'wechat', name: '微信公众号' },
  { id: 'zhihu', name: '知乎' },
  { id: 'weibo', name: '微博' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'bilibili', name: 'B 站' },
  { id: 'juejin', name: '掘金' },
  { id: 'csdn', name: 'CSDN' },
  { id: 'yuque', name: '语雀' },
  { id: 'toutiao', name: '今日头条' },
  { id: 'baijiahao', name: '百家号' },
]

/**
 * 读取功能工作区；`markdown` 用于不存在历史状态时初始化默认文稿。
 */
async function loadStudioState(markdown: string): Promise<StudioState> {
  // 桌面工作区状态，保存主进程独立文件返回的数据。
  const desktopState = await window.visualMuseWorkspace?.getState()
  if (desktopState) return normalizeStudioState(desktopState, markdown)

  // 浏览器降级状态，保存 Web 预览环境的本地 JSON。
  const browserState = window.localStorage.getItem('visual-muse-studio')
  if (browserState) {
    try {
      return normalizeStudioState(JSON.parse(browserState) as unknown, markdown)
    } catch {
      // 业务场景：本地 JSON 损坏时回退默认状态，避免整个工作台无法打开。
    }
  }
  return createDefaultStudioState(markdown)
}

/**
 * 保存功能工作区；`state` 是完整工作区状态。
 */
async function saveStudioState(state: StudioState): Promise<void> {
  if (window.visualMuseWorkspace) {
    await window.visualMuseWorkspace.setState(state)
    return
  }
  window.localStorage.setItem('visual-muse-studio', JSON.stringify(state))
}

/**
 * 功能工作台页面；根据 `page` 渲染文章中对应的业务模块。
 */
export default function StudioPage({
  page,
  markdown,
  onOpenArticle,
}: StudioPageProps) {
  // 全局消息 API，保存工作区操作结果反馈。
  const [messageApi, messageContextHolder] = message.useMessage()
  // 功能工作区状态，保存文稿、主题、Skill、任务、素材与统计数据。
  const [studioState, setStudioState] = useState<StudioState | null>(null)
  // 工作区保存状态，避免初始化读取前覆盖历史数据。
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    // 组件挂载标记，避免异步读取后更新已卸载页面。
    let isMounted = true
    void loadStudioState(markdown).then((state) => {
      if (!isMounted) return
      setStudioState(state)
      setIsHydrated(true)
    })
    /** 清理工作区读取副作用。 */
    return () => {
      isMounted = false
    }
  }, [markdown])

  useEffect(() => {
    if (!studioState || !isHydrated) return undefined
    // 保存定时器，合并同一轮连续输入产生的磁盘写入。
    const saveTimer = window.setTimeout(() => {
      void saveStudioState(studioState)
    }, 400)
    /** 清理尚未执行的保存任务。 */
    return () => window.clearTimeout(saveTimer)
  }, [isHydrated, studioState])

  if (!studioState)
    return (
      <section className="studio-page">
        <Typography.Text>正在加载工作区...</Typography.Text>
      </section>
    )

  return (
    <section className="studio-page" aria-label="功能工作台">
      {messageContextHolder}
      {page === 'dashboard' && (
        <Dashboard state={studioState} onOpenArticle={onOpenArticle} />
      )}
      {page === 'image-text' && (
        <ImageTextEditor
          state={studioState}
          setState={setStudioState}
          messageApi={messageApi}
        />
      )}
      {page === 'themes' && (
        <ThemeLibrary state={studioState} setState={setStudioState} />
      )}
      {page === 'skills' && (
        <SkillLibrary state={studioState} setState={setStudioState} />
      )}
      {page === 'assistant' && (
        <AssistantWorkspace
          state={studioState}
          setState={setStudioState}
          onOpenArticle={onOpenArticle}
        />
      )}
      {page === 'automation' && (
        <AutomationWorkspace
          state={studioState}
          setState={setStudioState}
          onOpenArticle={onOpenArticle}
        />
      )}
      {page === 'trends' && (
        <TrendWorkspace messageApi={messageApi} onOpenArticle={onOpenArticle} />
      )}
      {page === 'accounts' && (
        <AccountWorkspace
          state={studioState}
          setState={setStudioState}
          messageApi={messageApi}
        />
      )}
      {page === 'assets' && (
        <AssetWorkspace state={studioState} setState={setStudioState} />
      )}
      {page === 'analytics' && <AnalyticsWorkspace state={studioState} />}
      {page === 'settings' && (
        <SettingsWorkspace state={studioState} setState={setStudioState} />
      )}
      {page === 'guide' && <GuideWorkspace />}
    </section>
  )
}

/** 仪表盘参数。 */
interface DashboardProps {
  /** 当前工作区状态。 */
  state: StudioState
  /** 打开文章编辑器。 */
  onOpenArticle: (content: string) => void
}

/**
 * 工作台首页；展示今日状态、文稿和快捷创作入口。
 */
function Dashboard({ state, onOpenArticle }: DashboardProps) {
  // 今日开始时间，保存筛选今日发布活动的日期边界。
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  // 今日活动，保存发生在今日零点之后的发布记录。
  const todayActivities = state.activities.filter(
    (activity) => new Date(activity.createdAt) >= todayStart
  )
  // 当前文稿，保存快捷继续编辑的目标文章。
  const activeDocument =
    state.documents.find(
      (document) => document.id === state.activeDocumentId
    ) ?? state.documents[0]

  return (
    <>
      <StudioHeader title="工作台" description="创作状态、最近文稿和常用入口" />
      <div className="metric-strip">
        <Statistic title="今日记录" value={todayActivities.length} />
        <Statistic
          title="成功发布"
          value={
            todayActivities.filter((activity) => activity.status === 'success')
              .length
          }
        />
        <Statistic
          title="失败"
          value={
            todayActivities.filter((activity) => activity.status === 'failed')
              .length
          }
        />
        <Statistic title="本地文稿" value={state.documents.length} />
      </div>
      <div className="studio-split">
        <section className="studio-section">
          <Typography.Title level={3}>继续创作</Typography.Title>
          {activeDocument ? (
            <div className="document-row">
              <div>
                <Typography.Text strong>{activeDocument.title}</Typography.Text>
                <Typography.Text type="secondary">
                  {new Date(activeDocument.updatedAt).toLocaleString()}
                </Typography.Text>
              </div>
              <Button
                icon={<Pencil size={16} />}
                onClick={() => onOpenArticle(activeDocument.content)}
              >
                打开
              </Button>
            </div>
          ) : (
            <Empty description="暂无文稿" />
          )}
        </section>
        <section className="studio-section">
          <Typography.Title level={3}>手动创作</Typography.Title>
          <ol className="workflow-steps">
            <li>选择文章或图文主题</li>
            <li>套用写作 Skill</li>
            <li>编辑并预览</li>
            <li>选择账号同步草稿</li>
          </ol>
        </section>
      </div>
    </>
  )
}

/** 可修改工作区参数。 */
interface MutableStudioProps {
  /** 当前工作区状态。 */
  state: StudioState
  /** 更新完整工作区状态。 */
  setState: React.Dispatch<React.SetStateAction<StudioState | null>>
}

/**
 * 主题库；支持文章/图文主题搜索、收藏、设为默认和个人主题编辑。
 */
function ThemeLibrary({ state, setState }: MutableStudioProps) {
  // 主题搜索词，保存名称过滤条件。
  const [query, setQuery] = useState('')
  // 编辑主题，保存当前打开的个人主题表单对象。
  const [editingTheme, setEditingTheme] = useState<StudioTheme | null>(null)

  /** 更新主题；`themeId` 是目标标识，`patch` 是需要合并的属性。 */
  const updateTheme = (themeId: string, patch: Partial<StudioTheme>): void =>
    setState((current) =>
      current
        ? {
            ...current,
            themes: current.themes.map((theme) =>
              theme.id === themeId ? { ...theme, ...patch } : theme
            ),
          }
        : current
    )
  /** 创建个人主题；`kind` 表示文章或图文主题。 */
  const createPersonalTheme = (kind: StudioTheme['kind']): void => {
    // 个人主题，保存将加入工作区并立即编辑的新对象。
    const theme: StudioTheme = {
      id: createStudioId('theme'),
      name: '我的新主题',
      kind,
      accent: '#2f6f61',
      background: '#ffffff',
      foreground: '#202322',
      personal: true,
      favorite: true,
    }
    setState((current) =>
      current ? { ...current, themes: [...current.themes, theme] } : current
    )
    setEditingTheme(theme)
  }
  /** 渲染指定类型主题；`kind` 表示要展示的主题分类。 */
  const renderThemes = (kind: StudioTheme['kind']) => (
    <div className="item-grid">
      {state.themes
        .filter(
          (theme) =>
            theme.kind === kind &&
            theme.name.toLowerCase().includes(query.toLowerCase())
        )
        .map((theme) => (
          <article className="theme-item" key={theme.id}>
            <div
              className="theme-swatch"
              style={{
                background: theme.background,
                color: theme.foreground,
                borderColor: theme.accent,
              }}
            >
              <strong style={{ color: theme.accent }}>Visual Muse</strong>
              <span>让内容保持清晰、有序和可读。</span>
            </div>
            <div className="item-actions">
              <Typography.Text strong>{theme.name}</Typography.Text>
              <Space>
                <Button
                  aria-label={`收藏${theme.name}`}
                  type="text"
                  icon={
                    <Heart
                      size={16}
                      fill={theme.favorite ? 'currentColor' : 'none'}
                    />
                  }
                  onClick={() =>
                    updateTheme(theme.id, { favorite: !theme.favorite })
                  }
                />
                {theme.personal && (
                  <Button
                    aria-label={`编辑${theme.name}`}
                    type="text"
                    icon={<Pencil size={16} />}
                    onClick={() => setEditingTheme(theme)}
                  />
                )}
                <Button
                  onClick={() =>
                    setState((current) =>
                      current
                        ? {
                            ...current,
                            [kind === 'article'
                              ? 'defaultArticleThemeId'
                              : 'defaultImageThemeId']: theme.id,
                          }
                        : current
                    )
                  }
                >
                  设为默认
                </Button>
              </Space>
            </div>
          </article>
        ))}
    </div>
  )

  return (
    <>
      <StudioHeader
        title="主题模板"
        description="文章主题、图文主题与个人主题"
        actions={
          <Input.Search
            aria-label="搜索主题"
            placeholder="搜索主题"
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      />
      <Tabs
        items={[
          {
            key: 'article',
            label: '文章主题市场',
            children: (
              <>
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => createPersonalTheme('article')}
                >
                  新建文章主题
                </Button>
                {renderThemes('article')}
              </>
            ),
          },
          {
            key: 'image-text',
            label: '图文主题市场',
            children: (
              <>
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => createPersonalTheme('image-text')}
                >
                  新建图文主题
                </Button>
                {renderThemes('image-text')}
              </>
            ),
          },
          {
            key: 'mine',
            label: '我的主题',
            children: (
              <div className="item-grid">
                {state.themes
                  .filter((theme) => theme.personal || theme.favorite)
                  .map((theme) => (
                    <div className="document-row" key={theme.id}>
                      <Typography.Text>{theme.name}</Typography.Text>
                      <Tag>{theme.kind === 'article' ? '文章' : '图文'}</Tag>
                    </div>
                  ))}
              </div>
            ),
          },
        ]}
      />
      <Modal
        title="编辑个人主题"
        open={Boolean(editingTheme)}
        onCancel={() => setEditingTheme(null)}
        onOk={() => {
          if (editingTheme) updateTheme(editingTheme.id, editingTheme)
          setEditingTheme(null)
        }}
      >
        <Form layout="vertical">
          <Form.Item label="名称">
            <Input
              value={editingTheme?.name}
              onChange={(event) =>
                setEditingTheme((theme) =>
                  theme ? { ...theme, name: event.target.value } : theme
                )
              }
            />
          </Form.Item>
          <Form.Item label="强调色">
            <Input
              type="color"
              value={editingTheme?.accent}
              onChange={(event) =>
                setEditingTheme((theme) =>
                  theme ? { ...theme, accent: event.target.value } : theme
                )
              }
            />
          </Form.Item>
          <Form.Item label="背景色">
            <Input
              type="color"
              value={editingTheme?.background}
              onChange={(event) =>
                setEditingTheme((theme) =>
                  theme ? { ...theme, background: event.target.value } : theme
                )
              }
            />
          </Form.Item>
          <Form.Item label="正文色">
            <Input
              type="color"
              value={editingTheme?.foreground}
              onChange={(event) =>
                setEditingTheme((theme) =>
                  theme ? { ...theme, foreground: event.target.value } : theme
                )
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/**
 * Skill 模板库；支持分类、收藏、新建、编辑和删除个人 Skill。
 */
function SkillLibrary({ state, setState }: MutableStudioProps) {
  // 当前编辑 Skill，保存弹窗中的个人模板。
  const [editingSkill, setEditingSkill] = useState<StudioSkill | null>(null)
  // Skill 分类，保存列表筛选条件。
  const [category, setCategory] = useState('全部')
  // Skill 分类列表，保存去重后的筛选选项。
  const categories = [
    '全部',
    ...new Set(state.skills.map((skill) => skill.category)),
  ]
  // 筛选后的 Skill，保存当前分类可见模板。
  const visibleSkills = state.skills.filter(
    (skill) => category === '全部' || skill.category === category
  )

  /** 从磁盘导入个人 Skill。 */
  const importSkill = async (): Promise<void> => {
    // 导入结果，保存主进程读取的名称、分类和 SKILL.md 正文。
    const imported = await window.visualMuseWorkspace?.importSkill()
    if (!imported) return
    // 个人 Skill，保存加入我的模板的新对象。
    const skill: StudioSkill = {
      id: createStudioId('skill'),
      ...imported,
      personal: true,
      favorite: true,
    }
    setState((current) =>
      current ? { ...current, skills: [...current.skills, skill] } : current
    )
  }

  /** 保存 Skill 编辑结果。 */
  const saveSkill = (): void => {
    if (!editingSkill?.name.trim() || !editingSkill.prompt.trim()) return
    setState((current) => {
      if (!current) return current
      // 是否已有 Skill，保存本次操作是更新还是新增。
      const exists = current.skills.some(
        (skill) => skill.id === editingSkill.id
      )
      return {
        ...current,
        skills: exists
          ? current.skills.map((skill) =>
              skill.id === editingSkill.id ? editingSkill : skill
            )
          : [...current.skills, editingSkill],
      }
    })
    setEditingSkill(null)
  }

  return (
    <>
      <StudioHeader
        title="Skill 模板"
        description="复用写作方法、提示词和个人模板"
        actions={
          <Space>
            <Button
              icon={<Upload size={16} />}
              onClick={() => void importSkill()}
            >
              从磁盘导入
            </Button>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={() =>
                setEditingSkill({
                  id: createStudioId('skill'),
                  name: '',
                  category: '自定义',
                  prompt: '',
                  personal: true,
                  favorite: true,
                })
              }
            >
              新建 Skill
            </Button>
          </Space>
        }
      />
      <Segmented
        value={category}
        options={categories}
        onChange={(value) => setCategory(String(value))}
      />
      <div className="item-grid">
        {visibleSkills.map((skill) => (
          <article className="studio-item" key={skill.id}>
            <Space>
              <Tag>{skill.category}</Tag>
              {skill.personal && <Tag>个人</Tag>}
            </Space>
            <Typography.Title level={4}>{skill.name}</Typography.Title>
            <Typography.Paragraph ellipsis={{ rows: 3 }}>
              {skill.prompt}
            </Typography.Paragraph>
            <Space>
              <Button
                icon={<Copy size={16} />}
                onClick={() => void navigator.clipboard.writeText(skill.prompt)}
              >
                复制
              </Button>
              <Button
                icon={
                  <Heart
                    size={16}
                    fill={skill.favorite ? 'currentColor' : 'none'}
                  />
                }
                onClick={() =>
                  setState((current) =>
                    current
                      ? {
                          ...current,
                          skills: current.skills.map((item) =>
                            item.id === skill.id
                              ? { ...item, favorite: !item.favorite }
                              : item
                          ),
                        }
                      : current
                  )
                }
              >
                {skill.favorite ? '已收藏' : '收藏'}
              </Button>
              {skill.personal && (
                <>
                  <Button
                    icon={<Pencil size={16} />}
                    onClick={() => setEditingSkill(skill)}
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    icon={<Trash2 size={16} />}
                    onClick={() =>
                      setState((current) =>
                        current
                          ? {
                              ...current,
                              skills: current.skills.filter(
                                (item) => item.id !== skill.id
                              ),
                            }
                          : current
                      )
                    }
                  >
                    删除
                  </Button>
                </>
              )}
            </Space>
          </article>
        ))}
      </div>
      <Modal
        title="编辑 Skill"
        open={Boolean(editingSkill)}
        onCancel={() => setEditingSkill(null)}
        onOk={saveSkill}
      >
        <Form layout="vertical">
          <Form.Item label="名称" required>
            <Input
              value={editingSkill?.name}
              onChange={(event) =>
                setEditingSkill((skill) =>
                  skill ? { ...skill, name: event.target.value } : skill
                )
              }
            />
          </Form.Item>
          <Form.Item label="分类">
            <Input
              value={editingSkill?.category}
              onChange={(event) =>
                setEditingSkill((skill) =>
                  skill ? { ...skill, category: event.target.value } : skill
                )
              }
            />
          </Form.Item>
          <Form.Item label="SKILL.md" required>
            <Input.TextArea
              rows={10}
              value={editingSkill?.prompt}
              onChange={(event) =>
                setEditingSkill((skill) =>
                  skill ? { ...skill, prompt: event.target.value } : skill
                )
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/** 助手参数。 */
interface AssistantWorkspaceProps extends MutableStudioProps {
  /** 打开文章编辑器。 */
  onOpenArticle: (content: string) => void
}

/**
 * AI 助手；支持 Skill 激活、上下文引用、流式模型调用和产物落盘。
 */
function AssistantWorkspace({
  state,
  setState,
  onOpenArticle,
}: AssistantWorkspaceProps) {
  // 助手输入，保存用户提示词。
  const [input, setInput] = useState('')
  // 助手输出，保存模型返回的 Markdown。
  const [output, setOutput] = useState('')
  // 当前 Skill，保存本轮写作采用的模板标识。
  const [skillId, setSkillId] = useState(
    state.skills.find((skill) => skill.favorite)?.id ?? state.skills[0]?.id
  )
  // 当前模型，保存本轮调用的模型配置标识。
  const [modelId, setModelId] = useState(state.models[0]?.id)
  // 助手运行状态，保存异步模型调用是否进行中。
  const [isRunning, setIsRunning] = useState(false)

  /** 执行助手生成。 */
  const runAssistant = async (): Promise<void> => {
    // 当前模型配置，保存 API 或 WebView 调用目标。
    const model = state.models.find((item) => item.id === modelId)
    // 当前 Skill，保存写作系统提示词。
    const skill = state.skills.find((item) => item.id === skillId)
    if (!model || !skill || !input.trim()) return
    setIsRunning(true)
    try {
      // 生成结果，保存主进程安全代理返回的 Markdown。
      const result = await window.visualMuseWorkspace?.generateText({
        model,
        systemPrompt: skill.prompt,
        userPrompt: input,
      })
      setOutput(result?.content ?? '')
    } finally {
      setIsRunning(false)
    }
  }

  /** 保存助手产物为新文稿。 */
  const saveOutput = (): void => {
    if (!output.trim()) return
    // 新文稿，保存助手生成内容及首次版本信息。
    const document: StudioDocument = {
      id: createStudioId('document'),
      title: output.match(/^#\s+(.+)$/m)?.[1] ?? '助手生成文章',
      folderId: state.folders[0]?.id ?? null,
      content: output,
      updatedAt: new Date().toISOString(),
      versions: [],
    }
    setState((current) =>
      current
        ? {
            ...current,
            activeDocumentId: document.id,
            documents: [...current.documents, document],
          }
        : current
    )
    onOpenArticle(output)
  }

  return (
    <>
      <StudioHeader
        title="AI 助手"
        description="用 Skill、上下文和写作模型生成可继续编辑的文稿"
      />
      <div className="studio-toolbar">
        <Select
          aria-label="助手 Skill"
          value={skillId}
          options={state.skills.map((skill) => ({
            label: skill.name,
            value: skill.id,
          }))}
          onChange={setSkillId}
        />
        <Select
          aria-label="写作模型"
          placeholder="请先在账号页添加模型"
          value={modelId}
          options={state.models.map((model) => ({
            label: model.name,
            value: model.id,
          }))}
          onChange={setModelId}
        />
      </div>
      <div className="studio-split">
        <section className="studio-section">
          <Typography.Title level={3}>输入</Typography.Title>
          <Input.TextArea
            aria-label="助手输入"
            rows={16}
            placeholder="输入写作要求，或使用 @ 引用当前文稿"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button
            type="primary"
            icon={<Bot size={16} />}
            loading={isRunning}
            disabled={!modelId || !input.trim()}
            onClick={() => void runAssistant()}
          >
            生成
          </Button>
        </section>
        <section className="studio-section">
          <Typography.Title level={3}>产物</Typography.Title>
          {output ? (
            <div
              className="assistant-output"
              dangerouslySetInnerHTML={{
                __html: marked.parse(output) as string,
              }}
            />
          ) : (
            <Empty description="等待生成" />
          )}
          <Button
            icon={<Save size={16} />}
            disabled={!output}
            onClick={saveOutput}
          >
            保存并打开编辑器
          </Button>
        </section>
      </div>
    </>
  )
}

/** 自动任务参数。 */
interface AutomationWorkspaceProps extends MutableStudioProps {
  /** 打开文章编辑器。 */
  onOpenArticle: (content: string) => void
}

/**
 * 自动任务页面；以三步向导配置 Skill、模型、输入和发布目标。
 */
function AutomationWorkspace({
  state,
  setState,
  onOpenArticle,
}: AutomationWorkspaceProps) {
  // 新任务弹窗状态，保存是否正在配置自动化。
  const [isCreating, setIsCreating] = useState(false)
  // 新任务表单，保存三步流水线配置。
  const [draft, setDraft] = useState({
    name: '',
    skillId: state.skills[0]?.id ?? '',
    modelId: state.models[0]?.id ?? '',
    platformId: 'wechat',
    input: '',
  })

  /** 创建自动任务。 */
  const createAutomation = (): void => {
    if (!draft.name.trim() || !draft.skillId) return
    // 新自动任务，保存用户选择的流水线配置。
    const automation: StudioAutomation = {
      id: createStudioId('automation'),
      name: draft.name,
      skillId: draft.skillId,
      modelId: draft.modelId,
      platformId: draft.platformId,
      lastRunAt: null,
      status: 'idle',
    }
    setState((current) =>
      current
        ? { ...current, automations: [...current.automations, automation] }
        : current
    )
    setIsCreating(false)
  }

  /** 运行自动任务；`automation` 是待执行的流水线。 */
  const runAutomation = async (automation: StudioAutomation): Promise<void> => {
    setState((current) =>
      current
        ? {
            ...current,
            automations: current.automations.map((item) =>
              item.id === automation.id ? { ...item, status: 'running' } : item
            ),
          }
        : current
    )
    // 当前 Skill，保存模型系统提示词。
    const skill = state.skills.find((item) => item.id === automation.skillId)
    // 当前模型，保存调用目标配置。
    const model = state.models.find((item) => item.id === automation.modelId)
    // 发布账号，保存自动任务目标平台的首个已配置账号槽位。
    const account = state.accounts.find(
      (item) => item.platformId === automation.platformId
    )
    try {
      if (!skill || !model) throw new Error('任务缺少可用 Skill 或模型')
      if (!account) throw new Error('任务目标平台尚未配置账号')
      // 生成结果，保存流水线第二步产物。
      const result = await window.visualMuseWorkspace?.generateText({
        model,
        systemPrompt: skill.prompt,
        userPrompt: draft.input || automation.name,
      })
      if (!result?.content) throw new Error('模型未返回内容')
      if (!window.visualMuseWorkspace?.syncDraft)
        throw new Error('桌面草稿同步能力不可用')
      // 草稿结果，保存平台适配器真实返回的同步状态和说明。
      const draftResult = await window.visualMuseWorkspace.syncDraft({
        platformId: automation.platformId,
        accountId: account.id,
        title: automation.name,
        markdown: result.content,
        mode: 'ui',
      })
      if (!draftResult.success)
        throw new Error(draftResult.message || '平台草稿同步失败')
      // 完成时间，保存自动任务和活动记录共用的时间戳。
      const completedAt = new Date().toISOString()
      setState((current) =>
        current
          ? {
              ...current,
              automations: current.automations.map((item) =>
                item.id === automation.id
                  ? { ...item, status: 'success', lastRunAt: completedAt }
                  : item
              ),
              activities: [
                ...current.activities,
                {
                  id: createStudioId('activity'),
                  platformId: automation.platformId,
                  accountId: account.id,
                  title: automation.name,
                  status: 'draft',
                  createdAt: completedAt,
                  message: draftResult.message,
                },
              ],
            }
          : current
      )
      onOpenArticle(result.content)
    } catch (error) {
      // 失败时间，保存任务状态与活动日志一致的发生时间。
      const failedAt = new Date().toISOString()
      // 失败说明，保存模型、账号或平台适配器返回的可诊断原因。
      const failureMessage =
        error instanceof Error ? error.message : '自动任务运行失败'
      setState((current) =>
        current
          ? {
              ...current,
              automations: current.automations.map((item) =>
                item.id === automation.id
                  ? { ...item, status: 'failed', lastRunAt: failedAt }
                  : item
              ),
              activities: [
                ...current.activities,
                {
                  id: createStudioId('activity'),
                  platformId: automation.platformId,
                  accountId: account?.id ?? null,
                  title: automation.name,
                  status: 'failed',
                  createdAt: failedAt,
                  message: failureMessage,
                },
              ],
            }
          : current
      )
    }
  }

  return (
    <>
      <StudioHeader
        title="自动任务"
        description="Skill → AI 生成 → 多平台发布"
        actions={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsCreating(true)}
          >
            新建任务
          </Button>
        }
      />
      {state.automations.length === 0 ? (
        <Empty description="暂无自动任务" />
      ) : (
        <List
          dataSource={state.automations}
          renderItem={(automation) => (
            <List.Item
              actions={[
                <Button
                  key="run"
                  icon={<Play size={16} />}
                  loading={automation.status === 'running'}
                  onClick={() => void runAutomation(automation)}
                >
                  运行
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={automation.name}
                description={
                  <Space>
                    <Tag>{automation.platformId}</Tag>
                    <Tag>{automation.status}</Tag>
                    {automation.lastRunAt && (
                      <Typography.Text type="secondary">
                        {new Date(automation.lastRunAt).toLocaleString()}
                      </Typography.Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
      <Modal
        title="三步任务向导"
        open={isCreating}
        onCancel={() => setIsCreating(false)}
        onOk={createAutomation}
      >
        <Form layout="vertical">
          <Form.Item label="1. Skill + 模型 + 输入">
            <Input
              placeholder="任务名称"
              value={draft.name}
              onChange={(event) =>
                setDraft((value) => ({ ...value, name: event.target.value }))
              }
            />
            <Select
              value={draft.skillId}
              options={state.skills.map((skill) => ({
                label: skill.name,
                value: skill.id,
              }))}
              onChange={(value) =>
                setDraft((item) => ({ ...item, skillId: value }))
              }
            />
            <Select
              placeholder="写作模型"
              value={draft.modelId || undefined}
              options={state.models.map((model) => ({
                label: model.name,
                value: model.id,
              }))}
              onChange={(value) =>
                setDraft((item) => ({ ...item, modelId: value }))
              }
            />
            <Input.TextArea
              placeholder="每次运行的默认输入"
              value={draft.input}
              onChange={(event) =>
                setDraft((item) => ({ ...item, input: event.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label="2. 生成">
            <Alert
              type="info"
              showIcon
              message="运行时调用所选模型生成内容，并记录活动日志。"
            />
          </Form.Item>
          <Form.Item label="3. 发布目标">
            <Select
              value={draft.platformId}
              options={accountPlatforms.map((platform) => ({
                label: platform.name,
                value: platform.id,
              }))}
              onChange={(value) =>
                setDraft((item) => ({ ...item, platformId: value }))
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/** 热榜页面参数。 */
interface TrendWorkspaceProps {
  /** Ant Design 消息 API。 */
  messageApi: ReturnType<typeof message.useMessage>[0]
  /** 打开文章编辑器。 */
  onOpenArticle: (content: string) => void
}

/** 热榜条目。 */
interface TrendItem {
  /** 热榜标题。 */
  title: string
  /** 热榜链接。 */
  url: string
  /** 热榜热度文本。 */
  hot: string
}

/**
 * 热榜页面；按来源单独刷新并将条目复制或送入编辑器。
 */
function TrendWorkspace({ messageApi, onOpenArticle }: TrendWorkspaceProps) {
  // 当前来源，保存热榜筛选平台。
  const [sourceId, setSourceId] = useState(trendSources[0].id)
  // 热榜条目，保存主进程解析后的结构化结果。
  const [items, setItems] = useState<TrendItem[]>([])
  // 刷新状态，保存来源请求是否进行中。
  const [isRefreshing, setIsRefreshing] = useState(false)

  /** 刷新当前来源热榜。 */
  const refreshTrends = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      // 热榜结果，保存主进程从公开页面读取的结构化条目。
      const result = await window.visualMuseWorkspace?.fetchTrends(sourceId)
      setItems(result ?? [])
      if (!result?.length)
        messageApi.warning('当前来源没有可用条目，请稍后重试')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '热榜刷新失败')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <>
      <StudioHeader
        title="灵感 / 热榜"
        description="多来源热点聚合，复制条目作为写作素材"
        actions={
          <Button
            icon={<RefreshCw size={16} />}
            loading={isRefreshing}
            onClick={() => void refreshTrends()}
          >
            刷新
          </Button>
        }
      />
      <div className="studio-toolbar">
        <Select
          aria-label="热榜来源"
          value={sourceId}
          options={trendSources.map((source) => ({
            label: source.name,
            value: source.id,
          }))}
          onChange={setSourceId}
        />
      </div>
      {items.length === 0 ? (
        <Empty description="选择来源后刷新热榜" />
      ) : (
        <List
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="copy"
                  icon={<Copy size={16} />}
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      `${item.title}\n${item.url}`
                    )
                  }
                >
                  复制
                </Button>,
                <Button
                  key="write"
                  onClick={() =>
                    onOpenArticle(
                      `---\ntitle: ${item.title}\nsource_url: ${item.url}\n---\n\n# ${item.title}\n\n`
                    )
                  }
                >
                  写文章
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={<a href={item.url}>{item.title}</a>}
                description={item.hot}
              />
            </List.Item>
          )}
        />
      )}
    </>
  )
}

/** 账号页面附加参数。 */
interface AccountWorkspaceProps extends MutableStudioProps {
  /** Ant Design 消息 API。 */
  messageApi: ReturnType<typeof message.useMessage>[0]
}

/**
 * 账号与模型页面；管理平台持久登录窗口和 OpenAI 兼容模型配置。
 */
function AccountWorkspace({
  state,
  setState,
  messageApi,
}: AccountWorkspaceProps) {
  // 新模型弹窗状态，保存配置窗口是否打开。
  const [isAddingModel, setIsAddingModel] = useState(false)
  // 新模型表单，保存尚未提交的本地凭据。
  const [modelDraft, setModelDraft] = useState({
    name: '',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    mode: 'api' as const,
  })
  // 新账号平台，保存账号槽位弹窗当前目标平台。
  const [accountPlatformId, setAccountPlatformId] = useState<string | null>(
    null
  )
  // 新账号名称，保存用户对独立登录槽位的备注。
  const [accountName, setAccountName] = useState('')

  /** 打开平台登录窗口；`platformId` 是白名单平台标识，`accountId` 是独立槽位。 */
  const openLogin = async (
    platformId: string,
    accountId?: string
  ): Promise<void> => {
    await window.visualMuseWorkspace?.openAccountLogin(platformId, accountId)
    messageApi.info('请在应用登录窗口完成登录，关闭窗口后点击刷新状态')
  }
  /** 保存平台账号槽位。 */
  const saveAccount = (): void => {
    if (!accountPlatformId || !accountName.trim()) return
    setState((current) =>
      current
        ? {
            ...current,
            accounts: [
              ...current.accounts,
              {
                id: createStudioId('account'),
                platformId: accountPlatformId,
                name: accountName.trim(),
              },
            ],
          }
        : current
    )
    setAccountPlatformId(null)
    setAccountName('')
  }
  /** 保存模型配置。 */
  const saveModel = (): void => {
    if (!modelDraft.name.trim() || !modelDraft.model.trim()) return
    setState((current) =>
      current
        ? {
            ...current,
            models: [
              ...current.models,
              { id: createStudioId('model'), ...modelDraft },
            ],
          }
        : current
    )
    setIsAddingModel(false)
  }

  return (
    <>
      <StudioHeader
        title="账号与模型"
        description="平台多账号登录与写作模型授权"
      />
      <Tabs
        items={[
          {
            key: 'platforms',
            label: '发布平台',
            children: (
              <div className="item-grid">
                {accountPlatforms.map((platform) => (
                  <article className="studio-item" key={platform.id}>
                    <div className="item-actions">
                      <Typography.Title level={4}>
                        {platform.name}
                      </Typography.Title>
                      <Button
                        icon={<Plus size={16} />}
                        onClick={() => setAccountPlatformId(platform.id)}
                      >
                        新增账号
                      </Button>
                    </div>
                    {state.accounts.filter(
                      (account) => account.platformId === platform.id
                    ).length === 0 ? (
                      <Typography.Text type="secondary">
                        尚未添加账号槽位
                      </Typography.Text>
                    ) : (
                      state.accounts
                        .filter((account) => account.platformId === platform.id)
                        .map((account) => (
                          <div className="account-slot" key={account.id}>
                            <Typography.Text strong>
                              {account.name}
                            </Typography.Text>
                            <Space wrap>
                              <Button
                                icon={<ExternalLink size={16} />}
                                onClick={() =>
                                  void openLogin(platform.id, account.id)
                                }
                              >
                                登录 / 管理
                              </Button>
                              {platform.id === 'wechat' && (
                                <Button
                                  icon={<KeyRound size={16} />}
                                  onClick={() =>
                                    void window.visualMuseWorkspace?.openAccountSettings(
                                      platform.id,
                                      account.id
                                    )
                                  }
                                >
                                  API 凭据
                                </Button>
                              )}
                              <Button
                                icon={<RefreshCw size={16} />}
                                onClick={async () =>
                                  messageApi.info(
                                    (
                                      await window.visualMuseWorkspace?.checkAccount(
                                        platform.id,
                                        account.id
                                      )
                                    )?.message ?? '尚未登录'
                                  )
                                }
                              >
                                刷新
                              </Button>
                              <Button
                                danger
                                onClick={async () => {
                                  await window.visualMuseWorkspace?.logoutAccount(
                                    platform.id,
                                    account.id
                                  )
                                  setState((current) =>
                                    current
                                      ? {
                                          ...current,
                                          accounts: current.accounts.filter(
                                            (item) => item.id !== account.id
                                          ),
                                        }
                                      : current
                                  )
                                }}
                              >
                                登出并删除
                              </Button>
                            </Space>
                          </div>
                        ))
                    )}
                  </article>
                ))}
              </div>
            ),
          },
          {
            key: 'models',
            label: '写作模型',
            children: (
              <>
                <Button
                  type="primary"
                  icon={<Plus size={16} />}
                  onClick={() => setIsAddingModel(true)}
                >
                  添加模型
                </Button>
                <List
                  dataSource={state.models}
                  locale={{ emptyText: '尚未配置写作模型' }}
                  renderItem={(model) => (
                    <List.Item
                      actions={[
                        <Button
                          danger
                          key="delete"
                          icon={<Trash2 size={16} />}
                          onClick={() =>
                            setState((current) =>
                              current
                                ? {
                                    ...current,
                                    models: current.models.filter(
                                      (item) => item.id !== model.id
                                    ),
                                  }
                                : current
                            )
                          }
                        >
                          删除
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={model.name}
                        description={`${model.mode.toUpperCase()} · ${model.baseUrl} · ${model.model}`}
                      />
                    </List.Item>
                  )}
                />
              </>
            ),
          },
        ]}
      />
      <Modal
        title="新增平台账号"
        open={Boolean(accountPlatformId)}
        onCancel={() => setAccountPlatformId(null)}
        onOk={saveAccount}
      >
        <Input
          aria-label="账号名称"
          placeholder="例如：主账号"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
        />
      </Modal>
      <Modal
        title="添加写作模型"
        open={isAddingModel}
        onCancel={() => setIsAddingModel(false)}
        onOk={saveModel}
      >
        <Form layout="vertical">
          <Form.Item label="名称">
            <Input
              value={modelDraft.name}
              onChange={(event) =>
                setModelDraft((value) => ({
                  ...value,
                  name: event.target.value,
                }))
              }
            />
          </Form.Item>
          <Form.Item label="模式">
            <Segmented
              value={modelDraft.mode}
              options={[
                { label: 'API', value: 'api' },
                { label: 'WebView', value: 'webview' },
              ]}
              onChange={(value) =>
                setModelDraft((item) => ({ ...item, mode: value as 'api' }))
              }
            />
          </Form.Item>
          <Form.Item label="Base URL">
            <Input
              value={modelDraft.baseUrl}
              onChange={(event) =>
                setModelDraft((value) => ({
                  ...value,
                  baseUrl: event.target.value,
                }))
              }
            />
          </Form.Item>
          <Form.Item label="模型">
            <Input
              value={modelDraft.model}
              onChange={(event) =>
                setModelDraft((value) => ({
                  ...value,
                  model: event.target.value,
                }))
              }
            />
          </Form.Item>
          <Form.Item label="API Key">
            <Input.Password
              value={modelDraft.apiKey}
              onChange={(event) =>
                setModelDraft((value) => ({
                  ...value,
                  apiKey: event.target.value,
                }))
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/**
 * 素材库；管理封面、标签和已导出卡片索引。
 */
function AssetWorkspace({ state, setState }: MutableStudioProps) {
  // 新标签，保存尚未加入公共标签库的文本。
  const [tagName, setTagName] = useState('')
  /** 添加公共标签。 */
  const addTag = (): void => {
    if (!tagName.trim()) return
    setState((current) =>
      current
        ? {
            ...current,
            assets: [
              ...current.assets,
              {
                id: createStudioId('asset'),
                name: tagName.trim(),
                kind: 'tag',
                value: tagName.trim(),
                platformId: null,
                accountId: null,
              },
            ],
          }
        : current
    )
    setTagName('')
  }
  /** 导入图片素材并写入封面库。 */
  const importAssets = async (): Promise<void> => {
    // 选择路径，保存用户通过系统文件选择器授权的图片。
    const paths = await window.visualMuseWorkspace?.importAssets()
    if (!paths?.length) return
    setState((current) =>
      current
        ? {
            ...current,
            assets: [
              ...current.assets,
              ...paths.map((filePath) => ({
                id: createStudioId('asset'),
                name: filePath.split(/[\\/]/).pop() ?? '封面素材',
                kind: 'cover' as const,
                value: filePath,
                platformId: null,
                accountId: null,
              })),
            ],
          }
        : current
    )
  }
  /** 裁切公众号封面；`sourcePath` 是已导入的图片路径。 */
  const cropWechatCover = async (sourcePath: string): Promise<void> => {
    // 裁切结果，保存主进程输出的 900×383 PNG 路径。
    const result = await window.visualMuseWorkspace?.cropWechatCover(sourcePath)
    if (!result) return
    setState((current) =>
      current
        ? {
            ...current,
            assets: [
              ...current.assets,
              {
                id: createStudioId('asset'),
                name: `公众号封面 ${result.width}×${result.height}`,
                kind: 'cover',
                value: result.filePath,
                platformId: 'wechat',
                accountId: null,
              },
            ],
          }
        : current
    )
  }
  return (
    <>
      <StudioHeader
        title="素材库"
        description="全局封面、公共标签、账号素材和导出卡片归档"
        actions={
          <Button
            icon={<Upload size={16} />}
            onClick={() => void importAssets()}
          >
            导入素材
          </Button>
        }
      />
      <Tabs
        items={[
          {
            key: 'covers',
            label: '封面图',
            children: (
              <List
                dataSource={state.assets.filter(
                  (asset) => asset.kind === 'cover'
                )}
                locale={{ emptyText: '尚未导入封面图' }}
                renderItem={(asset) => (
                  <List.Item
                    actions={[
                      <Button
                        key="crop"
                        onClick={() => void cropWechatCover(asset.value)}
                      >
                        裁切 900×383
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={asset.name}
                      description={asset.value}
                    />
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: 'tags',
            label: '公共标签',
            children: (
              <>
                <Space.Compact>
                  <Input
                    placeholder="新增标签"
                    value={tagName}
                    onChange={(event) => setTagName(event.target.value)}
                  />
                  <Button icon={<Plus size={16} />} onClick={addTag}>
                    添加
                  </Button>
                </Space.Compact>
                <div className="tag-cloud">
                  {state.assets
                    .filter((asset) => asset.kind === 'tag')
                    .map((asset) => (
                      <Tag
                        closable
                        key={asset.id}
                        onClose={() =>
                          setState((current) =>
                            current
                              ? {
                                  ...current,
                                  assets: current.assets.filter(
                                    (item) => item.id !== asset.id
                                  ),
                                }
                              : current
                          )
                        }
                      >
                        {asset.name}
                      </Tag>
                    ))}
                </div>
              </>
            ),
          },
          {
            key: 'cards',
            label: '导出卡片',
            children: (
              <List
                dataSource={state.assets.filter(
                  (asset) => asset.kind === 'card'
                )}
                locale={{ emptyText: '尚未导出图文卡片' }}
                renderItem={(asset) => <List.Item>{asset.name}</List.Item>}
              />
            ),
          },
        ]}
      />
    </>
  )
}

/**
 * 数据页；展示时间范围统计、趋势进度和完整发布记录。
 */
function AnalyticsWorkspace({ state }: { state: StudioState }) {
  // 统计范围，保存最近天数或全部记录。
  const [days, setDays] = useState<number | null>(7)
  // 发布统计，保存当前范围内的总数与状态计数。
  const summary = summarizeActivities(state.activities, days)
  // 成功率，保存成功记录占全部记录的百分比。
  const successRate =
    summary.total === 0
      ? 0
      : Math.round((summary.success / summary.total) * 100)
  // 热力图日期，保存最近 35 天的发布活动数量。
  const heatmapDays = Array.from({ length: 35 }, (_, index) => {
    // 日期对象，保存从 34 天前到今天的单日边界。
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (34 - index))
    // 次日边界，保存单日活动筛选的结束时间。
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)
    // 活动数量，保存当前日期内发布记录数。
    const count = state.activities.filter((activity) => {
      const createdAt = new Date(activity.createdAt)
      return createdAt >= date && createdAt < nextDate
    }).length
    return { date: date.toLocaleDateString(), count }
  })

  return (
    <>
      <StudioHeader
        title="发布数据"
        description="发布概览、成功趋势和完整活动记录"
        actions={
          <Segmented
            value={days === null ? 'all' : String(days)}
            options={[
              { label: '7 天', value: '7' },
              { label: '14 天', value: '14' },
              { label: '30 天', value: '30' },
              { label: '全部', value: 'all' },
            ]}
            onChange={(value) =>
              setDays(value === 'all' ? null : Number(value))
            }
          />
        }
      />
      <div className="metric-strip">
        <Statistic title="全部" value={summary.total} />
        <Statistic title="成功" value={summary.success} />
        <Statistic title="草稿" value={summary.draft} />
        <Statistic title="失败" value={summary.failed} />
      </div>
      <section className="studio-section">
        <Typography.Title level={3}>成功率</Typography.Title>
        <Progress percent={successRate} />
        <Typography.Title level={3}>发布活动热力图</Typography.Title>
        <div className="activity-heatmap" aria-label="发布活动热力图">
          {heatmapDays.map((day) => (
            <Tooltip key={day.date} title={`${day.date} · ${day.count} 条`}>
              <span data-count={Math.min(day.count, 4)} />
            </Tooltip>
          ))}
        </div>
      </section>
      <Table
        rowKey="id"
        dataSource={state.activities}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            render: (value: string) => new Date(value).toLocaleString(),
          },
          { title: '标题', dataIndex: 'title' },
          { title: '平台', dataIndex: 'platformId' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => <Tag>{value}</Tag>,
          },
          { title: '说明', dataIndex: 'message' },
        ]}
      />
    </>
  )
}

/**
 * 设置页面；管理默认主题、同步开关、正式发布总控和缓存。
 */
function SettingsWorkspace({ state, setState }: MutableStudioProps) {
  // 草稿同步开关，保存是否允许平台适配器写入草稿。
  const [draftSyncEnabled, setDraftSyncEnabled] = useState(true)
  // 正式发布开关，保存是否允许平台适配器执行公开发布。
  const [formalPublishEnabled, setFormalPublishEnabled] = useState(false)
  /** 复制 MCP 客户端配置；`client` 表示 Cursor 或 Codex。 */
  const copyMcpConfig = async (client: 'cursor' | 'codex'): Promise<void> => {
    // MCP 配置，保存主进程根据当前安装路径生成的安全启动参数。
    const config = await window.visualMuseWorkspace?.getMcpConfig()
    if (!config) return
    // 配置文本，保存目标客户端对应的 JSON 或 TOML。
    const text = config[client]
    if (window.visualMuseDesktop) await window.visualMuseDesktop.copyText(text)
    else await navigator.clipboard.writeText(text)
  }
  return (
    <>
      <StudioHeader
        title="设置"
        description="默认主题、写作模型、平台传输与本地缓存"
      />
      <section className="studio-section">
        <Form layout="vertical">
          <Form.Item label="默认文章主题">
            <Select
              value={state.defaultArticleThemeId}
              options={state.themes
                .filter((theme) => theme.kind === 'article')
                .map((theme) => ({ label: theme.name, value: theme.id }))}
              onChange={(value) =>
                setState((current) =>
                  current
                    ? { ...current, defaultArticleThemeId: value }
                    : current
                )
              }
            />
          </Form.Item>
          <Form.Item label="默认图文主题">
            <Select
              value={state.defaultImageThemeId}
              options={state.themes
                .filter((theme) => theme.kind === 'image-text')
                .map((theme) => ({ label: theme.name, value: theme.id }))}
              onChange={(value) =>
                setState((current) =>
                  current ? { ...current, defaultImageThemeId: value } : current
                )
              }
            />
          </Form.Item>
          <Form.Item label="默认写作模型">
            <Select
              allowClear
              value={state.models[0]?.id}
              options={state.models.map((model) => ({
                label: model.name,
                value: model.id,
              }))}
            />
          </Form.Item>
          <Form.Item label="开启草稿同步">
            <Switch checked={draftSyncEnabled} onChange={setDraftSyncEnabled} />
          </Form.Item>
          <Form.Item label="开启正式发布" extra="关闭时所有适配器只能同步草稿">
            <Switch
              checked={formalPublishEnabled}
              onChange={setFormalPublishEnabled}
            />
          </Form.Item>
          <Form.Item label="MCP 自动化">
            <Space wrap>
              <Button onClick={() => void copyMcpConfig('cursor')}>
                复制 Cursor 配置
              </Button>
              <Button onClick={() => void copyMcpConfig('codex')}>
                复制 Codex 配置
              </Button>
            </Space>
          </Form.Item>
          <Button
            danger
            onClick={() => void window.visualMuseWorkspace?.clearCache()}
          >
            清空应用缓存
          </Button>
        </Form>
      </section>
    </>
  )
}

/**
 * 使用指南；覆盖文章明确列出的主要上手路径。
 */
function GuideWorkspace() {
  return (
    <>
      <StudioHeader title="使用指南" description="从账号登录到固定发布流水线" />
      <div className="guide-grid">
        <section>
          <Typography.Title level={3}>文章工作流</Typography.Title>
          <ol>
            <li>在账号与模型中登录平台</li>
            <li>收藏文章主题和写作 Skill</li>
            <li>在文章编辑器完成长稿</li>
            <li>发布预检后同步草稿箱</li>
          </ol>
        </section>
        <section>
          <Typography.Title level={3}>图文工作流</Typography.Title>
          <ol>
            <li>选择单卡、自动分卡或 --- 手动分卡</li>
            <li>选择图文主题和尺寸</li>
            <li>检查手机壳与封面流预览</li>
            <li>导出 PNG 或同步图文草稿</li>
          </ol>
        </section>
        <section>
          <Typography.Title level={3}>自动任务</Typography.Title>
          <ol>
            <li>选择 Skill 和模型</li>
            <li>配置默认输入</li>
            <li>检查生成结果</li>
            <li>选择账号发布或进入编辑器修改</li>
          </ol>
        </section>
      </div>
    </>
  )
}
