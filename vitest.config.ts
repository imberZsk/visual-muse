import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * 配置 Vitest 测试环境；无参数，返回 React 组件测试所需的 jsdom 与 setup 设置，以及 v8 覆盖率配置。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      // 覆盖率采集引擎，使用与 vite 一致的 v8 原生覆盖率。
      provider: 'v8',
      // 覆盖率报告格式，text 供命令行查看，html 供本地浏览详情。
      reporter: ['text', 'html', 'json'],
      // 覆盖率统计范围，只统计 src 下的业务源码（ts/tsx）。
      include: ['src/**/*.{ts,tsx}'],
      // 覆盖率排除项，去掉测试文件、测试环境 setup、类型声明和入口挂载文件。
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/main.tsx',
      ],
    },
  },
})
