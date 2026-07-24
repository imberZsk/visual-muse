# 架构约束

- `electron/main.ts` 负责窗口和主进程能力，`electron/preload.ts` 只暴露受限 API。
- `src/` 放 React 渲染层与领域逻辑；可测试业务规则放 `src/domain` 或相邻纯函数。
- 渲染进程不得直接使用 Node fs、shell 或 Electron 主进程模块。
- 本地文件、系统调用和持久化能力通过 preload 白名单进入主进程。
- 页面专用逻辑留在页面，只有真实复用时才抽离共享组件或函数。
- 修改共享模块前搜索全部调用方，确认所有场景安全。
- Electron 与渲染进程使用不同 TypeScript 构建目标，不得混用环境类型。
