import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as z from 'zod/v4'

/** MCP 工作区状态；只声明工具读写所需的稳定字段。 */
interface McpWorkspaceState {
  /** 当前文稿标识。 */
  activeDocumentId: string
  /** 文稿列表。 */
  documents: Array<Record<string, unknown>>
  /** Skill 列表。 */
  skills: Array<Record<string, unknown>>
  /** 主题列表。 */
  themes: Array<Record<string, unknown>>
  /** 图文定稿 Markdown。 */
  imageTextDraft?: Record<string, unknown>
  /** 其它桌面端状态字段。 */
  [key: string]: unknown
}

/** 文章定稿规范；用于工具、Prompt 和 Resource 共用。 */
const articleSpec =
  '文章使用 Markdown。建议包含 YAML frontmatter：title、cover、author、source_url。正文必须有清晰标题层级，发布前核对事实、链接和图片。'

/** 图文定稿规范；明确卡片和话题约束。 */
const imageTextSpec =
  '图文 content 使用独立行的 --- 分隔卡片，至少 4 张卡；title 必填，digest 建议 80-100 字，tags 必须恰好 3 个且不要包含 #。'

/** Skill 规范；明确个人模板的最小文件内容。 */
const skillSpec =
  'Skill 必须包含唯一 name、category 和非空 prompt；prompt 相当于 SKILL.md 正文，应说明任务、输入、约束和输出。'

/** 主题规范；明确个人主题可编辑字段。 */
const themeSpec =
  '个人主题包含 name、kind、accent、background、foreground。kind 只能是 article 或 image-text；市场主题只读，修改请先保存为个人主题。'

/** MCP Server 实例；向 Codex、Cursor 和 Claude Desktop暴露本地创作数据。 */
export const mcpServer = new McpServer({
  name: 'visual-muse',
  version: '1.0.0',
})

/** 工作区写入队列；串行化并发工具调用，避免相互覆盖 JSON。 */
let workspaceMutationQueue: Promise<void> = Promise.resolve()

/**
 * 获取 Visual Muse 数据目录；无参数，优先使用显式环境变量。
 */
function getDataDirectory(): string {
  // 显式数据目录，保存桌面端复制到 MCP 配置中的绝对路径。
  const configuredDirectory = process.env.VISUAL_MUSE_DATA_DIR?.trim()
  if (configuredDirectory) return path.resolve(configuredDirectory)
  // 默认数据目录，保存 macOS/Linux/Windows 开发环境的可预测位置。
  return path.join(os.homedir(), '.visual-muse')
}

/**
 * 获取工作区文件；无参数，返回桌面端共用 JSON 路径。
 */
function getWorkspacePath(): string {
  return path.join(getDataDirectory(), 'visual-muse-workspace.json')
}

/**
 * 创建最小工作区；无参数，用于 MCP 在桌面应用首次启动前安全工作。
 */
function createEmptyWorkspace(): McpWorkspaceState {
  return {
    activeDocumentId: '',
    documents: [],
    skills: [],
    themes: [],
    imageTextDraft: {},
  }
}

/**
 * 读取工作区；无参数，返回结构经过基础校验的 JSON。
 */
async function readWorkspace(): Promise<McpWorkspaceState> {
  try {
    // JSON 原文，保存磁盘中的 Visual Muse 工作区。
    const rawState = await fs.readFile(getWorkspacePath(), 'utf-8')
    // 解析状态，保存待验证的未知 JSON。
    const parsedState = JSON.parse(rawState) as unknown
    if (!parsedState || typeof parsedState !== 'object')
      return createEmptyWorkspace()
    // 工作区字段，保存通过对象收窄的可访问状态。
    const state = parsedState as Record<string, unknown>
    return {
      ...state,
      activeDocumentId:
        typeof state.activeDocumentId === 'string'
          ? state.activeDocumentId
          : '',
      documents: Array.isArray(state.documents)
        ? (state.documents.filter(
            (item) => item && typeof item === 'object'
          ) as Array<Record<string, unknown>>)
        : [],
      skills: Array.isArray(state.skills)
        ? (state.skills.filter(
            (item) => item && typeof item === 'object'
          ) as Array<Record<string, unknown>>)
        : [],
      themes: Array.isArray(state.themes)
        ? (state.themes.filter(
            (item) => item && typeof item === 'object'
          ) as Array<Record<string, unknown>>)
        : [],
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return createEmptyWorkspace()
    throw error
  }
}

/**
 * 原子写入工作区；`state` 是更新后的完整 JSON。
 */
async function writeWorkspace(state: McpWorkspaceState): Promise<void> {
  // 工作区路径，保存目标 JSON 的绝对路径。
  const workspacePath = getWorkspacePath()
  // 临时路径，保存同目录原子替换使用的文件。
  const temporaryPath = `${workspacePath}.tmp`
  await fs.mkdir(path.dirname(workspacePath), { recursive: true })
  await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf-8')
  await fs.rename(temporaryPath, workspacePath)
}

/**
 * 串行更新工作区；`mutate` 接收当前状态并返回下一状态。
 */
async function updateWorkspace(
  mutate: (state: McpWorkspaceState) => McpWorkspaceState
): Promise<McpWorkspaceState> {
  // 更新后的状态 Promise，保存当前调用需要返回的工作区。
  let updatedStatePromise: Promise<McpWorkspaceState> | undefined
  workspaceMutationQueue = workspaceMutationQueue.then(() => {
    updatedStatePromise = readWorkspace().then(async (state) => {
      // 下一状态，保存工具回调对工作区应用的变更。
      const nextState = mutate(state)
      await writeWorkspace(nextState)
      return nextState
    })
    return updatedStatePromise.then(() => undefined)
  })
  await workspaceMutationQueue
  if (!updatedStatePromise) throw new Error('工作区更新未启动')
  return updatedStatePromise
}

/**
 * 创建 MCP 文本结果；`value` 是字符串或可 JSON 序列化对象。
 */
function textResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text:
          typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  }
}

/**
 * 生成本地唯一标识；`prefix` 是对象类型前缀。
 */
function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 查找指定类型主题；`state` 是工作区，`kind` 是文章或图文，`id` 是主题标识。
 */
function findTheme(
  state: McpWorkspaceState,
  kind: 'article' | 'image-text',
  id: string
): Record<string, unknown> | null {
  return (
    state.themes.find((theme) => theme.id === id && theme.kind === kind) ?? null
  )
}

/**
 * 注册只读规范工具；`name` 是工具名，`description` 是说明，`spec` 是规范正文。
 */
function registerSpecTool(
  name: string,
  description: string,
  spec: string
): void {
  mcpServer.registerTool(name, { description }, async () => textResult(spec))
}

registerSpecTool(
  'get_article_spec',
  '读取 Visual Muse 文章定稿规范',
  articleSpec
)
registerSpecTool(
  'get_image_text_spec',
  '读取 Visual Muse 图文定稿规范',
  imageTextSpec
)
registerSpecTool('get_skill_spec', '读取 Visual Muse Skill 编写规范', skillSpec)
registerSpecTool('get_theme_spec', '读取 Visual Muse 个人主题规范', themeSpec)

mcpServer.registerTool(
  'get_article_draft',
  { description: '读取当前文章定稿' },
  async () => {
    // 工作区，保存桌面端当前文稿列表和活动标识。
    const state = await readWorkspace()
    return textResult(
      state.documents.find(
        (document) => document.id === state.activeDocumentId
      ) ??
        state.documents[0] ??
        null
    )
  }
)

mcpServer.registerTool(
  'save_article_draft',
  {
    description: '新建或更新当前文章定稿',
    inputSchema: {
      title: z.string().min(1),
      content: z.string().min(1),
      documentId: z.string().optional(),
    },
  },
  async ({ title, content, documentId }) => {
    // 文稿标识，保存调用方指定或新生成的 ID。
    const targetId = documentId ?? createId('document')
    // 更新时间，保存本次 MCP 写入时间。
    const updatedAt = new Date().toISOString()
    // 更新状态，保存写入后的工作区。
    const state = await updateWorkspace((current) => {
      // 是否已有文稿，保存本次调用的新增或更新分支。
      const exists = current.documents.some(
        (document) => document.id === targetId
      )
      // 目标文稿，保存与桌面端兼容的字段。
      const document = {
        id: targetId,
        title,
        content,
        folderId: null,
        updatedAt,
        versions: [],
      }
      return {
        ...current,
        activeDocumentId: targetId,
        documents: exists
          ? current.documents.map((item) =>
              item.id === targetId ? { ...item, ...document } : item
            )
          : [...current.documents, document],
      }
    })
    return textResult(
      state.documents.find((document) => document.id === targetId)
    )
  }
)

mcpServer.registerTool(
  'get_image_text_draft',
  { description: '读取当前图文定稿' },
  async () => textResult((await readWorkspace()).imageTextDraft ?? null)
)

mcpServer.registerTool(
  'save_image_text_draft',
  {
    description: '保存图文定稿，content 至少包含 4 张卡片，tags 恰好 3 个',
    inputSchema: {
      title: z.string().min(1),
      digest: z.string().min(1),
      content: z.string().min(1),
      tags: z.array(z.string().min(1)).length(3),
    },
  },
  async ({ title, digest, content, tags }) => {
    // 卡片列表，保存按独立行 --- 拆分的非空图文卡片。
    const cards = content
      .split(/^\s*---\s*$/m)
      .map((card) => card.trim())
      .filter(Boolean)
    if (cards.length < 4) throw new Error('图文 content 至少需要 4 张卡片')
    // 图文定稿，保存与桌面编辑器共用的数据对象。
    const imageTextDraft = {
      title,
      digest,
      content,
      tags,
      updatedAt: new Date().toISOString(),
    }
    await updateWorkspace((state) => ({ ...state, imageTextDraft }))
    return textResult(imageTextDraft)
  }
)

mcpServer.registerTool(
  'list_workspace_skills',
  { description: '列出市场与个人 Skill' },
  async () =>
    textResult(
      (await readWorkspace()).skills.map(
        ({ id, name, category, personal, favorite }) => ({
          id,
          name,
          category,
          personal,
          favorite,
        })
      )
    )
)

mcpServer.registerTool(
  'get_skill_pack',
  {
    description: '读取指定 Skill 完整提示词',
    inputSchema: { skillId: z.string().min(1) },
  },
  async ({ skillId }) =>
    textResult(
      (await readWorkspace()).skills.find((skill) => skill.id === skillId) ??
        null
    )
)

mcpServer.registerTool(
  'save_workspace_skill',
  {
    description: '新建个人 Skill',
    inputSchema: {
      name: z.string().min(1),
      category: z.string().min(1),
      prompt: z.string().min(1),
    },
  },
  async ({ name, category, prompt }) => {
    // Skill 对象，保存新建个人模板。
    const skill = {
      id: createId('skill'),
      name,
      category,
      prompt,
      personal: true,
      favorite: true,
    }
    await updateWorkspace((state) => ({
      ...state,
      skills: [...state.skills, skill],
    }))
    return textResult(skill)
  }
)

mcpServer.registerTool(
  'remove_workspace_skill',
  {
    description: '删除个人 Skill，市场 Skill 不允许删除',
    inputSchema: { skillId: z.string().min(1) },
  },
  async ({ skillId }) => {
    // 当前状态，保存删除前的 Skill 列表。
    const current = await readWorkspace()
    // 目标 Skill，保存权限判断使用的对象。
    const skill = current.skills.find((item) => item.id === skillId)
    if (!skill || skill.personal !== true)
      throw new Error('只能删除存在的个人 Skill')
    await updateWorkspace((state) => ({
      ...state,
      skills: state.skills.filter((item) => item.id !== skillId),
    }))
    return textResult({ removed: true, skillId })
  }
)

/**
 * 注册主题列表与读取工具；`kind` 是文章或图文主题。
 */
function registerThemeReadTools(kind: 'article' | 'image-text'): void {
  // 工具前缀，保存文章与图文命名差异。
  const prefix = kind === 'article' ? 'article' : 'image'
  mcpServer.registerTool(
    `list_${prefix}_themes`,
    { description: `列出${kind === 'article' ? '文章' : '图文'}主题` },
    async () =>
      textResult(
        (await readWorkspace()).themes.filter((theme) => theme.kind === kind)
      )
  )
  mcpServer.registerTool(
    `get_${prefix}_theme`,
    {
      description: `读取指定${kind === 'article' ? '文章' : '图文'}主题`,
      inputSchema: { themeId: z.string().min(1) },
    },
    async ({ themeId }) =>
      textResult(findTheme(await readWorkspace(), kind, themeId))
  )
}

/**
 * 注册个人主题保存与更新工具；`kind` 是文章或图文主题。
 */
function registerThemeWriteTools(kind: 'article' | 'image-text'): void {
  // 工具前缀，保存文章与图文命名差异。
  const prefix = kind === 'article' ? 'article' : 'image'
  // 主题输入，保存两类主题共用的配色校验。
  const inputSchema = {
    name: z.string().min(1),
    accent: z.string().min(1),
    background: z.string().min(1),
    foreground: z.string().min(1),
  }
  mcpServer.registerTool(
    `save_personal_${prefix}_theme`,
    {
      description: `新建个人${kind === 'article' ? '文章' : '图文'}主题`,
      inputSchema,
    },
    async ({ name, accent, background, foreground }) => {
      // 个人主题，保存新建主题对象。
      const theme = {
        id: createId('theme'),
        name,
        kind,
        accent,
        background,
        foreground,
        personal: true,
        favorite: true,
      }
      await updateWorkspace((state) => ({
        ...state,
        themes: [...state.themes, theme],
      }))
      return textResult(theme)
    }
  )
  mcpServer.registerTool(
    `update_personal_${prefix}_theme`,
    {
      description: `更新个人${kind === 'article' ? '文章' : '图文'}主题`,
      inputSchema: { themeId: z.string().min(1), ...inputSchema },
    },
    async ({ themeId, name, accent, background, foreground }) => {
      // 当前状态，保存更新权限判断所需主题。
      const current = await readWorkspace()
      // 目标主题，保存个人主题校验对象。
      const existing = findTheme(current, kind, themeId)
      if (!existing || existing.personal !== true)
        throw new Error('只能更新存在的个人主题')
      // 更新字段，保存最终主题属性。
      const patch = { name, accent, background, foreground }
      // 更新状态，保存修改后的工作区。
      const state = await updateWorkspace((workspace) => ({
        ...workspace,
        themes: workspace.themes.map((theme) =>
          theme.id === themeId ? { ...theme, ...patch } : theme
        ),
      }))
      return textResult(findTheme(state, kind, themeId))
    }
  )
}

registerThemeReadTools('article')
registerThemeReadTools('image-text')
registerThemeWriteTools('article')
registerThemeWriteTools('image-text')

mcpServer.registerPrompt(
  '写文章',
  {
    description: '按 Visual Muse 文章规范创建可直接预览的 Markdown',
    argsSchema: { topic: z.string().min(1) },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${articleSpec}\n\n请围绕“${topic}”写作。事实不确定处明确标记待核实，完成后调用 save_article_draft。`,
        },
      },
    ],
  })
)

mcpServer.registerPrompt(
  '做图文',
  {
    description: '按 Visual Muse 图文规范创建分卡内容',
    argsSchema: { topic: z.string().min(1) },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${imageTextSpec}\n\n请围绕“${topic}”生成图文，完成后调用 save_image_text_draft。`,
        },
      },
    ],
  })
)

mcpServer.registerResource(
  'article-spec',
  'visualmuse://spec/article',
  { title: '文章规范', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, text: articleSpec }] })
)
mcpServer.registerResource(
  'image-text-spec',
  'visualmuse://spec/image-text',
  { title: '图文规范', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, text: imageTextSpec }] })
)
mcpServer.registerResource(
  'skill-spec',
  'visualmuse://spec/skill',
  { title: 'Skill 规范', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, text: skillSpec }] })
)
mcpServer.registerResource(
  'theme-spec',
  'visualmuse://spec/theme',
  { title: '主题规范', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, text: themeSpec }] })
)

/**
 * 启动 stdio MCP Server；无参数，保持 stdout 仅用于协议消息。
 */
export async function startMcpServer(): Promise<void> {
  // stdio 传输，保存本地 AI 客户端与 Visual Muse 的协议连接。
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
}

// 业务场景：作为独立 CLI 入口执行时立即连接 stdio，导入测试时不自动占用进程输入输出。
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void startMcpServer().catch((error: unknown) => {
    // 错误文本只写 stderr，避免污染 MCP stdio 协议帧。
    console.error(
      error instanceof Error ? error.message : 'Visual Muse MCP 启动失败'
    )
    process.exitCode = 1
  })
}
