# Visual Muse

Visual Muse 是一个 Electron 桌面工作台，用于整理文章素材、编辑发布内容，并维护多平台发布前的本地配置。

官网文档框架：<https://visual-muse-docs.netlify.app>

## 技术栈

- Electron + Vite
- React 19 + TypeScript
- Ant Design 6
- marked
- Vitest + jsdom
- electron-builder

## 开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm test          # 运行全部测试
pnpm run build:ui  # 类型检查 + Electron 主进程编译 + 渲染进程构建
pnpm start         # 构建后以生产模式启动 Electron
pnpm run dist      # 打包 macOS arm64 DMG
pnpm run dist:win  # 打包 Windows x64 安装包 + 便携版
```

## 项目结构

```text
electron/          Electron 主进程与 preload
src/               React 渲染进程、领域逻辑和测试
dist-electron/     Electron 主进程编译产物，不提交仓库
dist/              Vite 构建产物，不提交仓库
```

## 本地数据

应用通过 Electron `userData` 目录保存主题和发布配置，当前不上传任何本地内容。
