/** 更新器实例使用到的最小接口，避免依赖 CommonJS 包的命名类型导出。 */
export interface AppUpdater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates: () => Promise<{
    isUpdateAvailable?: boolean
    updateInfo?: { version?: string }
  } | null>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
}

/** 从动态导入结果中解析更新器；`updaterModule` 是 CommonJS/ESM 模块命名空间。 */
export function resolveAutoUpdater(updaterModule: unknown): AppUpdater | null {
  // moduleNamespace 存储经过空值与类型保护的模块命名空间。
  const moduleNamespace =
    updaterModule && typeof updaterModule === 'object'
      ? (updaterModule as Record<string, unknown>)
      : null
  // commonJsExports 存储 CommonJS 包在不同打包环境中的导出对象。
  const commonJsExports =
    moduleNamespace?.default && typeof moduleNamespace.default === 'object'
      ? (moduleNamespace.default as Record<string, unknown>)
      : moduleNamespace?.['module.exports'] &&
          typeof moduleNamespace['module.exports'] === 'object'
        ? (moduleNamespace['module.exports'] as Record<string, unknown>)
        : null
  // Bug 修复：打包后更新器可能只挂在默认导出下，不能假设命名导出始终存在。
  return (moduleNamespace?.autoUpdater ||
    commonJsExports?.autoUpdater ||
    null) as AppUpdater | null
}

/** 加载打包环境更新器；参数分别为导入函数和是否已打包。 */
export async function loadAutoUpdater(
  importUpdater: () => Promise<unknown>,
  isPackaged: boolean
): Promise<AppUpdater | null> {
  if (!isPackaged) return null
  try {
    // updaterModule 存储动态导入得到的模块命名空间。
    const updaterModule = await importUpdater()
    return resolveAutoUpdater(updaterModule)
  } catch {
    // 更新能力加载失败不能阻断桌面应用启动。
    return null
  }
}
