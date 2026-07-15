import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoUpdater } from 'electron-updater'

/** 本地状态文件名，用于保存主题和发布配置。 */
const stateFileName = 'visual-muse-state.json'

/** 安装包是否已完整下载，用于阻止提前安装。 */
let updateDownloaded = false
/** 正在执行的下载任务，用于合并重复点击。 */
let updateDownloadPromise: Promise<{ downloaded: boolean }> | null = null

/** 平台创作入口白名单，用于限制渲染进程只能打开已审核的 HTTPS 地址。 */
const publisherUrlMap: Record<string, string> = {
  wechat: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/creator',
  toutiao: 'https://mp.toutiao.com/',
  juejin: 'https://juejin.cn/editor/drafts/new?v=2',
  csdn: 'https://editor.csdn.net/md/',
  medium: 'https://medium.com/new-story',
}

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
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  ipcMain.handle('app-update:check', async () => {
    // 业务场景：开发环境没有发布配置，不访问 GitHub Release。
    if (!app.isPackaged) return { available: false }
    // 检查结果，保存 electron-updater 返回的新版本信息。
    const result = await autoUpdater.checkForUpdates()
    // 新版本号，保存远端 Release 的语义化版本。
    const version = result?.updateInfo?.version
    return version
      ? { available: true, version, downloaded: updateDownloaded }
      : { available: false }
  })
  ipcMain.handle('app-update:download', async () => {
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
}

/**
 * 创建 Electron 主窗口；无参数，负责加载开发服务器或打包后的静态页面。
 */
function createWindow(): void {
  // 当前模块文件路径，用于推导 preload 脚本位置。
  const currentFilePath = fileURLToPath(import.meta.url)
  // 当前模块目录路径，用于定位构建产物。
  const currentDirPath = path.dirname(currentFilePath)
  // 主窗口实例，承载 Visual Muse 渲染进程。
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'Visual Muse',
    backgroundColor: '#020617',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDirPath, 'preload.js'),
    },
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
  createWindow()

  app.on('activate', () => {
    // macOS 业务场景：Dock 图标唤起时，如果没有窗口则重新创建。
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // macOS 业务场景：保留应用生命周期，其它平台关闭全部窗口后退出。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
