import { describe, expect, it } from 'vitest'
import {
  protectPublisherState,
  protectWorkspaceState,
  restorePublisherState,
  restoreWorkspaceState,
  type SecureStorageAdapter,
} from '../../electron/secureState'

/** 创建可预测的测试加密适配器；`available` 控制系统安全存储可用状态。 */
function createStorage(available = true): SecureStorageAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf-8'),
    decryptString: (value) =>
      value.toString('utf-8').replace(/^encrypted:/, ''),
  }
}

describe('secure state', () => {
  it('加密发布凭据并能无损回读', () => {
    // 明文状态，模拟渲染进程提交的公众号和服务端凭据。
    const state = {
      themeMode: 'light',
      settings: {
        appId: 'wx-id',
        appSecret: 'wechat-secret',
        apiKey: 'server-key',
      },
    }
    // 磁盘状态，保存经过系统安全存储保护后的副本。
    const protectedState = protectPublisherState(state, createStorage())
    expect(JSON.stringify(protectedState)).not.toContain('wechat-secret')
    expect(JSON.stringify(protectedState)).not.toContain('server-key')
    expect(restorePublisherState(protectedState, createStorage())).toEqual(
      state
    )
  })

  it('加密所有模型 API Key 并保留非敏感字段', () => {
    // 工作区状态，模拟多个本地模型配置。
    const state = {
      activeDocumentId: 'doc-1',
      models: [{ id: 'model-1', name: '主模型', apiKey: 'model-secret' }],
    }
    // 磁盘工作区，保存模型密钥被替换后的副本。
    const protectedState = protectWorkspaceState(state, createStorage())
    expect(JSON.stringify(protectedState)).not.toContain('model-secret')
    expect(restoreWorkspaceState(protectedState, createStorage())).toEqual(
      state
    )
  })

  it('兼容历史明文并拒绝在系统加密不可用时写入新凭据', () => {
    // 历史状态，模拟升级前已经存在的明文 AppSecret。
    const legacyState = { settings: { appSecret: 'legacy-secret', apiKey: '' } }
    expect(restorePublisherState(legacyState, createStorage())).toEqual(
      legacyState
    )
    expect(() =>
      protectPublisherState(legacyState, createStorage(false))
    ).toThrow('系统安全存储当前不可用')
  })
})
