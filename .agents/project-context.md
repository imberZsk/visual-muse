# 项目上下文

Visual Muse 是 Electron + React + TypeScript 桌面工作台，用于整理文章素材、编辑发布内容并维护多平台发布前的本地配置。

- Node.js `>=22.12.0`，包管理器 `pnpm@11.13.0`。
- 技术栈：Electron、React 19、TypeScript、Ant Design 6、Vite、Vitest。
- Vite 开发地址为 `127.0.0.1:5173`，Electron 通过 `VITE_DEV_SERVER_URL` 连接。
- 主进程构建到 `dist-electron/`，渲染进程构建到 `dist/`。

```bash
pnpm run lint
pnpm test
pnpm run build:ui
pnpm start
pnpm run dist
pnpm run dist:win
```
