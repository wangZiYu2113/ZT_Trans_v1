# 知选 / ZY Trans

划一下，框一下，马上解释。

这是按照 `ai-term-explainer-project-plan.md` 落地的 AI 划词与框选解释助手 MVP 工程。当前版本完成了 Tauri + React + TypeScript 项目骨架、手动文本解释、OpenAI-compatible 流式调用、Prompt 自动路由、设置页、历史记录、本地缓存，以及 Tauri 侧划词/快捷键/OCR 命令边界。

## 已完成

- React 工作台：手动输入文本并解释。
- 模式切换：自动、股票、英语、翻译、通用。
- Prompt 模板：内置四类模板，设置页可修改并恢复默认。
- OpenAI-compatible API：支持 `Base URL`、`API Key`、模型名和流式输出。
- 本地缓存：相同文本、模式、模型和 Prompt 版本命中缓存。
- 历史记录：保存最近 100 条，可收藏。
- 活动查询管理：新查询会取消旧请求，关闭/取消时中断流式连接。
- Tauri 后端结构：已注册 `Ctrl+Shift+E` 和 `Ctrl+Shift+S`，支持向前端发送划词/框选事件。
- 划词命令：模拟复制、读取剪贴板，并尽量恢复原剪贴板内容。

## 尚需接入

- Visual Studio C++ Build Tools 安装后运行 Tauri 桌面端。
- 全屏遮罩、鼠标拖拽选区、截图裁剪。
- Windows.Media.Ocr 真实 OCR 调用。
- SQLite 持久化替换当前浏览器 `localStorage` 适配层。
- 安装包图标与发布流水线。

## 本地开发

当前机器已检测到 Node/npm，并已安装 Rust。前端可先运行：

```powershell
npm install
npm run dev
```

浏览器打开 Vite 输出的地址后，可以先验证手动解释、设置、缓存和历史记录。

要运行桌面端，需要安装 Windows C++ Build Tools。Rust 默认安装到
`C:\Users\<用户名>\.cargo\bin`，如果当前终端找不到 `cargo`，重启终端或把该目录加入 `PATH`。

Windows 还必须能找到 MSVC 链接器 `link.exe`。如果 `cargo check` 报
`linker link.exe not found`，请打开 Visual Studio Installer，安装或修改
`Build Tools for Visual Studio`，勾选：

- `Desktop development with C++`
- `MSVC v143` 或当前最新版 MSVC
- `Windows 10 SDK` 或 `Windows 11 SDK`

安装完成后重启终端，再执行：

```powershell
npm run tauri dev
```

## API 配置

打开设置页，填写：

- `API Base URL`：例如 `https://api.openai.com/v1`，或 DeepSeek、通义、月之暗面、Ollama 等兼容地址。
- `API Key`：对应服务商密钥。
- `模型`：对应模型名称。

## 目录结构

```text
src
  components      React UI 组件
  lib             LLM、Prompt、存储、Tauri 适配
  styles          设计变量和布局样式
src-tauri
  src             Rust/Tauri 命令与生命周期模块
  capabilities    Tauri 权限声明
```

## 下一步建议

1. 安装 Visual Studio C++ Build Tools，跑通 `npm run tauri dev`。
2. 将 `src/lib/storage.ts` 替换为 Tauri SQLite command。
3. 实现 `src-tauri/src/capture.rs` 和 `src-tauri/src/ocr.rs`。
4. 将快捷键设置页与 Tauri 全局快捷键注册同步。
