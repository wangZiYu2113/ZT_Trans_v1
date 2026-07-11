# 知选最终项目架构

## 1. 项目定位

知选是一个 Windows 桌面端轻量解释工具，用于：

- 选中文本后按快捷键，自动读取选区并发送给模型解释。
- 框选屏幕区域后截图、OCR、清洗文字，并发送给模型解释。
- 在主窗口保存历史、缓存结果、配置模型和提示词。
- OCR 框选后弹出独立小窗口，展示模型回答。

## 2. 技术栈

- 桌面框架：Tauri 2
- 前端：React 18 + TypeScript + Vite
- 后端：Rust
- UI 图标：lucide-react
- 本地 OCR：Windows Media OCR
- 划词读取：Windows UI Automation
- 模型接口：OpenAI-compatible Chat Completions streaming API
- 本地数据：localStorage

## 3. 目录结构

```text
ZY_Trans_v1/
├─ src/
│  ├─ App.tsx                         # 主窗口工作台、设置、查询流程
│  ├─ CaptureOverlay.tsx              # 全屏截图框选遮罩
│  ├─ ResultPopup.tsx                 # OCR 后弹出的结果小窗口
│  ├─ components/
│  │  ├─ FloatingResult.tsx           # 主窗口结果展示
│  │  ├─ FormattedAnswer.tsx          # 模型回答基础排版
│  │  ├─ HistoryPanel.tsx             # 历史记录
│  │  ├─ ModeTabs.tsx                 # 模式切换
│  │  └─ SettingsPanel.tsx            # API、模型、提示词设置
│  ├─ lib/
│  │  ├─ defaults.ts                  # 默认设置
│  │  ├─ llm.ts                       # 流式模型调用
│  │  ├─ prompts.ts                   # 默认提示词和模式识别
│  │  ├─ resultWindow.ts              # 结果小窗口创建与事件同步
│  │  ├─ storage.ts                   # 设置、历史、缓存
│  │  ├─ tauri.ts                     # 前端 Tauri 调用封装
│  │  └─ types.ts                     # 共享类型
│  └─ styles/
│     ├─ app.css                      # 主界面与结果窗口样式
│     ├─ capture.css                  # 截图遮罩样式
│     └─ theme.css                    # 主题变量
├─ src-tauri/
│  ├─ capabilities/default.json       # Tauri 权限
│  ├─ src/
│  │  ├─ lib.rs                       # Tauri 命令、窗口、全局快捷键
│  │  ├─ lifecycle.rs                 # 查询生命周期状态
│  │  ├─ ocr.rs                       # 截图、剪贴板图片、OCR、预处理
│  │  └─ selection.rs                 # Windows UI Automation 划词读取
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ scripts/
│  ├─ desktop-build.cmd               # 桌面端打包
│  └─ desktop-dev.cmd                 # 桌面端开发启动
└─ PROJECT_ARCHITECTURE.md
```

## 4. 窗口架构

### main

主应用窗口，负责：

- 手动输入解释
- 划词解释
- 框选 OCR 入口
- 模型设置
- Prompt 设置
- 历史和缓存展示

### capture-*

Rust 动态创建的全屏透明窗口，负责：

- 显示淡遮罩
- 鼠标拖拽选择截图区域
- Esc 取消
- 将选区坐标发送给 Rust 后端

每次截图使用唯一窗口 label，避免重复截图时报 `webview already exists`。

### result

前端动态创建的小窗口，负责：

- OCR 识别后自动弹出
- 展示识别文本
- 流式展示模型回答
- 支持复制和关闭

主窗口通过 Tauri event 和 localStorage snapshot 同步结果，避免窗口刚创建时丢失首帧数据。

## 5. 核心流程

### 5.1 划词解释流程

```text
用户选中文本
  ↓
Ctrl+Shift+E
  ↓
Tauri global-shortcut
  ↓
Rust selection.rs 通过 Windows UI Automation 读取当前选区
  ↓
emit 到 main 窗口
  ↓
App.runQuery()
  ↓
llm.ts 流式请求模型
  ↓
主窗口展示、写入历史、写入缓存
```

### 5.2 框选 OCR 流程

```text
Ctrl+Shift+S 或点击“框选 OCR”
  ↓
Rust 创建 capture-* 全屏透明窗口
  ↓
用户框选区域
  ↓
Rust GDI 截图
  ↓
原始截图写入剪贴板并保存到临时目录
  ↓
生成增强 OCR 图
  ↓
Windows OCR 同时尝试增强图和原图
  ↓
选择更可信文本并清洗空白字符
  ↓
前端打开 result 小窗口
  ↓
App.runQuery()
  ↓
模型流式回答同步到 main 和 result
  ↓
写入历史和缓存
```

## 6. OCR 设计

当前 OCR 使用本地 Windows OCR，优点是：

- 不额外消耗 API
- 延迟低
- 不上传截图

已实现的准确率优化：

- 原图保存和剪贴板写入
- OCR 专用增强图
- 小图自动放大
- 灰度、对比度、亮度预处理
- 原图和增强图双路识别
- 按有效字符数量选择更可信结果
- 删除空格、换行和零宽字符后再发送模型

可扩展方向：

- 增加 API OCR 兜底
- 增加 OCR 语言选择
- 根据截图尺寸或识别结果长度自动决定是否走 API OCR

## 7. 模型调用设计

模型调用位于 `src/lib/llm.ts`，兼容 OpenAI Chat Completions streaming 格式。

配置项：

- API Base URL
- API Key
- Model
- 请求超时
- 默认模式
- 自定义 Prompt

回答生成使用流式输出，主窗口和 OCR 小窗口都会实时更新。

## 8. Prompt 设计

Prompt 位于 `src/lib/prompts.ts`。

当前模式：

- auto：自动判断
- finance：股票/财报/金融术语
- english：英语学习
- translate：翻译
- general：通用解释

统一输出结构：

```text
【结论】一句话说明核心意思。
【要点】2-4 条短要点。
【补充】必要背景、例子、注意事项或 OCR 误差。
```

前端 `FormattedAnswer` 会识别这些结构并进行基础排版。

## 9. 本地数据

使用 localStorage 保存：

- `zy-trans:settings`：用户设置
- `zy-trans:history`：最近 100 条历史
- `zy-trans:cache`：模型回答缓存
- `zy-trans:result-window`：结果小窗口最新快照

缓存 key 包含：

- providerId
- model
- mode
- promptVersion
- normalizedText

Prompt 变化时通过提升 `PROMPT_VERSION` 使旧缓存失效。

## 10. 构建与启动

开发启动：

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

桌面端打包：

```powershell
npm run desktop:build
```

生成的安装包位置：

```text
src-tauri/target/release/bundle/nsis/
```

## 11. 后续优先级

1. API OCR 兜底：提升复杂截图和低清文字识别率。
2. 可配置快捷键：当前设置里能记录快捷键文本，后续需要动态注册。
3. 结果小窗口定位：后续可根据鼠标位置或框选区域附近弹出。
4. OCR 语言选择：适配中英混排、纯英文、数字表格等场景。
5. 安装包图标和签名：完善正式发布体验。
