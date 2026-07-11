# 知译

知译是一个轻量级 Windows 桌面解释工具，用于把划词文本或框选 OCR 文本发送给 OpenAI-compatible 模型，并在小窗口中快速展示解释结果。

核心目标是轻量、简便、稳定：不强依赖云端 OCR，不需要复杂工作流，尽量保持桌面端即开即用。

## 功能

- 选中文本后按全局快捷键，自动发送给模型解释。
- 框选屏幕区域，截图写入剪贴板后进行本地 Windows OCR。
- OCR 和划词结果统一使用可拖拽的小窗口展示。
- 支持 OpenAI-compatible Chat Completions 流式输出。
- 支持自动、股票、英语、翻译、通用五种模式。
- 可配置 API 地址、API Key、模型、提示词和全局快捷键。
- 历史记录支持收藏、删除、清空和导出。
- 本地缓存重复请求结果。
- 本地日志记录关键生命周期事件，便于排查问题。
- 主窗口可关闭隐藏到后台，系统托盘可恢复窗口或退出应用。

## 下载安装

Windows 安装包会发布到 GitHub Releases。

当前本地构建产物：

```text
src-tauri/target/release/bundle/nsis/知译_0.1.0_x64-setup.exe
```

开发模式需要本地 Vite 端口；打包后的 exe 不需要本地服务端口。

## 使用前配置

打开应用设置页，填写：

- `API Base URL`：例如 `https://api.openai.com/v1`
- `API Key`：对应服务商密钥
- `模型`：服务商支持的模型名称
- 划词快捷键和框选快捷键

注意：不要把真实 API Key 提交到仓库。

## 本地开发

安装依赖：

```powershell
npm install
```

只启动前端：

```powershell
npm run dev
```

启动桌面端开发模式：

```powershell
npm run desktop:dev
```

前端构建：

```powershell
npm run build
```

Rust 检查：

```powershell
cd src-tauri
cargo check
```

打包桌面安装包：

```powershell
npm run desktop:build
```

## 项目结构

```text
src/
  App.tsx                 主流程
  CaptureOverlay.tsx      全屏框选遮罩
  ResultPopup.tsx         结果弹窗
  components/             React UI 组件
  lib/                    模型、提示词、存储、Tauri 封装
  styles/                 样式
src-tauri/
  src/lib.rs              Tauri 命令、托盘、快捷键、窗口
  src/ocr.rs              截图和 Windows OCR
  src/selection.rs        Windows 划词读取
  src/app_log.rs          本地日志
```

更多架构说明见 [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md)。

## 文档

- [CHANGELOG.md](CHANGELOG.md)：版本日志
- [ROADMAP.md](ROADMAP.md)：后续计划
- [README.md](README.md)：英文说明

## 许可证

MIT，见 `src-tauri/Cargo.toml`。
