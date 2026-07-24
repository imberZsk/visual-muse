# IPC 规范

- 新系统能力同步检查 `electron/main.ts`、`electron/preload.ts`、渲染层类型、调用方与测试。
- 保持 `contextIsolation: true` 与 `nodeIntegration: false`，不暴露原始 `ipcRenderer`、fs 或 shell。
- preload 只暴露命名明确的最小 API；路径和对象在主进程再次校验。
- 返回值保持稳定、可序列化，不跨进程传 Error、函数或 Electron 对象。
- 事件订阅必须提供取消方式，组件卸载时清理；窗口或接口结果在访问前判空。
- 可测试逻辑放领域模块或纯函数，主进程只保留副作用与编排。
