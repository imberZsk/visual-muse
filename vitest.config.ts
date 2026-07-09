import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * 配置 Vitest 测试环境；无参数，返回 React 组件测试所需的 jsdom 与 setup 设置。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
