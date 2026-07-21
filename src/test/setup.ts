import "@testing-library/jest-dom/vitest";

// matchMedia 模拟对象，用于满足 Ant Design 在 jsdom 中的响应式判断。
const matchMediaMock = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: matchMediaMock,
});

// ResizeObserver 模拟类，用于满足 Ant Design 组件测量逻辑。
class ResizeObserverMock {
  /**
   * 开始观察元素尺寸；无参数，测试环境不需要真实测量。
   */
  observe(): void {
    return undefined;
  }

  /**
   * 停止观察单个元素；无参数，测试环境不需要真实测量。
   */
  unobserve(): void {
    return undefined;
  }

  /**
   * 断开所有尺寸观察；无参数，测试环境不需要真实测量。
   */
  disconnect(): void {
    return undefined;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});
