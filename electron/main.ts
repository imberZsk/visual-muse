import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  session,
  shell,
} from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { loadAutoUpdater } from './appUpdater.js'
import {
  PlatformPublisher,
  realPublisherUrlMap,
  type RealPublishPlatformId,
} from './platformPublisher.js'
import {
  protectPublisherState,
  protectWorkspaceState,
  restorePublisherState,
  restoreWorkspaceState,
} from './secureState.js'

/** 本地状态文件名，用于保存主题和发布配置。 */
const stateFileName = 'visual-muse-state.json'
/** DEVELOPMENT_APP_ICON_PATH 存储开发态窗口和 macOS Dock 使用的高清项目图标路径。 */
const DEVELOPMENT_APP_ICON_PATH = fileURLToPath(
  new URL('../build/icon.png', import.meta.url)
)
/** 是否正在执行必须隐藏窗口的 Playwright Electron 测试。 */
const isE2E = process.env.VISUAL_MUSE_E2E === '1'
/** 平台发布窗口使用的持久会话分区前缀。 */
const publisherSessionPartitionPrefix = 'persist:visual-muse-publisher-'

/** 功能工作区文件名，用于独立保存文稿、主题、Skill、任务和素材索引。 */
const workspaceFileName = 'visual-muse-workspace.json'

/** 图文导出目录名，用于保存分卡 PNG。 */
const imageCardOutputDirectory = 'xhs-cards'

/** 本地内容目录绑定文件名，只保存用户通过系统选择器授权的目录。 */
const contentDirectoryFileName = 'visual-muse-content-directory.txt'

/** JSON 文件写入队列；按目标路径串行化并发保存，避免旧状态覆盖新状态。 */
const jsonWriteQueues = new Map<string, Promise<void>>()

/** 安装包是否已完整下载，用于阻止提前安装。 */
let updateDownloaded = false
/** 正在执行的下载任务，用于合并重复点击。 */
let updateDownloadPromise: Promise<{ downloaded: boolean }> | null = null
/** 打包环境的更新器；模块导出异常时为空且不阻断应用启动。 */
const autoUpdater = await loadAutoUpdater(
  () => import('electron-updater'),
  app.isPackaged
)

/** 平台创作入口白名单，用于限制渲染进程只能打开已审核的 HTTPS 地址。 */
const publisherUrlMap: Record<string, string> = {
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

/** 平台登录检测域名，用于检查对应持久会话是否至少建立过站点登录数据。 */
const accountDomainMap: Record<string, string> = {
  wechat: 'mp.weixin.qq.com',
  zhihu: 'zhihu.com',
  weibo: 'weibo.com',
  xiaohongshu: 'xiaohongshu.com',
  bilibili: 'bilibili.com',
  juejin: 'juejin.cn',
  csdn: 'csdn.net',
  yuque: 'yuque.com',
  toutiao: 'toutiao.com',
  baijiahao: 'baidu.com',
}

/** 热榜 API 白名单；返回值由来源对应解析器转换为统一条目。 */
const trendUrlMap: Record<string, string> = {
  zhihu: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
  bilibili:
    'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all',
  weibo: 'https://weibo.com/ajax/side/hotSearch',
  '36kr': 'https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot',
  huxiu: 'https://www.huxiu.com/moment',
}

/**
 * 构建平台账号 partition；`platformId` 和 `accountId` 组成相互隔离的持久会话键。
 */
function getAccountPartition(platformId: string, accountId?: string): string {
  // 安全平台标识，保存去除非字母数字短横线后的白名单键。
  const safePlatformId = platformId.replace(/[^a-z0-9-]/gi, '')
  // 安全账号标识，保存独立槽位键；未指定时兼容默认账号会话。
  const safeAccountId = accountId?.replace(/[^a-z0-9_-]/gi, '') || 'default'
  return `persist:visual-muse-${safePlatformId}-${safeAccountId}`
}

/** E2E 平台页面使用的最小编辑器 HTML，避免测试访问真实平台或显示窗口。 */
const publisherE2EHtmlMap: Record<RealPublishPlatformId, string> = {
  xiaohongshu:
    '<!doctype html><input placeholder="输入标题"><div contenteditable="true" role="textbox"></div>',
  juejin:
    '<!doctype html><input placeholder="输入文章标题..."><div class="CodeMirror"><textarea></textarea></div>',
  wechat:
    '<!doctype html><textarea placeholder="请在这里输入标题"></textarea><div contenteditable="true" role="textbox"></div>',
}

/** 构建 E2E 本地编辑器地址；`html` 是不会访问外网的静态页面内容。 */
function buildPublisherE2EUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/** 发布入口表，E2E 使用本地页面，真实应用仅访问平台白名单。 */
const activePublisherUrlMap: Record<RealPublishPlatformId, string> = isE2E
  ? {
      xiaohongshu: buildPublisherE2EUrl(publisherE2EHtmlMap.xiaohongshu),
      juejin: buildPublisherE2EUrl(publisherE2EHtmlMap.juejin),
      wechat: buildPublisherE2EUrl(publisherE2EHtmlMap.wechat),
    }
  : realPublisherUrlMap

/** 平台发布管理器，负责复用登录会话并自动填充官方编辑器。 */
const platformPublisher = new PlatformPublisher(
  ({ platformId }) => {
    // 平台发布窗口，保存隔离于主工作台的官方创作页面。
    const publisherWindow = new BrowserWindow({
      width: 1280,
      height: 900,
      minWidth: 960,
      minHeight: 680,
      show: !isE2E,
      title: `Visual Muse - ${platformId}`,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: `${publisherSessionPartitionPrefix}${platformId}`,
      },
    })

    return publisherWindow
  },
  activePublisherUrlMap,
  !isE2E
)
/** 主工作台窗口，供 macOS Dock 激活时区分平台编辑窗口与产品主窗口。 */
let mainWindow: BrowserWindow | null = null

/**
 * 获取状态文件路径；无参数，返回 Electron userData 目录下的 JSON 文件路径。
 */
function getStateFilePath(): string {
  // 用户数据目录路径，保存 Electron 为当前应用分配的本地数据目录。
  const userDataPath = app.getPath('userData')

  return path.join(userDataPath, stateFileName)
}

/**
 * 获取功能工作区文件路径；无参数，返回 userData 下的独立 JSON 文件。
 */
function getWorkspaceFilePath(): string {
  // 用户数据目录，保存 Electron 为 Visual Muse 分配的持久化位置。
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, workspaceFileName)
}

/**
 * 获取内容目录绑定文件路径；无参数，返回 userData 下的授权记录文件。
 */
function getContentDirectoryFilePath(): string {
  // 用户数据目录，保存应用私有配置位置。
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, contentDirectoryFileName)
}

/**
 * 读取 JSON 文件；`filePath` 是已限定在应用目录中的目标路径。
 */
async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    // JSON 原文，保存磁盘读取到的 UTF-8 内容。
    const rawContent = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(rawContent) as unknown
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
}

/**
 * 原子写入 JSON 文件；`filePath` 是目标路径，`value` 是可序列化工作区数据。
 */
async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  // 前序写入，保存同一文件尚未完成的写操作。
  const previousWrite = jsonWriteQueues.get(filePath) ?? Promise.resolve()
  // 当前写入，保存排在前序操作之后的原子落盘流程。
  const currentWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      // 目标目录，保存 JSON 文件所在的应用数据目录。
      const targetDirectory = path.dirname(filePath)
      // 唯一临时文件路径，避免并发保存互相移动同一个 `.tmp` 文件。
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
      await fs.mkdir(targetDirectory, { recursive: true })
      try {
        await fs.writeFile(
          temporaryPath,
          JSON.stringify(value, null, 2),
          'utf-8'
        )
        await fs.rename(temporaryPath, filePath)
      } catch (error) {
        await fs.rm(temporaryPath, { force: true })
        throw error
      }
    })
  jsonWriteQueues.set(filePath, currentWrite)
  try {
    await currentWrite
  } finally {
    // 业务场景：仅清理仍指向当前任务的队列，避免误删后来追加的写入。
    if (jsonWriteQueues.get(filePath) === currentWrite)
      jsonWriteQueues.delete(filePath)
  }
}

/**
 * 读取本地状态；无参数，返回保存过的主题和发布配置。
 */
async function readStoredState(): Promise<unknown | null> {
  // 状态文件路径，保存本地 JSON 状态的位置。
  const stateFilePath = getStateFilePath()

  try {
    // 状态文件内容，保存从磁盘读取到的 JSON 字符串。
    const rawState = await fs.readFile(stateFilePath, 'utf-8')

    // 磁盘状态，保存解析后且尚未解密的发布配置。
    const storedState = JSON.parse(rawState) as unknown
    return restorePublisherState(storedState, safeStorage)
  } catch (error) {
    // 业务场景：第一次启动没有状态文件，应返回空状态而不是报错。
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

/**
 * 校验外部 HTTP 地址；`rawUrl` 是模型接口地址，仅允许 HTTPS 和本机 HTTP。
 */
function validateServiceUrl(rawUrl: string): URL {
  // 解析后的地址，保存标准 URL 对象供协议和主机检查。
  const serviceUrl = new URL(rawUrl)
  // 是否本机地址，保存开发模型服务允许使用 HTTP 的例外。
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(
    serviceUrl.hostname
  )
  if (
    serviceUrl.protocol !== 'https:' &&
    !(serviceUrl.protocol === 'http:' && isLocalhost)
  ) {
    throw new Error('模型地址必须使用 HTTPS，本机服务可使用 HTTP')
  }
  return serviceUrl
}

/**
 * 将模型 Base URL 拼成聊天补全地址；`baseUrl` 是 OpenAI 兼容服务根地址。
 */
function buildChatCompletionUrl(baseUrl: string): string {
  // 服务地址，保存校验后的模型 Base URL。
  const serviceUrl = validateServiceUrl(baseUrl)
  // 规范路径，保存去掉末尾斜线后的 API 根路径。
  const normalizedPath = serviceUrl.pathname.replace(/\/$/, '')
  serviceUrl.pathname = normalizedPath.endsWith('/chat/completions')
    ? normalizedPath
    : `${normalizedPath}/chat/completions`
  return serviceUrl.toString()
}

/**
 * 解析热榜响应；`sourceId` 是来源标识，`payload` 是远端 JSON。
 */
function parseTrendPayload(
  sourceId: string,
  payload: unknown
): Array<{ title: string; url: string; hot: string }> {
  if (!payload || typeof payload !== 'object') return []
  // 远端对象，保存来源 JSON 的可选字段访问入口。
  const data = payload as Record<string, unknown>

  if (sourceId === 'zhihu') {
    // 知乎条目，保存 API data 数组。
    const items = Array.isArray(data.data) ? data.data : []
    return items.slice(0, 30).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      // 热榜目标，保存问题标题和 URL 所在对象。
      const target = (item as Record<string, unknown>).target
      if (!target || typeof target !== 'object') return []
      // 目标字段，保存安全读取后的标题、链接和热度。
      const targetData = target as Record<string, unknown>
      return typeof targetData.title === 'string'
        ? [
            {
              title: targetData.title,
              url:
                typeof targetData.url === 'string'
                  ? targetData.url
                  : 'https://www.zhihu.com/hot',
              hot: String((item as Record<string, unknown>).detail_text ?? ''),
            },
          ]
        : []
    })
  }

  if (sourceId === 'bilibili') {
    // B 站列表，保存 data.list 下的排行视频。
    const list =
      data.data &&
      typeof data.data === 'object' &&
      Array.isArray((data.data as Record<string, unknown>).list)
        ? ((data.data as Record<string, unknown>).list as unknown[])
        : []
    return list.slice(0, 30).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      // 视频字段，保存标题、BV 号和播放量。
      const video = item as Record<string, unknown>
      return typeof video.title === 'string' && typeof video.bvid === 'string'
        ? [
            {
              title: video.title,
              url: `https://www.bilibili.com/video/${video.bvid}`,
              hot: String(
                (video.stat as Record<string, unknown> | undefined)?.view ?? ''
              ),
            },
          ]
        : []
    })
  }

  if (sourceId === 'weibo') {
    // 微博热搜列表，保存 data.realtime 下的词条。
    const realtime =
      data.data &&
      typeof data.data === 'object' &&
      Array.isArray((data.data as Record<string, unknown>).realtime)
        ? ((data.data as Record<string, unknown>).realtime as unknown[])
        : []
    return realtime.slice(0, 30).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      // 热搜字段，保存关键词和热度。
      const trend = item as Record<string, unknown>
      return typeof trend.word === 'string'
        ? [
            {
              title: trend.word,
              url: `https://s.weibo.com/weibo?q=${encodeURIComponent(trend.word)}`,
              hot: String(trend.num ?? ''),
            },
          ]
        : []
    })
  }

  return []
}

/**
 * 转义 HTML；`value` 是需要写入隐藏导出窗口的卡片正文。
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
 * 生成安全文件名；`value` 是用户文章标题。
 */
function createSafeFileName(value: string): string {
  // 无控制字符标题，保存把不可见字符替换为短横线后的文本。
  const printableValue = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character
  ).join('')
  // 清理后的文件名，保存移除跨平台非法字符与尾部空格后的文本。
  const safeName = printableValue
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
  return safeName || '未命名文章'
}

/**
 * 构建文章 HTML；`title` 是标题，`markdown` 是正文，`includeDocument` 控制完整文档壳。
 */
function renderArticleHtml(
  title: string,
  markdown: string,
  includeDocument: boolean
): string {
  // 正文 HTML，保存 marked 对 Markdown 的结构化渲染结果。
  const articleBody = marked.parse(markdown) as string
  if (!includeDocument) return articleBody
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;color:#202322;font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}img{max-width:100%}pre{padding:16px;overflow:auto;background:#f4f4f2}blockquote{margin:18px 0;padding:8px 16px;border-left:3px solid #2f6f61;background:#f5f7f6}</style></head><body>${articleBody}</body></html>`
}

/**
 * 递归读取绑定目录中的 Markdown；`directoryPath` 是用户授权目录。
 */
async function readMarkdownDirectory(directoryPath: string): Promise<
  Array<{
    id: string
    title: string
    folderId: string | null
    content: string
    updatedAt: string
    versions: unknown[]
    filePath: string
  }>
> {
  // 目录项，保存当前层文件和子目录信息。
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  // 文稿结果，保存当前目录及子目录读取到的 Markdown。
  const documents: Array<{
    id: string
    title: string
    folderId: string | null
    content: string
    updatedAt: string
    versions: unknown[]
    filePath: string
  }> = []
  for (const entry of entries) {
    // 绝对路径，保存当前目录项的安全 path.join 结果。
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      documents.push(...(await readMarkdownDirectory(entryPath)))
      continue
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md')
      continue
    // Markdown 正文，保存磁盘文件的 UTF-8 内容。
    const content = await fs.readFile(entryPath, 'utf-8')
    // 文件信息，保存更新时间用于双向同步冲突判断。
    const stat = await fs.stat(entryPath)
    documents.push({
      id: `file_${Buffer.from(entryPath).toString('base64url')}`,
      title: path.basename(entry.name, path.extname(entry.name)),
      folderId: null,
      content,
      updatedAt: stat.mtime.toISOString(),
      versions: [],
      filePath: entryPath,
    })
  }
  return documents
}

/**
 * 导出图文卡片；`cards` 是 Markdown 卡片，`theme` 是预览颜色配置。
 */
async function exportImageCards(
  cards: string[],
  theme: unknown
): Promise<{ count: number; directory: string }> {
  if (
    !Array.isArray(cards) ||
    cards.length === 0 ||
    cards.some((card) => typeof card !== 'string')
  )
    throw new Error('没有可导出的图文卡片')
  // 主题字段，保存经过类型收窄后的配色值。
  const themeData =
    theme && typeof theme === 'object' ? (theme as Record<string, unknown>) : {}
  // 输出目录，保存用户文档目录下的固定卡片路径。
  const outputDirectory = path.join(
    app.getPath('documents'),
    'Visual Muse',
    'output',
    imageCardOutputDirectory
  )
  await fs.mkdir(outputDirectory, { recursive: true })

  for (const [index, card] of cards.entries()) {
    // 隐藏导出窗口，使用 Chromium 排版与 capturePage 生成真实 PNG。
    const exportWindow = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    // 卡片 HTML，保存固定画布、主题颜色和安全转义后的正文。
    const cardHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:900px;height:1200px;overflow:hidden}body{box-sizing:border-box;padding:84px;background:${String(themeData.background ?? '#ffffff')};color:${String(themeData.foreground ?? '#202322')};border:18px solid ${String(themeData.accent ?? '#2f6f61')};font:32px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:pre-wrap;word-break:break-word}</style><body>${escapeHtml(card)}</body>`
    await exportWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(cardHtml)}`
    )
    // PNG 图像，保存隐藏窗口完整画布截图。
    const image = await exportWindow.webContents.capturePage()
    await fs.writeFile(
      path.join(
        outputDirectory,
        `card-${String(index + 1).padStart(2, '0')}.png`
      ),
      image.toPNG()
    )
    exportWindow.destroy()
  }
  return { count: cards.length, directory: outputDirectory }
}

/**
 * 通过微信公众号官方 API 创建草稿；`request` 包含文章和本地凭据。
 */
async function syncWechatDraftByApi(
  request: Record<string, unknown>
): Promise<{ success: true; draftId: string; message: string }> {
  if (
    typeof request.appId !== 'string' ||
    typeof request.appSecret !== 'string' ||
    !request.appId ||
    !request.appSecret
  )
    throw new Error('微信公众号 API 发布需要 AppID 和 AppSecret')
  if (typeof request.title !== 'string' || typeof request.markdown !== 'string')
    throw new Error('微信公众号草稿缺少标题或正文')
  if (
    typeof request.cover !== 'string' ||
    !request.cover.startsWith('https://')
  )
    throw new Error('微信公众号草稿需要 HTTPS 封面图')
  // AccessToken 响应，保存公众号凭据换取的短期令牌。
  const tokenResponse = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(request.appId)}&secret=${encodeURIComponent(request.appSecret)}`
  )
  // AccessToken JSON，保存微信返回的令牌或错误码。
  const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>
  if (typeof tokenPayload.access_token !== 'string')
    throw new Error(
      `微信 AccessToken 获取失败：${String(tokenPayload.errmsg ?? tokenPayload.errcode ?? '未知错误')}`
    )
  // 封面响应，保存用户配置的 HTTPS 图片内容。
  const coverResponse = await fetch(request.cover)
  if (!coverResponse.ok)
    throw new Error(`封面下载失败：HTTP ${coverResponse.status}`)
  // 封面表单，保存上传永久缩略图素材所需的 multipart 数据。
  const coverForm = new FormData()
  coverForm.append(
    'media',
    new Blob([await coverResponse.arrayBuffer()], {
      type: coverResponse.headers.get('content-type') ?? 'image/png',
    }),
    'cover.png'
  )
  // 素材响应，保存微信永久素材上传结果。
  const materialResponse = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(tokenPayload.access_token)}&type=thumb`,
    { method: 'POST', body: coverForm }
  )
  // 素材 JSON，保存草稿 thumb_media_id 来源。
  const materialPayload = (await materialResponse.json()) as Record<
    string,
    unknown
  >
  if (typeof materialPayload.media_id !== 'string')
    throw new Error(
      `微信封面上传失败：${String(materialPayload.errmsg ?? materialPayload.errcode ?? '未知错误')}`
    )
  // 草稿响应，保存官方 draft/add 接口返回。
  const draftResponse = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(tokenPayload.access_token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: [
          {
            title: request.title,
            author: typeof request.author === 'string' ? request.author : '',
            digest: '',
            content: renderArticleHtml(request.title, request.markdown, false),
            content_source_url:
              typeof request.sourceUrl === 'string' ? request.sourceUrl : '',
            thumb_media_id: materialPayload.media_id,
            need_open_comment: Number(Boolean(request.needOpenComment)),
            only_fans_can_comment: Number(Boolean(request.onlyFansCanComment)),
          },
        ],
      }),
    }
  )
  // 草稿 JSON，保存媒体标识或微信错误信息。
  const draftPayload = (await draftResponse.json()) as Record<string, unknown>
  if (typeof draftPayload.media_id !== 'string')
    throw new Error(
      `微信草稿创建失败：${String(draftPayload.errmsg ?? draftPayload.errcode ?? '未知错误')}`
    )
  return {
    success: true,
    draftId: draftPayload.media_id,
    message: '已同步到微信公众号草稿箱',
  }
}

/**
 * 在平台持久会话窗口准备草稿；`platformId` 是平台，`title` 和 `markdown` 是发布内容。
 */
async function prepareDraftInPlatformWindow(
  platformId: string,
  title: string,
  markdown: string,
  accountId?: string
): Promise<{
  success: boolean
  draftId?: string
  message: string
  requiresLogin?: boolean
}> {
  // 创作入口，保存平台白名单对应的编辑页面。
  const publisherUrl = publisherUrlMap[platformId]
  if (!publisherUrl) throw new Error('暂不支持该发布平台')
  // 发布窗口，保存平台独立持久登录态和可见编辑页面。
  const publisherWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    title: `${platformId} 草稿同步`,
    webPreferences: {
      partition: getAccountPartition(platformId, accountId),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // 平台弹窗地址，保存公众号“新的创作”入口实际打开的编辑器 URL。
  let capturedPublisherUrl: string | null = null
  publisherWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      // 弹窗地址，保存通过 URL 解析校验的外部窗口目标。
      const candidateUrl = new URL(url)
      if (
        candidateUrl.protocol === 'https:' &&
        candidateUrl.hostname === 'mp.weixin.qq.com'
      )
        capturedPublisherUrl = candidateUrl.toString()
    } catch {
      // 业务场景：公众号会触发 `javascript:` 占位弹窗，不应覆盖已经完成的编辑器导航。
    }
    return { action: 'deny' }
  })
  await publisherWindow.loadURL(publisherUrl)
  // 页面地址，保存登录重定向判断和公众号编辑页跳转所需的最终 URL。
  let loadedUrl = publisherWindow.webContents.getURL()
  if (/login|passport|signin|auth/i.test(loadedUrl))
    return {
      success: false,
      requiresLogin: true,
      message: '请在打开的窗口完成登录后重试同步',
    }
  if (platformId === 'wechat') {
    // 入口点击结果，保存公众号首页是否识别并触发“新的创作 → 文章”。
    const creationOpened = (await publisherWindow.webContents
      .executeJavaScript(`(() => {
      const candidates = Array.from(document.querySelectorAll('a,button,[role=button],div')).filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
      const articleEntry = candidates.find((element) => element.textContent?.trim() === '文章');
      if (!(articleEntry instanceof HTMLElement)) return false;
      articleEntry.click();
      return true;
    })()`)) as boolean
    if (!creationOpened)
      return {
        success: false,
        message: '没有识别到公众号“新的创作 → 文章”入口，窗口已保留供人工检查',
      }
    await new Promise((resolve) => setTimeout(resolve, 800))
    // 点击后地址，保存公众号入口是否已经在当前窗口完成导航。
    const urlAfterCreationClick = publisherWindow.webContents.getURL()
    if (/cgi-bin\/home/.test(urlAfterCreationClick) && capturedPublisherUrl)
      await publisherWindow.loadURL(capturedPublisherUrl)
    loadedUrl = publisherWindow.webContents.getURL()
    if (/cgi-bin\/home/.test(loadedUrl))
      return {
        success: false,
        message: '公众号没有打开文章编辑器，窗口已保留供人工检查',
      }
    if (/login|passport|signin|auth/i.test(loadedUrl))
      return {
        success: false,
        requiresLogin: true,
        message: '公众号会话已过期，请重新登录后重试',
      }
  }
  // 安全请求 JSON，保存注入页面的标题和 Markdown 字符串。
  const requestJson = JSON.stringify({ title, markdown })
  // 填充结果，保存页面编辑器探测、输入与草稿按钮点击状态。
  const result = (await publisherWindow.webContents
    .executeJavaScript(`(async () => {
    const request = ${requestJson};
    const isVisible = (element) => element instanceof HTMLElement && element.offsetParent !== null;
    const findVisible = (selectors) => selectors.map((selector) => Array.from(document.querySelectorAll(selector)).find(isVisible)).find(Boolean);
    const titleSelectors = ['textarea[placeholder*=标题]','input[placeholder*=标题]','textarea[maxlength="64"]','[contenteditable=true][data-placeholder*=标题]','[contenteditable=true][aria-label*=标题]','.js_title','.appmsg-title','#title','input.title-input','input.article-bar__title','.ProseMirror'];
    const contentSelectors = ['.ProseMirror','.public-DraftEditor-content','textarea[placeholder*=正文]','textarea[placeholder*=内容]','.bytemd-editor textarea','[contenteditable=true]'];
    const deadline = Date.now() + 10000;
    let titleElement;
    let contentElement;
    while (Date.now() < deadline) {
      titleElement = findVisible(titleSelectors);
      contentElement = contentSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))).find((element) => element !== titleElement && isVisible(element));
      if (titleElement && contentElement) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const setValue = (element, value) => {
      if (!element) return false;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        setter?.call(element, value);
      } else {
        element.textContent = value;
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const titleFilled = setValue(titleElement, request.title);
    const contentFilled = setValue(contentElement, request.markdown);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const buttons = Array.from(document.querySelectorAll('button,[role=button]')).filter(isVisible);
    const draftButton = buttons.find((button) => ['保存草稿','保存为草稿','存草稿','保存至草稿箱'].some((label) => button.textContent?.replaceAll(' ', '').includes(label)));
    if (titleFilled && contentFilled && draftButton instanceof HTMLElement) draftButton.click();
    return { titleFilled, contentFilled, draftClicked: Boolean(titleFilled && contentFilled && draftButton) };
  })()`)) as {
    titleFilled?: boolean
    contentFilled?: boolean
    draftClicked?: boolean
  }
  if (!result.titleFilled && !result.contentFilled)
    return {
      success: false,
      message: '没有识别到平台编辑器，页面结构可能已更新；窗口已保留供人工检查',
    }
  if (!result.draftClicked)
    return {
      success: false,
      message:
        '内容已填入编辑器，但没有识别到保存草稿按钮；请在窗口中检查后手动保存',
    }
  return {
    success: true,
    draftId: `${platformId}_${Date.now().toString(36)}`,
    message: '已触发平台保存草稿，请在窗口确认平台成功提示',
  }
}

/**
 * 写入本地状态；`state` 是来自渲染进程的主题和发布配置。
 */
async function writeStoredState(state: unknown): Promise<void> {
  // 状态文件路径，保存本地 JSON 状态的位置。
  const stateFilePath = getStateFilePath()
  // 安全状态，保存已由系统钥匙串加密敏感凭据的磁盘副本。
  const protectedState = protectPublisherState(state, safeStorage)
  await writeJsonFile(stateFilePath, protectedState)
}

/**
 * 注册 IPC 存储接口；无参数，提供渲染进程安全读写本地状态的能力。
 */
function registerIpcHandlers(): void {
  if (autoUpdater) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
  }
  ipcMain.handle('app-update:check', async () => {
    // 业务场景：开发环境没有发布配置，不访问 GitHub Release。
    if (!app.isPackaged || !autoUpdater) return { available: false }
    try {
      // 检查结果，保存 electron-updater 返回的新版本信息。
      const result = await autoUpdater.checkForUpdates()
      // 新版本号，保存远端 Release 的语义化版本。
      const version = result?.updateInfo?.version
      return result?.isUpdateAvailable && version
        ? { available: true, version, downloaded: updateDownloaded }
        : { available: false }
    } catch {
      // 公开 Release 只保留用户安装包时可能没有更新元数据，检查失败应降级而不是影响应用使用。
      return { available: false }
    }
  })
  ipcMain.handle('app-update:download', async () => {
    if (!autoUpdater) throw new Error('应用更新模块不可用')
    // 业务场景：重复点击时复用同一 Promise，避免并发写入安装包。
    if (!updateDownloadPromise) {
      updateDownloadPromise = autoUpdater
        .downloadUpdate()
        .then(() => {
          updateDownloaded = true
          return { downloaded: true }
        })
        .finally(() => {
          updateDownloadPromise = null
        })
    }
    return updateDownloadPromise
  })
  ipcMain.handle('app-update:install', () => {
    if (!autoUpdater) throw new Error('应用更新模块不可用')
    if (!updateDownloaded) throw new Error('更新尚未下载完成')
    autoUpdater.quitAndInstall(false, true)
    return true
  })
  ipcMain.handle('visual-muse:get-state', async () => readStoredState())
  ipcMain.handle('visual-muse:set-state', async (_event, state: unknown) =>
    writeStoredState(state)
  )
  ipcMain.handle('visual-muse:get-workspace', async () => {
    // 磁盘工作区，保存尚未解密模型密钥的持久化数据。
    const storedWorkspace = await readJsonFile(getWorkspaceFilePath())
    return restoreWorkspaceState(storedWorkspace, safeStorage)
  })
  ipcMain.handle(
    'visual-muse:set-workspace',
    async (_event, state: unknown) => {
      // 安全工作区，保存已加密模型 API Key 的磁盘副本。
      const protectedWorkspace = protectWorkspaceState(state, safeStorage)
      return writeJsonFile(getWorkspaceFilePath(), protectedWorkspace)
    }
  )
  ipcMain.handle(
    'visual-muse:export-cards',
    async (_event, cards: string[], theme: unknown) =>
      exportImageCards(cards, theme)
  )
  ipcMain.handle(
    'visual-muse:generate-text',
    async (_event, request: unknown) => {
      if (!request || typeof request !== 'object')
        throw new Error('模型请求格式无效')
      // 请求字段，保存渲染进程提交的模型和提示词。
      const requestData = request as Record<string, unknown>
      // 模型配置，保存本地用户选择的 OpenAI 兼容服务参数。
      const model = requestData.model
      if (!model || typeof model !== 'object') throw new Error('缺少模型配置')
      // 模型字段，保存经过对象收窄后的连接信息。
      const modelData = model as Record<string, unknown>
      if (
        typeof modelData.baseUrl !== 'string' ||
        typeof modelData.model !== 'string' ||
        typeof modelData.apiKey !== 'string'
      )
        throw new Error('模型配置不完整')
      // 聊天补全地址，保存校验并规范化后的服务 URL。
      const completionUrl = buildChatCompletionUrl(modelData.baseUrl)
      // 模型响应，保存 OpenAI 兼容接口的 HTTP 返回。
      const response = await fetch(completionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modelData.apiKey}`,
        },
        body: JSON.stringify({
          model: modelData.model,
          messages: [
            { role: 'system', content: String(requestData.systemPrompt ?? '') },
            { role: 'user', content: String(requestData.userPrompt ?? '') },
          ],
          stream: false,
        }),
      })
      if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`)
      // 模型响应 JSON，保存第一个 assistant message 的来源对象。
      const payload = (await response.json()) as Record<string, unknown>
      // 候选结果，保存兼容接口返回的 choices 数组。
      const choices = Array.isArray(payload.choices) ? payload.choices : []
      // 首个消息，保存安全提取后的 assistant message。
      const firstMessage =
        choices[0] && typeof choices[0] === 'object'
          ? (choices[0] as Record<string, unknown>).message
          : null
      // 生成内容，保存最终返回渲染层的 Markdown 文本。
      const content =
        firstMessage && typeof firstMessage === 'object'
          ? (firstMessage as Record<string, unknown>).content
          : null
      if (typeof content !== 'string') throw new Error('模型响应缺少文本内容')
      return { content }
    }
  )
  ipcMain.handle(
    'visual-muse:fetch-trends',
    async (_event, sourceId: string) => {
      // 热榜地址，保存来源白名单对应的固定 API。
      const trendUrl = trendUrlMap[sourceId]
      if (!trendUrl) throw new Error('暂不支持该热榜来源')
      // 热榜响应，保存远端公开接口返回。
      const response = await fetch(trendUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 VisualMuse/1.0',
          Accept: 'application/json,text/plain,*/*',
        },
      })
      if (!response.ok) throw new Error(`热榜刷新失败：HTTP ${response.status}`)
      // 业务场景：目前只解析有稳定 JSON 契约的来源，HTML 来源明确返回空列表，不用字符串猜 DOM。
      if (!(response.headers.get('content-type') ?? '').includes('json'))
        return []
      return parseTrendPayload(sourceId, await response.json())
    }
  )
  ipcMain.handle(
    'visual-muse:open-account',
    async (_event, platformId: string, accountId?: string) => {
      // 登录地址，保存平台白名单中的固定站点。
      const loginUrl = publisherUrlMap[platformId]
      if (!loginUrl) throw new Error('不支持的账号平台')
      // 登录窗口，使用平台独立持久 partition，避免平台之间共享不相关站点数据。
      const loginWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        title: `${platformId} 登录`,
        webPreferences: {
          partition: getAccountPartition(platformId, accountId),
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      await loginWindow.loadURL(loginUrl)
      return true
    }
  )
  ipcMain.handle(
    'visual-muse:open-account-settings',
    async (_event, platformId: string, accountId?: string) => {
      if (platformId !== 'wechat')
        throw new Error('当前平台不支持 API 凭据设置')
      // 凭据窗口，保存与指定公众号账号槽位共用的持久会话。
      const settingsWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        title: '微信公众号 API 凭据',
        webPreferences: {
          partition: getAccountPartition(platformId, accountId),
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      await settingsWindow.loadURL(publisherUrlMap.wechat)
      // 后台地址，保存公众号登录重定向后的临时 token 来源。
      const homeUrl = new URL(settingsWindow.webContents.getURL())
      // 临时 token，保存本次进入官方开发接口管理页所需的会话参数。
      const token = homeUrl.searchParams.get('token')
      if (!token) return false
      // 开发设置地址，保存迁移后的微信开发者平台业务控制台；旧公众号开发页只用于确认账号登录态。
      const settingsUrl =
        'https://developers.weixin.qq.com/console/index?tab1=business&tab2=dev'
      await settingsWindow.loadURL(settingsUrl)
      return true
    }
  )
  ipcMain.handle(
    'visual-muse:check-account',
    async (_event, platformId: string, accountId?: string) => {
      // 平台域名，保存登录检测 Cookie 查询范围。
      const accountDomain = accountDomainMap[platformId]
      if (!accountDomain) throw new Error('不支持的账号平台')
      // 平台会话，保存与登录窗口同一持久 partition 的 Session。
      const accountSession = session.fromPartition(
        getAccountPartition(platformId, accountId)
      )
      // 会话 Cookie，作为站点是否建立过会话的初步信号。
      const cookies = await accountSession.cookies.get({
        domain: accountDomain,
      })
      return cookies.length > 0
        ? {
            authenticated: false,
            message: '已发现站点会话，请打开登录窗口复检明确账号状态',
          }
        : { authenticated: false, message: '尚未发现站点会话，请先登录' }
    }
  )
  ipcMain.handle(
    'visual-muse:logout-account',
    async (_event, platformId: string, accountId?: string) => {
      if (!accountDomainMap[platformId]) throw new Error('不支持的账号平台')
      // 平台会话，保存目标账号槽位对应的持久 Session。
      const accountSession = session.fromPartition(
        getAccountPartition(platformId, accountId)
      )
      await accountSession.clearStorageData()
      return true
    }
  )
  ipcMain.handle('visual-muse:import-assets', async () => {
    // 文件选择结果，保存用户显式选择的图片素材路径。
    const result = await dialog.showOpenDialog({
      title: '导入创作素材',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(
    'visual-muse:crop-wechat-cover',
    async (_event, sourcePath: string) => {
      if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath))
        throw new Error('封面素材路径无效')
      // 原始图片，保存用户通过系统选择器授权的本地素材。
      const sourceImage = nativeImage.createFromPath(sourcePath)
      if (sourceImage.isEmpty()) throw new Error('无法读取封面图片')
      // 目标宽高，保存微信公众号封面的固定像素尺寸。
      const targetWidth = 900
      const targetHeight = 383
      // 原始尺寸，保存等比缩放和居中裁切计算依据。
      const sourceSize = sourceImage.getSize()
      // 缩放比例，保存完整覆盖目标画布所需倍率。
      const scale = Math.max(
        targetWidth / sourceSize.width,
        targetHeight / sourceSize.height
      )
      // 缩放图片，保存覆盖目标尺寸后的临时位图。
      const resizedImage = sourceImage.resize({
        width: Math.ceil(sourceSize.width * scale),
        height: Math.ceil(sourceSize.height * scale),
        quality: 'best',
      })
      // 缩放尺寸，保存居中裁切的偏移计算依据。
      const resizedSize = resizedImage.getSize()
      // 裁切图片，保存 900×383 居中封面结果。
      const croppedImage = resizedImage.crop({
        x: Math.floor((resizedSize.width - targetWidth) / 2),
        y: Math.floor((resizedSize.height - targetHeight) / 2),
        width: targetWidth,
        height: targetHeight,
      })
      // 输出目录，保存公众号封面派生素材位置。
      const outputDirectory = path.join(
        app.getPath('documents'),
        'Visual Muse',
        'assets',
        'wechat-covers'
      )
      await fs.mkdir(outputDirectory, { recursive: true })
      // 输出路径，保存带时间戳且不会覆盖旧封面的 PNG 文件。
      const outputPath = path.join(
        outputDirectory,
        `wechat-cover-${Date.now().toString(36)}.png`
      )
      await fs.writeFile(outputPath, croppedImage.toPNG())
      return { filePath: outputPath, width: targetWidth, height: targetHeight }
    }
  )
  ipcMain.handle('visual-muse:clear-cache', async () => {
    await session.defaultSession.clearCache()
    return true
  })
  ipcMain.handle('visual-muse:get-mcp-config', () => {
    // MCP 入口脚本，保存开发与打包环境都存在的编译产物路径。
    const mcpEntryPath = path.join(
      app.getAppPath(),
      'dist-electron',
      'mcpServer.js'
    )
    // Electron 可执行文件，配合 ELECTRON_RUN_AS_NODE 作为无需系统 Node 的 MCP 启动器。
    const command = process.execPath
    // MCP 数据目录，保存与桌面端 userData 共用的工作区位置。
    const dataDirectory = app.getPath('userData')
    // 公共环境变量，保存 Electron Node 模式和工作区路径。
    const environment = {
      ELECTRON_RUN_AS_NODE: '1',
      VISUAL_MUSE_DATA_DIR: dataDirectory,
    }
    // Cursor 配置，保存 JSON 格式的 MCP Server 定义。
    const cursor = JSON.stringify(
      {
        mcpServers: {
          'visual-muse': { command, args: [mcpEntryPath], env: environment },
        },
      },
      null,
      2
    )
    // TOML 字符串值，保存经过 JSON 引号转义的安全配置字面量。
    const tomlValue = (value: string): string => JSON.stringify(value)
    // Codex 配置，保存可追加到 config.toml 的 MCP Server 定义。
    const codex = `[mcp_servers.visual-muse]\ncommand = ${tomlValue(command)}\nargs = [${tomlValue(mcpEntryPath)}]\n\n[mcp_servers.visual-muse.env]\nELECTRON_RUN_AS_NODE = "1"\nVISUAL_MUSE_DATA_DIR = ${tomlValue(dataDirectory)}\n`
    return { cursor, codex }
  })
  ipcMain.handle('visual-muse:sync-draft', async (_event, request: unknown) => {
    if (!request || typeof request !== 'object')
      throw new Error('草稿同步请求格式无效')
    // 草稿字段，保存平台、标题、正文和可选公众号凭据。
    const requestData = request as Record<string, unknown>
    if (
      typeof requestData.platformId !== 'string' ||
      typeof requestData.title !== 'string' ||
      typeof requestData.markdown !== 'string'
    )
      throw new Error('草稿同步缺少平台、标题或正文')
    if (requestData.platformId === 'wechat' && requestData.mode === 'api')
      return syncWechatDraftByApi(requestData)
    return prepareDraftInPlatformWindow(
      requestData.platformId,
      requestData.title,
      requestData.markdown,
      typeof requestData.accountId === 'string'
        ? requestData.accountId
        : undefined
    )
  })
  ipcMain.handle(
    'visual-muse:import-article-url',
    async (_event, rawUrl: string) => {
      if (typeof rawUrl !== 'string') throw new Error('文章链接格式无效')
      // 文章地址，保存用户输入并完成协议校验的 URL。
      const articleUrl = new URL(rawUrl)
      if (articleUrl.protocol !== 'https:')
        throw new Error('文章导入只允许 HTTPS 地址')
      // 导入窗口，保存无 Node 权限的隐藏页面解析环境。
      const importWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      try {
        await importWindow.loadURL(articleUrl.toString())
        // 页面文章，保存从语义化 article/main 容器读取的结构化文本块。
        const article = (await importWindow.webContents
          .executeJavaScript(`(() => {
        const root = document.querySelector('article') || document.querySelector('main') || document.body;
        const title = document.querySelector('h1')?.textContent?.trim() || document.title || '导入文章';
        const blocks = Array.from(root.querySelectorAll('h1,h2,h3,h4,p,blockquote,li,pre,img')).slice(0, 2000).map((element) => {
          const tag = element.tagName.toLowerCase();
          if (tag === 'img') return element.getAttribute('src') ? '![' + (element.getAttribute('alt') || '') + '](' + element.getAttribute('src') + ')' : '';
          const text = element.textContent?.trim() || '';
          if (!text) return '';
          if (tag === 'h1') return '# ' + text;
          if (tag === 'h2') return '## ' + text;
          if (tag === 'h3') return '### ' + text;
          if (tag === 'h4') return '#### ' + text;
          if (tag === 'blockquote') return text.split('\\n').map((line) => '> ' + line).join('\\n');
          if (tag === 'li') return '- ' + text;
          if (tag === 'pre') { const fence = String.fromCharCode(96).repeat(3); return fence + '\\n' + text + '\\n' + fence; }
          return text;
        }).filter(Boolean);
        return { title, markdown: '---\\ntitle: ' + title.replaceAll('\\n', ' ') + '\\nsource_url: ' + location.href + '\\n---\\n\\n' + blocks.join('\\n\\n') };
      })()`)) as { title?: unknown; markdown?: unknown }
        if (
          typeof article.title !== 'string' ||
          typeof article.markdown !== 'string'
        )
          throw new Error('页面没有可导入的正文')
        return { title: article.title, markdown: article.markdown }
      } finally {
        importWindow.destroy()
      }
    }
  )
  ipcMain.handle('visual-muse:import-markdown', async () => {
    // 文件选择结果，保存用户显式选择的单个 Markdown 路径。
    const result = await dialog.showOpenDialog({
      title: '导入 Markdown',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    // Markdown 路径，保存系统选择器返回的授权文件。
    const markdownPath = result.filePaths[0]
    return {
      title: path.basename(markdownPath, path.extname(markdownPath)),
      markdown: await fs.readFile(markdownPath, 'utf-8'),
    }
  })
  ipcMain.handle('visual-muse:import-skill', async () => {
    // 文件选择结果，保存用户显式选择的 SKILL.md 或普通 Markdown 模板。
    const result = await dialog.showOpenDialog({
      title: '导入 Skill',
      properties: ['openFile'],
      filters: [{ name: 'Skill Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    // Skill 路径，保存系统选择器授权的 Markdown 文件。
    const skillPath = result.filePaths[0]
    // Skill 提示词，保存文件完整 UTF-8 正文。
    const prompt = await fs.readFile(skillPath, 'utf-8')
    // Skill 名称，保存标准 SKILL.md 的父目录名或普通 Markdown 文件名。
    const name =
      path.basename(skillPath).toLowerCase() === 'skill.md'
        ? path.basename(path.dirname(skillPath))
        : path.basename(skillPath, path.extname(skillPath))
    return { name, category: '导入', prompt }
  })
  ipcMain.handle(
    'visual-muse:export-article',
    async (_event, request: unknown) => {
      if (!request || typeof request !== 'object')
        throw new Error('导出请求格式无效')
      // 导出字段，保存文章标题、Markdown 和格式。
      const requestData = request as Record<string, unknown>
      if (
        typeof requestData.title !== 'string' ||
        typeof requestData.markdown !== 'string' ||
        typeof requestData.format !== 'string'
      )
        throw new Error('导出请求缺少文章内容')
      // 格式映射，保存白名单格式对应的文件扩展名。
      const extensionMap: Record<string, string> = {
        md: 'md',
        html: 'html',
        'pure-html': 'html',
        pdf: 'pdf',
      }
      // 文件扩展名，保存校验后的导出类型。
      const extension = extensionMap[requestData.format]
      if (!extension) throw new Error('不支持的导出格式')
      // 保存选择结果，保存用户确认的导出目标路径。
      const result = await dialog.showSaveDialog({
        title: '导出文章',
        defaultPath: `${createSafeFileName(requestData.title)}.${extension}`,
      })
      if (result.canceled || !result.filePath) return null
      if (requestData.format === 'pdf') {
        // PDF 窗口，保存文章完整 HTML 的隐藏打印环境。
        const printWindow = new BrowserWindow({
          width: 900,
          height: 1200,
          show: false,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        })
        try {
          await printWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(renderArticleHtml(requestData.title, requestData.markdown, true))}`
          )
          // PDF 数据，保存 Chromium printToPDF 的输出字节。
          const pdfData = await printWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
          })
          await fs.writeFile(result.filePath, pdfData)
        } finally {
          printWindow.destroy()
        }
        return { filePath: result.filePath }
      }
      // 导出正文，保存 MD、完整 HTML 或纯 HTML 的最终字符串。
      const content =
        requestData.format === 'md'
          ? requestData.markdown
          : renderArticleHtml(
              requestData.title,
              requestData.markdown,
              requestData.format === 'html'
            )
      await fs.writeFile(result.filePath, content, 'utf-8')
      return { filePath: result.filePath }
    }
  )
  ipcMain.handle('visual-muse:bind-content-folder', async () => {
    // 目录选择结果，保存用户显式授权的本地内容目录。
    const result = await dialog.showOpenDialog({
      title: '绑定本地 Markdown 目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    // 授权目录，保存经过 path.resolve 规范化的绝对路径。
    const directoryPath = path.resolve(result.filePaths[0])
    await fs.writeFile(getContentDirectoryFilePath(), directoryPath, 'utf-8')
    return directoryPath
  })
  ipcMain.handle(
    'visual-muse:sync-content-folder',
    async (_event, documents: unknown) => {
      // 绑定目录，保存此前由系统选择器授权的路径，不接受渲染进程自报目录。
      const directoryPath = (
        await fs.readFile(getContentDirectoryFilePath(), 'utf-8')
      ).trim()
      if (!path.isAbsolute(directoryPath))
        throw new Error('本地内容目录绑定无效')
      // 磁盘文稿，保存同步开始时目录中的 Markdown 文件。
      const diskDocuments = await readMarkdownDirectory(directoryPath)
      // 渲染文稿，保存经过数组收窄后的当前工作区内容。
      const workspaceDocuments = Array.isArray(documents)
        ? (documents.filter(
            (document) => document && typeof document === 'object'
          ) as Array<Record<string, unknown>>)
        : []
      for (const document of workspaceDocuments) {
        if (
          typeof document.content !== 'string' ||
          typeof document.title !== 'string'
        )
          continue
        // 已有文件路径，保存仅在绑定目录内部才允许覆盖的目标。
        const existingPath =
          typeof document.filePath === 'string'
            ? path.resolve(document.filePath)
            : null
        // 新文件路径，保存无合法已有路径时按安全标题生成的目标。
        const targetPath =
          existingPath && existingPath.startsWith(`${directoryPath}${path.sep}`)
            ? existingPath
            : path.join(
                directoryPath,
                `${createSafeFileName(document.title)}.md`
              )
        // 磁盘同名文稿，保存冲突比较使用的已有对象。
        const diskDocument = diskDocuments.find(
          (item) => item.filePath === targetPath
        )
        // 工作区更新时间，保存决定双向同步方向的时间戳。
        const workspaceUpdatedAt =
          typeof document.updatedAt === 'string'
            ? new Date(document.updatedAt).getTime()
            : 0
        // 业务场景：磁盘文件更新时保留磁盘版本；工作区较新或文件不存在时写入磁盘。
        if (
          !diskDocument ||
          workspaceUpdatedAt > new Date(diskDocument.updatedAt).getTime()
        )
          await fs.writeFile(targetPath, document.content, 'utf-8')
      }
      return readMarkdownDirectory(directoryPath)
    }
  )
  ipcMain.handle('visual-muse:copy-text', (_event, text: string) =>
    clipboard.writeText(text)
  )
  ipcMain.handle(
    'visual-muse:open-publisher',
    async (_event, platformId: string) => {
      // 创作入口地址，保存平台白名单中与请求 ID 对应的固定 URL。
      const publisherUrl = publisherUrlMap[platformId]

      // 业务场景：未知平台 ID 不允许被拼成任意外链，避免渲染进程滥用系统浏览器。
      if (!publisherUrl) {
        throw new Error('不支持的发布平台')
      }

      await shell.openExternal(publisherUrl)
    }
  )
  ipcMain.handle(
    'visual-muse:prepare-publisher',
    async (_event, request: unknown) => platformPublisher.prepare(request)
  )
}

/**
 * 创建 Electron 主窗口；无参数，负责加载开发服务器或打包后的静态页面。
 */
function createWindow(): void {
  // macOS 业务场景：主窗口仍存在但被隐藏时，Dock 激活应直接恢复而不是创建重复窗口。
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  // 当前模块文件路径，用于推导 preload 脚本位置。
  const currentFilePath = fileURLToPath(import.meta.url)
  // 当前模块目录路径，用于定位构建产物。
  const currentDirPath = path.dirname(currentFilePath)
  // 主窗口实例，承载 Visual Muse 渲染进程。
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'Visual Muse',
    backgroundColor: '#141414',
    icon: app.isPackaged ? undefined : DEVELOPMENT_APP_ICON_PATH,
    // E2E 仍创建真实渲染进程，但隐藏窗口以避免抢占用户桌面焦点。
    show: !isE2E,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Bug 修复：项目为 ESM，编译后的 preload.js 无法在当前隔离上下文稳定执行；CommonJS preload 确保 IPC 桥真实暴露。
      preload: path.join(currentDirPath, '../electron/preload.cjs'),
    },
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 开发环境加载 Vite 服务，生产环境加载本地 HTML。
  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(currentDirPath, '../dist/index.html'))
  }
}

registerIpcHandlers()

void app.whenReady().then(() => {
  // macOS E2E 隐藏 Dock 图标，避免后台测试切换用户当前操作的前台应用。
  if (isE2E) app.dock?.hide()
  // Bug 修复：未打包 Electron 默认显示框架图标；开发态显式设置项目图标，打包态继续使用安装包资源。
  if (process.platform === 'darwin' && !app.isPackaged && !isE2E) {
    app.dock?.setIcon(DEVELOPMENT_APP_ICON_PATH)
  }
  createWindow()

  app.on('activate', () => {
    // Bug 修复：平台窗口会让全局窗口数大于零；应按主工作台本身是否存在决定恢复或重建。
    createWindow()
  })
})

app.on('window-all-closed', () => {
  // macOS 业务场景：保留应用生命周期，其它平台关闭全部窗口后退出。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
