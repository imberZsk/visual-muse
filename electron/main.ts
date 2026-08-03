import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAutoUpdater } from './appUpdater.js'
import {
  PlatformPublisher,
  realPublisherUrlMap,
  type RealPublishPlatformId,
} from './platformPublisher.js'

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
 * 读取本地状态；无参数，返回保存过的主题和发布配置。
 */
async function readStoredState(): Promise<unknown | null> {
  // 状态文件路径，保存本地 JSON 状态的位置。
  const stateFilePath = getStateFilePath()

  try {
    // 状态文件内容，保存从磁盘读取到的 JSON 字符串。
    const rawState = await fs.readFile(stateFilePath, 'utf-8')

    return JSON.parse(rawState) as unknown
  } catch (error) {
    // 业务场景：第一次启动没有状态文件，应返回空状态而不是报错。
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

/**
 * 写入本地状态；`state` 是来自渲染进程的主题和发布配置。
 */
async function writeStoredState(state: unknown): Promise<void> {
  // 状态文件路径，保存本地 JSON 状态的位置。
  const stateFilePath = getStateFilePath()
  // 状态目录路径，保存状态文件所在目录。
  const stateDirPath = path.dirname(stateFilePath)

  await fs.mkdir(stateDirPath, { recursive: true })
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf-8')
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
