/** 系统安全存储适配器；由 Electron safeStorage 提供实际加解密能力。 */
export interface SecureStorageAdapter {
  /** 系统当前是否支持安全加密。 */
  isEncryptionAvailable: () => boolean
  /** 将明文凭据加密为二进制数据；`value` 是待保护字符串。 */
  encryptString: (value: string) => Buffer
  /** 将二进制密文还原为明文；`value` 是系统安全存储生成的数据。 */
  decryptString: (value: Buffer) => string
}

/** 密文前缀，用于区分历史明文与系统安全存储生成的值。 */
const encryptedValuePrefix = 'visual-muse-secure:v1:'

/** 判断未知值是否为可安全复制的普通对象；`value` 是待检查数据。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 加密非空凭据；`value` 是明文，`storage` 是 Electron 安全存储适配器。 */
function encryptCredential(
  value: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith(encryptedValuePrefix)
  )
    return value
  if (!storage.isEncryptionAvailable())
    throw new Error('系统安全存储当前不可用，无法保存敏感凭据')
  // 密文内容，保存系统安全存储返回的二进制数据。
  const encryptedValue = storage.encryptString(value).toString('base64')
  return `${encryptedValuePrefix}${encryptedValue}`
}

/** 解密带标记的凭据并兼容历史明文；`value` 是磁盘值，`storage` 是安全存储适配器。 */
function decryptCredential(
  value: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (typeof value !== 'string' || !value.startsWith(encryptedValuePrefix))
    return value
  // Base64 密文，保存去除格式版本前缀后的系统密文。
  const encryptedValue = value.slice(encryptedValuePrefix.length)
  return storage.decryptString(Buffer.from(encryptedValue, 'base64'))
}

/** 保护发布配置中的敏感字段；`state` 是渲染进程状态，`storage` 是安全存储适配器。 */
export function protectPublisherState(
  state: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (!isRecord(state) || !isRecord(state.settings)) return state
  // 发布配置，保存移除明文凭据后的磁盘副本。
  const settings = state.settings
  return {
    ...state,
    settings: {
      ...settings,
      appSecret: encryptCredential(settings.appSecret, storage),
      apiKey: encryptCredential(settings.apiKey, storage),
    },
  }
}

/** 还原发布配置中的敏感字段；`state` 是磁盘状态，`storage` 是安全存储适配器。 */
export function restorePublisherState(
  state: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (!isRecord(state) || !isRecord(state.settings)) return state
  // 发布配置，保存解密后返回渲染进程的内存副本。
  const settings = state.settings
  return {
    ...state,
    settings: {
      ...settings,
      appSecret: decryptCredential(settings.appSecret, storage),
      apiKey: decryptCredential(settings.apiKey, storage),
    },
  }
}

/** 保护工作区模型密钥；`state` 是工作区状态，`storage` 是安全存储适配器。 */
export function protectWorkspaceState(
  state: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (!isRecord(state) || !Array.isArray(state.models)) return state
  // 模型配置，保存逐项移除明文 API Key 后的磁盘副本。
  const models = state.models.map((model) =>
    isRecord(model)
      ? { ...model, apiKey: encryptCredential(model.apiKey, storage) }
      : model
  )
  return { ...state, models }
}

/** 还原工作区模型密钥；`state` 是磁盘状态，`storage` 是安全存储适配器。 */
export function restoreWorkspaceState(
  state: unknown,
  storage: SecureStorageAdapter
): unknown {
  if (!isRecord(state) || !Array.isArray(state.models)) return state
  // 模型配置，保存逐项解密 API Key 后返回渲染进程的内存副本。
  const models = state.models.map((model) =>
    isRecord(model)
      ? { ...model, apiKey: decryptCredential(model.apiKey, storage) }
      : model
  )
  return { ...state, models }
}
