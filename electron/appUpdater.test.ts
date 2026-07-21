import { describe, expect, it, vi } from 'vitest'
import { loadAutoUpdater, resolveAutoUpdater } from './appUpdater.js'

describe('appUpdater', () => {
  it('兼容 CommonJS 默认导出的 autoUpdater', () => {
    // updater 存储模拟的真实更新器实例。
    const updater = {}
    expect(resolveAutoUpdater({ default: { autoUpdater: updater } })).toBe(
      updater
    )
  })

  it('模块加载失败时安全降级', async () => {
    // importUpdater 模拟打包环境中模块解析失败。
    const importUpdater = vi.fn().mockRejectedValue(new Error('load failed'))
    await expect(loadAutoUpdater(importUpdater, true)).resolves.toBeNull()
  })
})
