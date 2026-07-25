import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 拆分第三方依赖块；`id` 是 Rollup 传入的模块绝对路径。
 */
function manualChunks(id: string): string | undefined {
  // 模块路径，保存统一分隔符后的依赖文件路径。
  const normalizedId = id.replaceAll("\\", "/");

  // 业务场景：只拆分第三方依赖，应用源码保持在主业务块中。
  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  // 业务场景：React 运行时是所有组件的基础依赖，单独缓存更稳定。
  if (normalizedId.includes("/react/") || normalizedId.includes("/react-dom/") || normalizedId.includes("/scheduler/")) {
    return "react-vendor";
  }

  // 业务场景：Ant Design 顶层组件和 rc 基础组件互相引用，合在同块可避免循环 chunk。
  if (normalizedId.includes("/antd/") || normalizedId.includes("/@ant-design/")) {
    return "antd-core";
  }

  // 业务场景：rc 组件族是 Ant Design 的基础依赖，合并到同一缓存块。
  if (normalizedId.includes("/rc-") || normalizedId.includes("/@rc-component/")) {
    return "antd-core";
  }

  // 业务场景：图标和 Markdown 渲染是可独立缓存的小型能力。
  if (normalizedId.includes("/lucide-react/") || normalizedId.includes("/@ant-design/icons/")) {
    return "icons-vendor";
  }

  // 业务场景：Markdown 渲染器单独拆分，便于后续替换或懒加载。
  if (normalizedId.includes("/marked/")) {
    return "markdown-vendor";
  }

  return "vendor";
}

/**
 * 配置 Vite 渲染进程构建；无参数，返回 React 桌面界面的构建设置。
 */
export default defineConfig({
  // Electron 生产模式通过 file:// 加载 dist，资源路径必须使用相对路径。
  base: "./",
  // clearScreen 保留 Electron 主进程与 Vite 日志，便于排查启动问题。
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  plugins: [react()],
  test: {
    // exclude 存储由 Playwright 独立执行的 Electron E2E，避免 Vitest 重复收集。
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // strictPort 避免 Vite 静默漂移端口后 Electron 仍连接旧地址。
    strictPort: true,
  },
});
