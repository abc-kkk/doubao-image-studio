# CLAUDE.md — doubao-tauri

Claude Code 在此项目中的工作指南。

## 项目概述

**豆包生图助手** —— 通过 Chrome 扩展劫持豆包网页 AI 生图接口，提供本地桌面端图片生成与管理的工具。

核心能力：文生图、图生图（参考图上传）、比例控制、批量生成、图片画廊管理。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面端 UI | Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 |
| 状态管理 | Zustand |
| 后端服务 | Node.js + Express + WebSocket (ws) |
| 数据库 | SQLite (better-sqlite3) |
| 图片处理 | Sharp |
| Chrome 扩展 | TypeScript + Vite CRX (doubao-extension/) |

## 项目结构

```
doubao-tauri/
├── src/                          # Tauri 桌面端前端 (React)
│   ├── components/
│   │   ├── canvas/               # 画布区域: CanvasArea, ImageCard, ImageLightbox, ImageBatch
│   │   ├── chat/                 # 文字聊天视图: ChatView
│   │   ├── common/               # 通用组件: Button, Modal, Toast
│   │   ├── compressor/           # 图片压缩工具: CompressorView
│   │   ├── gallery/              # 画廊面板: GalleryPanel, GalleryItem
│   │   ├── layout/               # 布局: AppShell (根组件), Navbar
│   │   ├── settings/             # 设置: SettingsModal, ApiDocModal
│   │   └── toolbar/              # 工具栏: PromptBar, ModelSelector, AspectRatioSelector
│   ├── hooks/
│   │   ├── useImageGeneration.ts # 生图核心 hook
│   │   ├── useGallery.ts         # 画廊逻辑
│   │   └── useWebSocket.ts       # WebSocket 连接管理
│   ├── services/
│   │   ├── doubaoApi.ts          # 调用后端 REST API
│   │   ├── chromeWorker.ts       # Chrome 扩展通信 (Tauri HTTP)
│   │   └── imageStorage.ts       # 图片本地存储
│   ├── store/                    # Zustand stores
│   │   ├── imageStore.ts         # 图片列表状态
│   │   ├── settingsStore.ts      # 用户设置
│   │   ├── navStore.ts           # 导航状态 (当前视图)
│   │   └── notificationStore.ts  # 通知状态
│   ├── types/index.ts            # 全局类型定义
│   └── App.tsx                   # React 根组件
│
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/
│   │   └── lib.rs                # 核心 Rust 逻辑 (窗口管理、Tauri commands)
│   ├── tauri.conf.json           # Tauri 配置 (identifier: com.ios.doubao-assistant)
│   ├── build.rs                  # 构建钩子 (server 目录内联)
│   └── Info.plist                # macOS 配置
│
├── server/                       # Node.js 中间层服务
│   ├── src/
│   │   ├── app.js                # Express 入口 (REST: 8010, WS: 8081)
│   │   ├── controllers/
│   │   │   ├── chat.controller.js  # 聊天 SSE 端点
│   │   │   └── image.controller.js # 图片生成端点
│   │   ├── routes/
│   │   │   ├── chat.routes.js
│   │   │   └── image.routes.js
│   │   └── services/
│   │       ├── websocket.service.js # WebSocket 管理，扩展连接 ws://localhost:8081/ws
│   │       ├── ai.service.js         # AI 调用逻辑 (路由到 modelscope/siliconflow)
│   │       ├── image.service.js      # 图片处理 (Sharp)
│   │       ├── db.service.js         # SQLite 操作
│   │       ├── modelscope.service.js # ModelScope 图片生成
│   │       └── siliconflow.service.js # SiliconFlow 图片生成
│   ├── images/                   # 生成图片存储目录
│   └── data/metadata.db          # SQLite 数据库
│
├── doubao-extension/             # Chrome 扩展 (MV3)
│   ├── manifest.json            # Manifest V3 配置
│   ├── src/
│   │   ├── background/
│   │   │   └── index.ts         # Service Worker，连接 ws://localhost:8081/ws
│   │   ├── content/
│   │   │   ├── index.ts          # Content Script 入口，DOM 操作、fetch 劫持
│   │   │   └── dom/
│   │   │       ├── selectors.ts  # DOM 选择器常量 (豆包页面频繁变化，统一维护)
│   │   │       └── injector.ts   # DOM 注入工具
│   │   └── hook.ts              # 拦截豆包页面 fetch/XHR，捕获流式响应
│   └── dist/                     # 构建输出 (加载扩展时选择此目录)
│
└── dist/                         # Tauri 前端构建输出
```

## 核心数据流

```
用户输入 Prompt (桌面端)
  → Tauri 前端 useImageGeneration
  → doubaoApi.ts 发 HTTP POST /api/images/generate 到后端 (localhost:8010)
  → websocket.service.js 通过 WebSocket 转发 GENERATE 消息
  → Chrome 扩展 background/index.ts 接收
  → content/index.ts 的 processPrompt() 操控豆包页面 DOM
  → hook.ts 拦截豆包返回的流式响应 (SSE)
  → DOUBAO_CHUNK 消息逐步返回图片 URL
  → background/index.ts 回传 RESPONSE 给后端
  → 后端通过 HTTP Response 返回给桌面端
  → 图片展示在画廊
```

## WebSocket 协议 (扩展 ↔ 后端)

扩展连接时注册:
```json
{ "type": "REGISTER", "models": ["doubao-pro", "doubao-pro-image"] }
```

生图请求:
```json
{ "type": "GENERATE", "model": "doubao-pro-image", "requestId": "...", "text": "...",
  "referenceImages": [], "aspectRatio": "1:1", "switch_to_image_mode": false }
```

进度推送:
```json
{ "type": "PROGRESS", "requestId": "...", "text": "..." }
```

结果返回:
```json
{ "type": "RESPONSE", "requestId": "...", "content": { "parts": [
    { "text": "..." },
    { "imageUrl": "...", "thumbnailUrl": "...", "width": 1024, "height": 1024 }
  ] } }
```

## 开发命令

```bash
# 启动桌面端开发服务 (Tauri)
npm run tauri dev

# 仅启动前端 (Vite)
npm run dev

# 启动后端服务 (必须先启动)
cd server && node src/app.js

# 构建 Chrome 扩展 (输出到 doubao-extension/dist)
cd doubao-extension && npm run build

# 构建 Tauri 桌面端
npm run tauri build
```

## 重要约束

1. **标签页焦点**：扩展操控豆包页面时，禁止使用 `chrome.tabs.update({ active: true })` 抢夺用户焦点，改用 `dispatchEvent` 模拟用户操作。
2. **DOM 选择器**：豆包页面 DOM 结构频繁变化，选择器统一维护在 `doubao-extension/src/content/dom/selectors.ts`，修改时只改这一处。
3. **图片引用**：图生图的参考图上传逻辑在 `content/index.ts` 的 `uploadReferenceImages()` 函数，是核心功能，修改需谨慎测试。
4. **后端端口**：REST API 在 `8010`，WebSocket 在 `8081`（同一个 server，`/ws` 路径）。
5. **扩展构建**：主力扩展在 `doubao-extension/`（TypeScript + Vite CRX）。构建后加载 `doubao-extension/dist` 目录。
6. **图片存储**：生成的图片元数据存 SQLite，图片文件存 `server/images/`。

## 常见问题

- **扩展连不上**：检查 `server/` 是否已启动 (`cd server && node src/app.js`)
- **豆包页面找不到输入框**：更新 `selectors.ts` 中的 DOM 选择器
- **图生图失败**：检查参考图上传逻辑，豆包的上传 input 选择器可能变了
- **流式响应断流**：检查 `hook.ts` 中的 SSE 事件解析逻辑
