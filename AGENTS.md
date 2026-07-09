# AGENTS.md

本文件为 AI 编码助手在本仓库工作时提供指导。

> 交流、注释、文档统一使用中文。

## 项目概述

Visual Muse 是一个 Electron + React + TypeScript 桌面工作台，用于整理文章素材、编辑发布内容，并维护多平台发布前的本地配置。

## 常用命令

```bash
pnpm install         # 安装依赖
pnpm dev             # 开发模式：Vite 5173 + Electron 热联调
pnpm run build:ui    # 类型检查 + Electron 主进程编译 + 渲染进程构建
pnpm start           # 构建后以生产模式启动 Electron
pnpm test            # 运行全部测试
pnpm run test:watch  # watch 模式
pnpm run dist        # 打包 macOS arm64 DMG，产物在 release/
pnpm run dist:win    # 打包 Windows x64 安装包 + 便携版，需在 Windows 上运行
```

## 架构

```text
electron/          Electron 主进程与 preload
src/               React 渲染进程、领域逻辑和测试
```

渲染进程必须保持 `contextIsolation: true` 与 `nodeIntegration: false`。新增本地文件、系统调用或持久化能力时，优先通过 preload 暴露受限 API，并把可测试逻辑放在 `src/domain` 或独立纯函数中。

## 开发约定

- 代码注释规则见全局 AGENTS.md：函数/方法、变量必须添加用途说明；非显而易见分支说明业务场景；复杂逻辑/workaround 注释 WHY。
- 容易阻塞的任务需要异步处理并提供 loading 状态。
- 开发 UI 时优先考虑 Ant Design 是否已有合适组件。
- 不要提交构建产物、覆盖率报告、`.superpowers/`、`docs/superpowers/`、`.npmrc` 或 npm/yarn 锁文件。
