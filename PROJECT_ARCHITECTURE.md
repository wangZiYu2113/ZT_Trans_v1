# 知译项目架构

## 1. 项目定位

知译是一个 Windows 桌面端轻量解释工具：

- 选中文本后按全局快捷键，自动读取选区并发送给模型解释。
- 框选屏幕区域后截图、写入剪贴板、OCR、清洗文本，并发送给模型解释。
- OCR 和划词结果统一使用可拖拽的小窗口展示。
- 主窗口负责手动输入、设置、历史、缓存和日志入口。
- 主窗口关闭时可选择隐藏到后台或退出应用；隐藏主窗口不影响结果弹窗。
- 隐藏到后台时保留系统托盘图标，可双击恢复或右键退出。

## 2. 技术栈

- 桌面框架：Tauri 2
- 前端：React 18 + TypeScript + Vite
- 后端：Rust
- UI 图标：lucide-react
- 本地 OCR：Windows Media OCR
- 划词读取：Windows UI Automation
- 模型接口：OpenAI-compatible Chat Completions streaming API
- 本地数据：localStorage + Tauri app log dir

## 3. 目录结构

```text
ZY_Trans_v1/
├─ src/
│  ├─ App.tsx                         # 主窗口工作台、设置、查询生命周期
│  ├─ CaptureOverlay.tsx              # 全屏截图框选遮罩
│  ├─ ResultPopup.tsx                 # 结果弹窗
│  ├─ components/
│  │  ├─ FloatingResult.tsx           # 主窗口结果展示
│  │  ├─ FormattedAnswer.tsx          # 模型回答基础排版
│  │  ├─ HistoryPanel.tsx             # 历史删除、清空、导出
│  │  ├─ ModeTabs.tsx                 # 模式切换
│  │  └─ SettingsPanel.tsx            # API、模型、快捷键、关闭行为、Prompt 设置
│  ├─ lib/
│  │  ├─ answerQuality.ts             # 回答后处理
│  │  ├─ defaults.ts                  # 默认设置
│  │  ├─ llm.ts                       # 流式模型调用
│  │  ├─ prompts.ts                   # 默认提示词和模式识别
│  │  ├─ resultWindow.ts              # 结果弹窗创建与事件同步
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
│  │  ├─ app_log.rs                   # 本地日志
│  │  ├─ lib.rs                       # Tauri 命令、窗口、托盘、全局快捷键、关闭行为
│  │  ├─ lifecycle.rs                 # 查询生命周期状态
│  │  ├─ ocr.rs                       # 截图、剪贴板图片、OCR、预处理
│  │  └─ selection.rs                 # Windows UI Automation 划词读取
│  ├─ Cargo.toml
│  └─ tauri.conf.json
└─ scripts/
   ├─ desktop-build.cmd
   └─ desktop-dev.cmd
```

## 4. 核心流程

### 划词解释

```text
用户选中文本
  -> 全局快捷键
  -> Rust global-shortcut
  -> selection.rs 读取当前选区
  -> emit 到 main 窗口
  -> App.runQuery()
  -> llm.ts 流式请求模型
  -> 主窗口与 result 弹窗同步展示
  -> 写入历史、缓存、日志
```

### 框选 OCR

```text
快捷键或按钮触发
  -> Rust 创建 capture-* 全屏透明窗口
  -> 用户框选区域
  -> Rust GDI 截图
  -> 原始截图写入剪贴板并保存临时文件
  -> Windows OCR 识别原图与增强图
  -> 前端删除空格、换行、零宽字符
  -> App.runQuery()
  -> result 弹窗流式展示模型回答
  -> 写入历史、缓存、日志
```

## 5. 本地数据

- `zy-trans:settings`：用户设置。
- `zy-trans:history`：最近 100 条历史。
- `zy-trans:cache`：模型回答缓存。
- `zy-trans:result-window`：结果弹窗最近快照。
- `zy-trans.log`：Tauri app log dir 下的本地日志文件。

历史导出格式：

```text
[时间戳]
问题：
...

回答：
...

---
```

## 6. 质量控制

- Prompt 强制结论、要点、补充三段式，限制长度和开场白。
- `answerQuality.ts` 在最终响应完成后清理客套话、多余空行和标题空格。
- `FormattedAnswer` 对模型回答做基础排版。
- 快捷键、OCR、模型请求、历史操作写入本地日志，便于复盘崩溃或误触发。
- 全局快捷键由设置动态注册，避免客户端不在最上层时失效。
- 主窗口关闭行为由设置控制：隐藏到后台或退出应用。
- 系统托盘提供后台运行提示、恢复主窗口和退出入口，避免隐藏后用户无法感知进程仍在运行。

## 7. 构建与检查

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

安装包输出：

```text
src-tauri/target/release/bundle/nsis/
```

## 8. 后续优先级

1. 增加 API OCR 兜底，用于复杂截图、低清文字和表格。
2. 增加托盘菜单，提供显示主窗口、退出、暂停快捷键。
3. 增加 OCR 语言选择与识别结果编辑确认。
4. 增加异常日志查看器和一键导出诊断包。
5. 完善安装包图标、签名和自动更新。
