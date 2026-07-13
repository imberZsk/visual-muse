import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";

describe("Visual Muse 工作台", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.visualMuseStore;
    delete window.visualMuseDesktop;
  });

  test("默认使用深色主题并展示参考平台", async () => {
    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: /微信公众号/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /知乎/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今日头条/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Medium/ })).toBeInTheDocument();
  });

  test("可以切换浅色主题", async () => {
    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    fireEvent.click(screen.getByRole("switch", { name: "主题切换" }));

    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-theme", "light");
  });

  test("切换平台后展示对应发布能力", async () => {
    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    fireEvent.click(screen.getByRole("button", { name: /知乎/ }));

    expect(screen.getByText(/适配知乎编辑器/)).toBeInTheDocument();
    expect(screen.getByText("知乎内容准备")).toBeInTheDocument();
    expect(screen.queryByLabelText("AppID")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开知乎创作中心" })).toBeInTheDocument();
  });

  test("掘金可以复制正文且不需要账号凭据", async () => {
    // 剪贴板写入探针，用来验证桌面端只接收文章内容。
    const copyText = vi.fn().mockResolvedValue(undefined);

    window.visualMuseDesktop = {
      copyText,
      openPublisher: vi.fn().mockResolvedValue(undefined),
    };

    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    fireEvent.click(screen.getByRole("button", { name: /掘金/ }));
    fireEvent.click(screen.getByRole("button", { name: "复制正文" }));

    await waitFor(() => expect(copyText).toHaveBeenCalledWith(expect.stringContaining("# Visual Muse 深色工作台")));
    expect(screen.getByText(/无需提供账号密码、Cookie 或 Token/)).toBeInTheDocument();
  });

  test("掘金通过白名单 API 打开创作中心", async () => {
    // 创作入口探针，用来验证渲染进程只传递平台 ID。
    const openPublisher = vi.fn().mockResolvedValue(undefined);

    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher,
    };

    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    fireEvent.click(screen.getByRole("button", { name: /掘金/ }));
    fireEvent.click(screen.getByRole("button", { name: "打开掘金创作中心" }));

    await waitFor(() => expect(openPublisher).toHaveBeenCalledWith("juejin"));
  });

  test("缺少标题时预检展示错误", async () => {
    render(<App />);

    // Markdown 输入框，用来模拟用户粘贴一篇缺少 frontmatter 标题的文章。
    const editor = await screen.findByLabelText("Markdown 编辑器");
    fireEvent.change(editor, { target: { value: "# 没有标题\n\n正文" } });
    fireEvent.click(screen.getByRole("button", { name: "发布预检" }));

    expect(screen.getByText("缺少文章标题")).toBeInTheDocument();
  });

  test("模拟发布会显示 loading 并生成成功记录", async () => {
    render(<App />);

    await screen.findByLabelText("Markdown 编辑器");
    // 发布按钮，用来验证异步操作期间的禁用和 loading 状态。
    const publishButton = screen.getByRole("button", { name: "模拟发布" });
    fireEvent.click(publishButton);

    expect(publishButton).toHaveClass("ant-btn-loading");
    expect(await screen.findByText("发布模拟成功")).toBeInTheDocument();
    expect(screen.getByText(/mock_wechat_/)).toBeInTheDocument();
  });

  test("读取持久化配置完成前不会用默认值覆盖旧配置", async () => {
    // 状态读取完成函数，用来控制 Electron 配置加载的完成时机。
    let resolveStoredState:
      | ((state: {
          themeMode: "light";
          settings: {
            appId: string;
            appSecret: string;
            serverUrl: string;
            apiKey: string;
            proxyUrl: string;
            defaultTheme: string;
          };
        }) => void)
      | undefined;
    // 状态读取 Promise，用来模拟桌面端较慢的磁盘读取。
    const storedStatePromise = new Promise<{
      themeMode: "light";
      settings: {
        appId: string;
        appSecret: string;
        serverUrl: string;
        apiKey: string;
        proxyUrl: string;
        defaultTheme: string;
      };
    }>((resolve) => {
      resolveStoredState = resolve;
    });
    // 状态写入探针，用来确认初始化前没有发生覆盖写入。
    const setState = vi.fn().mockResolvedValue(undefined);

    window.visualMuseStore = {
      getState: vi.fn(() => storedStatePromise),
      setState,
    };

    render(<App />);

    expect(setState).not.toHaveBeenCalled();
    resolveStoredState?.({
      themeMode: "light",
      settings: {
        appId: "saved-app-id",
        appSecret: "",
        serverUrl: "",
        apiKey: "",
        proxyUrl: "",
        defaultTheme: "default",
      },
    });

    expect(await screen.findByDisplayValue("saved-app-id")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("app-shell")).toHaveAttribute("data-theme", "light"));
    delete window.visualMuseStore;
  });
});
